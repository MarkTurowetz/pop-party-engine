"use strict";

const fs = require("fs");
const path = require("path");
const {
  createReleaseRecord,
  requiredIdempotencyKey,
  stableHash
} = require("../packages/engine/src/server/revisioned-content-store-runtime");
const {
  createGithubGitDataRuntime,
  normalizeRef
} = require("../packages/engine/src/server/github-git-data-runtime");
const { createGithubContentBundleStore } = require("../packages/engine/src/server/github-content-bundle-store");
const { createLocalContentBundleProvider } = require("../packages/engine/src/server/local-content-bundle-provider");

const ACTIVE_RELEASE_PATH = "active-release.json";
const PUBLISHED_REVISIONS_PATH = "published-revisions.json";
const exactVersionPattern = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

function jsonBytes(value) {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function parseJson(bytes, logicalPath) {
  try {
    return JSON.parse(Buffer.from(bytes).toString("utf8"));
  } catch (error) {
    throw new Error(`Release state JSON is invalid at ${logicalPath}: ${error.message}`);
  }
}

function parseArguments(argv) {
  const result = {
    command: "",
    engineVersion: "",
    operationKey: "",
    releaseRef: "heads/game-releases",
    contentRoot: "apps/reference/content",
    stateFile: ""
  };
  const values = [...argv];
  result.command = String(values.shift() || "");
  if (!["activate", "rollback"].includes(result.command)) {
    throw new Error("First argument must be activate or rollback");
  }
  for (let index = 0; index < values.length; index += 1) {
    const argument = values[index];
    if (argument === "--engine-version") result.engineVersion = String(values[++index] || "");
    else if (argument === "--operation-key") result.operationKey = String(values[++index] || "");
    else if (argument === "--release-ref") result.releaseRef = String(values[++index] || "");
    else if (argument === "--content-root") result.contentRoot = String(values[++index] || "");
    else if (argument === "--state-file") result.stateFile = String(values[++index] || "");
    else throw new Error(`Unknown argument: ${argument}`);
  }
  result.releaseRef = normalizeRef(result.releaseRef);
  requiredIdempotencyKey(result.operationKey);
  if (!result.stateFile) throw new Error("Missing required --state-file");
  if (result.command === "activate" && !exactVersionPattern.test(result.engineVersion)) {
    throw new Error("Activation requires an exact --engine-version");
  }
  return result;
}

function validateReleaseRecord(release) {
  if (!release || typeof release !== "object") throw new Error("Active release record is missing");
  const expected = createReleaseRecord(release, release.previousReleaseRevision || "");
  if (expected.releaseRevision !== release.releaseRevision) {
    throw new Error("Active release record hash is invalid");
  }
  return Object.freeze({ ...release });
}

async function loadReleaseState(git, releaseRef) {
  const ref = await git.getRef(releaseRef);
  if (!ref?.sha) throw new Error(`Release reference does not exist: ${releaseRef}`);
  const commit = await git.getCommit(ref.sha);
  const entries = new Map((await git.readTree(commit.treeSha)).map((entry) => [entry.path, entry]));
  const activeEntry = entries.get(ACTIVE_RELEASE_PATH);
  const revisionsEntry = entries.get(PUBLISHED_REVISIONS_PATH);
  if (!activeEntry?.sha || !revisionsEntry?.sha) {
    throw new Error("Release reference is missing its authoritative state files");
  }
  const release = validateReleaseRecord(parseJson(await git.readBlob(activeEntry.sha), ACTIVE_RELEASE_PATH));
  const revisions = parseJson(await git.readBlob(revisionsEntry.sha), PUBLISHED_REVISIONS_PATH);
  if (!revisions?.[release.contentRevision]?.contentCommitSha) {
    throw new Error("Active content revision is missing from the published revision index");
  }
  return { ref, release, revisions };
}

function releaseCoordinates(release) {
  return {
    gameBuild: String(release.gameBuild || ""),
    engineVersion: String(release.engineVersion || ""),
    pluginVersion: String(release.pluginVersion || "")
  };
}

function coordinatesMatch(left, right) {
  const a = releaseCoordinates(left);
  const b = releaseCoordinates(right);
  return a.gameBuild === b.gameBuild
    && a.engineVersion === b.engineVersion
    && a.pluginVersion === b.pluginVersion;
}

function auditOperation(operationKey, expectedReleaseRevision, release) {
  return {
    fingerprint: stableHash({
      operation: "coordinate-reference-release",
      expectedReleaseRevision,
      release
    }),
    contentRevision: release.contentRevision,
    release
  };
}

async function commitReleaseState({ git, releaseRef, state, release, revisions, message }) {
  const activeBlobSha = await git.createBlob(jsonBytes(release));
  const revisionsBlobSha = await git.createBlob(jsonBytes(revisions));
  const treeSha = await git.createTree([
    { path: ACTIVE_RELEASE_PATH, sha: activeBlobSha },
    { path: PUBLISHED_REVISIONS_PATH, sha: revisionsBlobSha }
  ]);
  const commitSha = await git.createCommit({
    message,
    treeSha,
    parentSha: state.ref.sha
  });
  await git.updateRefCas(releaseRef, state.ref.sha, commitSha);
  return commitSha;
}

async function activateReferenceRelease(options) {
  const state = await loadReleaseState(options.git, options.releaseRef);
  const game = options.gameDefinition;
  if (!game?.gameId || !game?.version || !game?.engineCompatibility) {
    throw new Error("Reference game definition is incomplete");
  }
  if (game.engineCompatibility !== options.engineVersion) {
    throw new Error(
      `Reference game targets engine ${game.engineCompatibility}, not requested engine ${options.engineVersion}`
    );
  }
  if (state.release.gameId !== game.gameId) {
    throw new Error(`Active release belongs to ${state.release.gameId}, not ${game.gameId}`);
  }
  const desiredCoordinates = {
    gameBuild: game.version,
    engineVersion: options.engineVersion,
    pluginVersion: game.version
  };
  const workspaceSnapshot = options.workspaceSnapshot || null;
  if (coordinatesMatch(state.release, desiredCoordinates)
    && (!workspaceSnapshot || state.release.contentRevision === workspaceSnapshot.revision)) {
    return Object.freeze({
      action: "activate",
      changed: false,
      operationKey: options.operationKey,
      previousRelease: state.release,
      activeRelease: state.release,
      previousRefSha: state.ref.sha,
      activeRefSha: state.ref.sha
    });
  }
  if (workspaceSnapshot) {
    const store = options.store || createGithubContentBundleStore({
      git: options.git,
      releaseRef: options.releaseRef
    });
    const committed = await store.commitWorkspace({
      snapshot: workspaceSnapshot,
      expectedActiveRevision: state.release.releaseRevision,
      idempotencyKey: options.operationKey,
      release: desiredCoordinates
    });
    const activeRef = await options.git.getRef(options.releaseRef);
    return Object.freeze({
      action: "activate",
      changed: true,
      operationKey: options.operationKey,
      previousRelease: state.release,
      activeRelease: committed.release,
      previousRefSha: state.ref.sha,
      activeRefSha: activeRef.sha
    });
  }
  const activeRelease = createReleaseRecord({
    ...desiredCoordinates,
    gameId: state.release.gameId,
    contentRevision: state.release.contentRevision
  }, state.release.releaseRevision);
  const existingOperation = state.revisions.operations?.[options.operationKey];
  if (existingOperation && existingOperation.release?.releaseRevision !== activeRelease.releaseRevision) {
    throw new Error(`Release operation key was already used: ${options.operationKey}`);
  }
  const operations = {
    ...(state.revisions.operations || {}),
    [options.operationKey]: auditOperation(options.operationKey, state.release.releaseRevision, activeRelease)
  };
  const revisions = { ...state.revisions, operations };
  const commitSha = await commitReleaseState({
    git: options.git,
    releaseRef: options.releaseRef,
    state,
    release: activeRelease,
    revisions,
    message: `Release reference content for engine ${options.engineVersion} [${options.operationKey}]`
  });
  return Object.freeze({
    action: "activate",
    changed: true,
    operationKey: options.operationKey,
    previousRelease: state.release,
    activeRelease,
    previousRefSha: state.ref.sha,
    activeRefSha: commitSha
  });
}

async function rollbackReferenceRelease(options) {
  const activation = options.activation;
  if (!activation?.changed) {
    return Object.freeze({ action: "rollback", changed: false, reason: "activation-did-not-change" });
  }
  const state = await loadReleaseState(options.git, options.releaseRef);
  const previousCoordinates = releaseCoordinates(activation.previousRelease);
  if (
    coordinatesMatch(state.release, previousCoordinates)
    && state.release.previousReleaseRevision === activation.activeRelease.releaseRevision
  ) {
    return Object.freeze({
      action: "rollback",
      changed: false,
      reason: "already-rolled-back",
      activeRelease: state.release,
      activeRefSha: state.ref.sha
    });
  }
  if (state.release.releaseRevision !== activation.activeRelease.releaseRevision) {
    throw new Error(
      "Active release changed after deployment activation; refusing to overwrite concurrent content or release work"
    );
  }
  const rollbackRelease = createReleaseRecord({
    ...previousCoordinates,
    gameId: state.release.gameId,
    contentRevision: activation.previousRelease.contentRevision
  }, state.release.releaseRevision);
  const operationKey = requiredIdempotencyKey(`${options.operationKey}:rollback`);
  const operations = {
    ...(state.revisions.operations || {}),
    [operationKey]: auditOperation(operationKey, state.release.releaseRevision, rollbackRelease)
  };
  const revisions = { ...state.revisions, operations };
  const commitSha = await commitReleaseState({
    git: options.git,
    releaseRef: options.releaseRef,
    state,
    release: rollbackRelease,
    revisions,
    message: `Restore reference release after failed engine deployment [${operationKey}]`
  });
  return Object.freeze({
    action: "rollback",
    changed: true,
    operationKey,
    previousRelease: state.release,
    activeRelease: rollbackRelease,
    previousRefSha: state.ref.sha,
    activeRefSha: commitSha
  });
}

function writeGithubOutputs(result, outputPath = process.env.GITHUB_OUTPUT) {
  if (!outputPath) return;
  const values = {
    changed: String(result.changed === true),
    release_revision: String(result.activeRelease?.releaseRevision || ""),
    content_revision: String(result.activeRelease?.contentRevision || ""),
    engine_version: String(result.activeRelease?.engineVersion || "")
  };
  fs.appendFileSync(
    outputPath,
    Object.entries(values).map(([key, value]) => `${key}=${value}\n`).join("")
  );
}

async function runCommand(options) {
  if (options.arguments.command === "activate") {
    return activateReferenceRelease({
      git: options.git,
      releaseRef: options.arguments.releaseRef,
      engineVersion: options.arguments.engineVersion,
      operationKey: options.arguments.operationKey,
      gameDefinition: options.gameDefinition,
      workspaceSnapshot: options.workspaceSnapshot
    });
  }
  const activation = JSON.parse(fs.readFileSync(options.arguments.stateFile, "utf8"));
  return rollbackReferenceRelease({
    git: options.git,
    releaseRef: options.arguments.releaseRef,
    operationKey: options.arguments.operationKey,
    activation
  });
}

async function main() {
  try {
    const argumentsValue = parseArguments(process.argv.slice(2));
    const repo = String(process.env.GITHUB_REPOSITORY || "");
    const token = String(process.env.GITHUB_TOKEN || "");
    if (!repo) throw new Error("GITHUB_REPOSITORY is required");
    if (!token) throw new Error("GITHUB_TOKEN is required");
    const gameDefinition = require(path.resolve(__dirname, "..", "apps", "reference", "game.config.js"));
    const contentProvider = argumentsValue.command === "activate"
      ? createLocalContentBundleProvider({
        root: path.resolve(__dirname, "..", argumentsValue.contentRoot),
        gameBuild: gameDefinition.version,
        engineVersion: argumentsValue.engineVersion,
        pluginVersion: gameDefinition.version
      })
      : null;
    const workspaceSnapshot = contentProvider
      ? contentProvider.loadPublishedRevision()
      : null;
    const git = createGithubGitDataRuntime({ repo, token, userAgent: "pop-party-release-coordinator" });
    const result = await runCommand({ arguments: argumentsValue, gameDefinition, git, workspaceSnapshot });
    fs.writeFileSync(argumentsValue.stateFile, `${JSON.stringify(result, null, 2)}\n`);
    writeGithubOutputs(result);
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(`Reference release coordination failed: ${error.message}`);
    process.exitCode = 1;
  }
}

if (require.main === module) main();

module.exports = {
  activateReferenceRelease,
  coordinatesMatch,
  loadReleaseState,
  parseArguments,
  rollbackReferenceRelease,
  runCommand,
  validateReleaseRecord,
  writeGithubOutputs
};
