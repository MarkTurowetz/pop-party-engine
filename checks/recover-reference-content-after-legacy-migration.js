#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { createBundleGameData } = require("../packages/engine/src/server/content-game-data-runtime");
const { createContentSnapshot } = require("../packages/engine/src/server/content-snapshot-runtime");

const EXPECTED = Object.freeze({
  laterToolStateCommit: "e471cafee62ebe0f61195a6591152388487b5fd9",
  laterToolStateRevision: "d2117400c7a602e7b8fe1290c1c1ceac31788f40636fe24ba4e660167ddb8273"
});

function snapshotFromDirectory(root) {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(root, "content-bundle.json"), "utf8")
  );
  const files = new Map(
    manifest.files.map((record) => [
      record.path,
      fs.readFileSync(path.join(root, ...record.path.split("/")))
    ])
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
  const referenceRoot = path.resolve(
    __dirname,
    "..",
    "apps",
    "reference",
    "content"
  );
  const snapshot = snapshotFromDirectory(referenceRoot);
  assert.equal(
    snapshot.revision,
    EXPECTED.laterToolStateRevision,
    "The committed reference content no longer matches the audited background-capable Tool state"
  );
  const gameData = createBundleGameData(snapshot);

  if (options.writeReference) {
    writeSnapshot(referenceRoot, snapshot);
  }
  if (options.writeStarter) {
    writeSnapshot(
      path.resolve(__dirname, "..", "packages", "create-game", "starter", "content"),
      snapshot,
      { resetPublicationMetadata: true }
    );
  }

  const flow = gameData.defaultGameFlow;
  const backgroundCompositionCount = gameData.defaultArtCompositions.filter(
    (composition) => composition.id.startsWith("stage-background")
  ).length;
  return Object.freeze({
    snapshot,
    summary: Object.freeze({
      sourceContentCommit: EXPECTED.laterToolStateCommit,
      restoredContentRevision: snapshot.revision,
      fileCount: snapshot.paths.length,
      stateCount: flow.states.length,
      startMomentCount: countActions(flow, "startMoment"),
      endMomentCount: countActions(flow, "endMoment"),
      routeNodeCount: flow.routeNodes.length,
      stageLayoutCount: gameData.defaultStageLayouts.states.length,
      controllerLayoutCount: gameData.defaultControllerLayouts.states.length,
      artCompositionCount: gameData.defaultArtCompositions.length,
      backgroundCompositionCount,
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
  snapshotFromDirectory,
  writeSnapshot
});
