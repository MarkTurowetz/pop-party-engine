#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { createBundleGameData } = require("../packages/engine/src/server/content-game-data-runtime");
const { createContentSnapshot } = require("../packages/engine/src/server/content-snapshot-runtime");

const EXPECTED = Object.freeze({
  lastUserSavedContentCommit: "a192bbc3684da1e1b26a638cdc2cb5eae9bba6f2",
  lastUserSavedContentRevision: "12e15ebee30eccfcd482d90fa0c5e3a222856e98aa4789a4ea14e32b426cb4ac"
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

function writeSnapshot(root, snapshot, { resetPublicationMetadata = false } = {}) {
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
    "Reference content inventory differs from the saved bundle; refusing to delete or invent files"
  );

  for (const logicalPath of snapshot.paths) {
    const destination = path.join(root, ...logicalPath.split("/"));
    const temporary = `${destination}.recovery-tmp`;
    fs.writeFileSync(temporary, snapshot.readBytes(logicalPath), { mode: 0o600 });
    fs.renameSync(temporary, destination);
  }

  const manifest = resetPublicationMetadata
    ? {
        ...snapshot.manifest,
        parentRevision: "",
        publishedRevision: ""
      }
    : snapshot.manifest;
  const manifestPath = path.join(root, "content-bundle.json");
  const manifestTemporary = `${manifestPath}.recovery-tmp`;
  fs.writeFileSync(
    manifestTemporary,
    `${JSON.stringify(manifest, null, 2)}\n`,
    { mode: 0o600 }
  );
  fs.renameSync(manifestTemporary, manifestPath);
}

function countActions(flow, type) {
  return (flow.states || []).reduce(
    (total, state) => total + (state.actions || []).filter((action) => action.type === type).length,
    0
  );
}

function recoverReferenceContent(options = {}) {
  const snapshot = snapshotAtCommit(EXPECTED.lastUserSavedContentCommit);
  assert.equal(
    snapshot.revision,
    EXPECTED.lastUserSavedContentRevision,
    "The audited last user-saved content commit no longer resolves to the expected revision"
  );
  const gameData = createBundleGameData(snapshot);

  if (options.writeReference) {
    writeSnapshot(
      path.resolve(__dirname, "..", "apps", "reference", "content"),
      snapshot
    );
  }
  if (options.writeStarter) {
    writeSnapshot(
      path.resolve(__dirname, "..", "packages", "create-game", "starter", "content"),
      snapshot,
      { resetPublicationMetadata: true }
    );
  }

  const flow = gameData.defaultGameFlow;
  return Object.freeze({
    snapshot,
    summary: Object.freeze({
      sourceContentCommit: EXPECTED.lastUserSavedContentCommit,
      restoredContentRevision: snapshot.revision,
      fileCount: snapshot.paths.length,
      stateCount: flow.states.length,
      startMomentCount: countActions(flow, "startMoment"),
      endMomentCount: countActions(flow, "endMoment"),
      stageLayoutCount: gameData.defaultStageLayouts.states.length,
      controllerLayoutCount: gameData.defaultControllerLayouts.states.length,
      artCompositionCount: gameData.defaultArtCompositions.length,
      artAssetCount: gameData.artAssets.length
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
  recoverReferenceContent,
  snapshotAtCommit,
  writeSnapshot
});
