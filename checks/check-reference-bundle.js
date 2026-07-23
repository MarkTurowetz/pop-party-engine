#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { defineGame } = require("@pop-party/engine/game");
const { createLocalContentBundleProvider } = require("@pop-party/engine/content/local");
const { createGameReadinessRuntime } = require("@pop-party/engine/server/readiness");
const legacyReferenceGame = require("../apps/reference/game.config");

const root = path.resolve(__dirname, "..");
const contentRoot = path.join(root, "apps", "reference", "content");
const starterRoot = path.join(root, "packages", "create-game", "starter", "content");

async function main() {
  assert.notEqual(fs.realpathSync(contentRoot), fs.realpathSync(starterRoot), "Reference content must be a distinct game-owned copy");
  const contentStore = createLocalContentBundleProvider({
    root: contentRoot,
    gameBuild: legacyReferenceGame.version,
    engineVersion: legacyReferenceGame.engineCompatibility,
    pluginVersion: legacyReferenceGame.version
  });
  const gameDefinition = defineGame({
    gameId: legacyReferenceGame.gameId,
    displayName: legacyReferenceGame.displayName,
    version: legacyReferenceGame.version,
    engineCompatibility: legacyReferenceGame.engineCompatibility,
    content: { mode: "bundle", schemaVersion: 1, store: contentStore },
    plugin: legacyReferenceGame.plugin,
    semanticRoles: legacyReferenceGame.semanticRoles
  });
  const readiness = createGameReadinessRuntime({
    gameDefinition,
    engineVersion: legacyReferenceGame.engineCompatibility
  });
  const active = await readiness.check();
  assert.equal(active.release.gameId, legacyReferenceGame.gameId);
  assert.equal(active.release.contentRevision, active.snapshot.revision);
  assert.ok(active.gameData.defaultGameFlow.states.length > 0, "Reference flow must materialize from its bundle");
  assert.ok(active.gameData.defaultArtCompositions.length > 0, "Reference art must materialize from its bundle");
  assert.ok(active.gameData.defaultStageLayouts.states.length > 0, "Reference stage layouts must materialize from its bundle");
  assert.ok(active.gameData.defaultControllerLayouts.states.length > 0, "Reference controller layouts must materialize from its bundle");
  assert.deepEqual(active.gameData.avatarShapes, legacyReferenceGame.gameData.avatarShapes);
  assert.deepEqual(active.gameData.availableFlowTransitions, legacyReferenceGame.gameData.availableFlowTransitions);
  console.log(`Reference bundle readiness passed: ${active.release.contentRevision} (${active.snapshot.paths.length} files).`);
}

main().catch((error) => {
  console.error(`Reference bundle readiness failed: ${error.message}`);
  process.exitCode = 1;
});
