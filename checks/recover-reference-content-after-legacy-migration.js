#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { createBundleGameData } = require("../packages/engine/src/server/content-game-data-runtime");
const { createContentSnapshot, replaceSnapshotFiles } = require("../packages/engine/src/server/content-snapshot-runtime");

const EXPECTED = Object.freeze({
  legacyFlowCommit: "5e1d413bc29b94af5ce514bc9078f7b4b38eec9b",
  migratedContentCommit: "d3679a44dd4b9e53f270a70f49548b0341bfe14a",
  activeContentCommit: "a192bbc3684da1e1b26a638cdc2cb5eae9bba6f2",
  activeContentRevision: "12e15ebee30eccfcd482d90fa0c5e3a222856e98aa4789a4ea14e32b426cb4ac",
  trackedContentCommit: "6e857e1d1d4fc0f17436081b7188c12f6285b5b1",
  preservedActionId: "lobby-action-mqw4vt62"
});

function gitBytes(commit, logicalPath) {
  return childProcess.execFileSync("git", ["show", `${commit}:${logicalPath}`]);
}

function gitJson(commit, logicalPath) {
  return JSON.parse(gitBytes(commit, logicalPath).toString("utf8"));
}

function snapshotAtCommit(commit) {
  const manifest = gitJson(commit, "content-bundle.json");
  const files = new Map(
    manifest.files.map((record) => [record.path, gitBytes(commit, record.path)])
  );
  return createContentSnapshot({ manifest, files });
}

function actionById(flow, actionId) {
  for (const state of flow.states || []) {
    const action = (state.actions || []).find((candidate) => candidate.id === actionId);
    if (action) return action;
  }
  throw new Error(`Flow action is missing: ${actionId}`);
}

function buildRecoveredFlow({ migratedFlow, activeFlow, legacyFlow }) {
  const migratedTitleAction = actionById(migratedFlow, EXPECTED.preservedActionId);
  const activeTitleAction = actionById(activeFlow, EXPECTED.preservedActionId);
  const activeWithoutNewerTitle = structuredClone(activeFlow);
  actionById(activeWithoutNewerTitle, EXPECTED.preservedActionId).text = migratedTitleAction.text;
  assert.deepEqual(
    activeWithoutNewerTitle,
    migratedFlow,
    "The active Flow contains newer changes beyond the reviewed lobby title; refusing an incomplete recovery merge"
  );

  const recovered = structuredClone(legacyFlow);
  actionById(recovered, EXPECTED.preservedActionId).text = activeTitleAction.text;
  return recovered;
}

function countActions(flow, type) {
  return (flow.states || []).reduce(
    (total, state) => total + (state.actions || []).filter((action) => action.type === type).length,
    0
  );
}

function unionByIdentity(primary, secondary, identity) {
  const values = structuredClone(primary || []);
  const seen = new Set(values.map(identity));
  for (const value of secondary || []) {
    const id = identity(value);
    if (seen.has(id)) continue;
    seen.add(id);
    values.push(structuredClone(value));
  }
  return values;
}

function mergeOrganization(tracked = {}, active = {}) {
  const merged = {};
  for (const surface of new Set([...Object.keys(tracked), ...Object.keys(active)])) {
    const trackedSurface = tracked[surface] || {};
    const activeSurface = active[surface] || {};
    const folderIds = (folder) => String(folder?.id || "");
    const folders = unionByIdentity(trackedSurface.folders, activeSurface.folders, folderIds);
    const order = unionByIdentity(trackedSurface.order, activeSurface.order, String);
    const folderItems = {};
    for (const folderId of new Set([
      ...Object.keys(trackedSurface.folderItems || {}),
      ...Object.keys(activeSurface.folderItems || {})
    ])) {
      folderItems[folderId] = unionByIdentity(
        trackedSurface.folderItems?.[folderId],
        activeSurface.folderItems?.[folderId],
        String
      );
    }
    merged[surface] = { folders, order, folderItems };
  }
  return merged;
}

function buildRecoveredArt({ trackedArt, activeArt }) {
  const trackedIds = Object.keys(trackedArt.compositions || {}).sort();
  const activeIds = Object.keys(activeArt.compositions || {}).sort();
  assert.deepEqual(
    trackedIds,
    activeIds,
    "Tracked and active Art composition inventories diverged; refusing to choose a source silently"
  );
  assert.deepEqual(
    (trackedArt.assets || []).map((asset) => asset.id).sort(),
    (activeArt.assets || []).map((asset) => asset.id).sort(),
    "Tracked and active Art asset inventories diverged; refusing to choose a source silently"
  );
  return {
    ...structuredClone(trackedArt),
    deletedCompositionIds: unionByIdentity(
      trackedArt.deletedCompositionIds,
      activeArt.deletedCompositionIds,
      String
    ),
    organization: mergeOrganization(trackedArt.organization, activeArt.organization)
  };
}

function writeSnapshot(root, snapshot) {
  const expectedPaths = new Set(["content-bundle.json", ...snapshot.paths]);
  const actualPaths = [];
  function visit(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(absolutePath);
      else actualPaths.push(path.relative(root, absolutePath).split(path.sep).join("/"));
    }
  }
  visit(root);
  assert.deepEqual(
    new Set(actualPaths),
    expectedPaths,
    "Reference content inventory differs from the active bundle; refusing to delete or invent files"
  );

  for (const logicalPath of snapshot.paths) {
    const destination = path.join(root, ...logicalPath.split("/"));
    const temporary = `${destination}.recovery-tmp`;
    fs.writeFileSync(temporary, snapshot.readBytes(logicalPath), { mode: 0o600 });
    fs.renameSync(temporary, destination);
  }
  const manifestPath = path.join(root, "content-bundle.json");
  const manifestTemporary = `${manifestPath}.recovery-tmp`;
  fs.writeFileSync(manifestTemporary, snapshot.manifestBytes(), { mode: 0o600 });
  fs.renameSync(manifestTemporary, manifestPath);
}

function recoverReferenceContent(options = {}) {
  const legacyHead = childProcess.execFileSync(
    "git",
    ["rev-parse", "origin/game-data"],
    { encoding: "utf8" }
  ).trim();
  assert.equal(
    legacyHead,
    EXPECTED.legacyFlowCommit,
    "The legacy game-data branch changed after the recovery audit; review it again before proceeding"
  );

  const activeSnapshot = snapshotAtCommit(EXPECTED.activeContentCommit);
  assert.equal(
    activeSnapshot.revision,
    EXPECTED.activeContentRevision,
    "The audited active content commit no longer resolves to the expected revision"
  );
  const recoveredFlow = buildRecoveredFlow({
    migratedFlow: gitJson(EXPECTED.migratedContentCommit, "flow.json"),
    activeFlow: activeSnapshot.readJson("flow.json"),
    legacyFlow: gitJson(EXPECTED.legacyFlowCommit, "game-flow.json")
  });
  assert.equal(countActions(recoveredFlow, "endMoment"), 10);
  assert.equal(countActions(recoveredFlow, "startMoment"), 1);
  assert.ok(
    (recoveredFlow.routeNodes || []).some((node) => node.type === "codeNode" && node.code === "g.test = 0;")
  );
  assert.ok(
    (recoveredFlow.routeNodes || []).some((node) => node.type === "codeNode" && node.code === "g.test++;")
  );
  const recoveredArt = buildRecoveredArt({
    trackedArt: gitJson(
      EXPECTED.trackedContentCommit,
      "apps/reference/content/art/manifest.json"
    ),
    activeArt: activeSnapshot.readJson("art/manifest.json")
  });

  const candidate = replaceSnapshotFiles(activeSnapshot, {
    "art/manifest.json": Buffer.from(`${JSON.stringify(recoveredArt, null, 2)}\n`, "utf8"),
    "flow.json": Buffer.from(`${JSON.stringify(recoveredFlow, null, 2)}\n`, "utf8")
  });
  createBundleGameData(candidate);
  if (options.writeReference) {
    writeSnapshot(
      path.resolve(__dirname, "..", "apps", "reference", "content"),
      candidate
    );
  }
  if (options.writeStarter) {
    const starterFiles = new Map(
      candidate.paths.map((logicalPath) => [logicalPath, candidate.readBytes(logicalPath)])
    );
    const starterSnapshot = createContentSnapshot({
      manifest: {
        ...candidate.manifest,
        parentRevision: "",
        publishedRevision: ""
      },
      files: starterFiles
    });
    writeSnapshot(
      path.resolve(__dirname, "..", "packages", "create-game", "starter", "content"),
      starterSnapshot
    );
  }
  return Object.freeze({
    candidate,
    summary: Object.freeze({
      sourceLegacyCommit: EXPECTED.legacyFlowCommit,
      parentContentRevision: activeSnapshot.revision,
      recoveredContentRevision: candidate.revision,
      preservedLobbyText: actionById(recoveredFlow, EXPECTED.preservedActionId).text,
      stateCount: recoveredFlow.states.length,
      startMomentCount: countActions(recoveredFlow, "startMoment"),
      endMomentCount: countActions(recoveredFlow, "endMoment"),
      routeNodeCount: recoveredFlow.routeNodes.length
    })
  });
}

if (require.main === module) {
  try {
    const result = recoverReferenceContent({
      writeReference: process.argv.includes("--write-reference"),
      writeStarter: process.argv.includes("--write-starter")
    });
    console.log(JSON.stringify({
      ...result.summary,
      wroteReferenceContent: process.argv.includes("--write-reference"),
      wroteStarterContent: process.argv.includes("--write-starter")
    }, null, 2));
  } catch (error) {
    console.error(`Reference content recovery failed: ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = Object.freeze({
  EXPECTED,
  buildRecoveredArt,
  buildRecoveredFlow,
  mergeOrganization,
  recoverReferenceContent
});
