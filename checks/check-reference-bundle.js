#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { defineGame } = require("@pop-party/engine/game");
const { createLocalContentBundleProvider } = require("@pop-party/engine/content/local");
const { createGameReadinessRuntime } = require("@pop-party/engine/server/readiness");
const { createRoomContentPinRuntime } = require("@pop-party/engine/rooms/content-pin");
const referenceGame = require("../apps/reference/game.config");
const authoringSourceGameData = require("../apps/reference/authoring-source-game-data");

const root = path.resolve(__dirname, "..");
const contentRoot = path.join(root, "apps", "reference", "content");
const starterRoot = path.join(root, "packages", "create-game", "starter", "content");

async function main() {
  assert.notEqual(fs.realpathSync(contentRoot), fs.realpathSync(starterRoot), "Reference content must be a distinct game-owned copy");
  const contentStore = createLocalContentBundleProvider({
    root: contentRoot,
    gameBuild: referenceGame.version,
    engineVersion: referenceGame.engineCompatibility,
    pluginVersion: referenceGame.version
  });
  const gameDefinition = defineGame({
    gameId: referenceGame.gameId,
    displayName: referenceGame.displayName,
    version: referenceGame.version,
    engineCompatibility: referenceGame.engineCompatibility,
    content: { mode: "bundle", schemaVersion: 1, store: contentStore },
    plugin: referenceGame.plugin,
    semanticRoles: referenceGame.semanticRoles
  });
  const readiness = createGameReadinessRuntime({
    gameDefinition,
    engineVersion: referenceGame.engineCompatibility
  });
  const active = await readiness.check();
  assert.equal(active.release.gameId, referenceGame.gameId);
  assert.equal(active.release.contentRevision, active.snapshot.revision);
  assert.ok(active.gameData.defaultGameFlow.states.length > 0, "Reference flow must materialize from its bundle");
  assert.ok(active.gameData.defaultArtCompositions.length > 0, "Reference art must materialize from its bundle");
  assert.ok(active.gameData.defaultStageLayouts.states.length > 0, "Reference stage layouts must materialize from its bundle");
  assert.ok(active.gameData.defaultControllerLayouts.states.length > 0, "Reference controller layouts must materialize from its bundle");
  assert.deepEqual(active.gameData.avatarShapes, authoringSourceGameData.avatarShapes);
  assert.deepEqual(active.gameData.availableFlowTransitions, authoringSourceGameData.availableFlowTransitions);
  const roomPins = createRoomContentPinRuntime({ contentStore, gameId: referenceGame.gameId });
  const room = {};
  await roomPins.pinNewRoom(room);
  assert.equal(room.gameData.defaultGameFlow.states[0].id, active.gameData.defaultGameFlow.states[0].id);
  roomPins.releaseRoomPin(room);
  assert.deepEqual(room, { releasePin: null, contentSnapshot: null, gameData: null });
  console.log(`Reference bundle readiness passed: ${active.release.contentRevision} (${active.snapshot.paths.length} files).`);
}

main().catch((error) => {
  console.error(`Reference bundle readiness failed: ${error.message}`);
  process.exitCode = 1;
});
