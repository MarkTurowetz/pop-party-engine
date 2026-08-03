#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { coreSemanticRoleDefinitions } = require("../packages/engine/src/shared/semantic-role-schema");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

const stageRuntime = read("client/runtime/stageRuntime.ts");
const controllerRuntime = read("client/runtime/controller.ts");
const shell = read("index.html");
const starterStage = JSON.parse(read("packages/create-game/starter/content/layouts/stage.json"));
const starterController = JSON.parse(read("packages/create-game/starter/content/layouts/controller.json"));

for (const forbidden of ["stagePlayerRoster", "playerLobby", "playerPointsPopup"]) {
  assert.equal(stageRuntime.includes(forbidden), false, `Stage runtime still owns player presentation: ${forbidden}`);
}
for (const forbidden of ["controllerAvatarView", "avatarPicker", "controllerPlayerBanner"]) {
  assert.equal(controllerRuntime.includes(forbidden), false, `Controller runtime still owns player presentation: ${forbidden}`);
  assert.equal(shell.includes(forbidden), false, `Static shell still owns player presentation: ${forbidden}`);
}
assert.equal(
  Object.keys(coreSemanticRoleDefinitions).some((role) => [
    "engine.stage.playerIdentityWidget",
    "engine.stage.playerAnswerBubble",
    "engine.stage.playerPointsPopup",
    "engine.stage.playerPointsPopupContainer",
    "engine.shared.playerAvatar",
    "engine.controller.playerIdentity",
    "engine.controller.avatarChoice"
  ].includes(role)),
  false,
  "Engine semantic roles must not prescribe player or avatar Art"
);
assert.equal(
  [...(starterStage.global?.elements || []), ...(starterStage.states || []).flatMap((state) => state.elements || [])]
    .some((element) => /player|avatar/i.test(String(element.id || ""))),
  false,
  "An empty generated game must not receive Stage player Art"
);
assert.equal(
  [...(starterController.global?.elements || []), ...(starterController.states || []).flatMap((state) => state.elements || [])]
    .some((element) => /avatar|playerbanner/i.test(String(element.id || ""))),
  false,
  "An empty generated game must not receive Controller player Art"
);

for (const functionName of [
  "setPlayerAnswerBubblesShownForAction",
  "revealPlayerAnswerCorrectnessForAction",
  "setPlayersShownForAction"
]) {
  assert.match(
    stageRuntime,
    new RegExp(`function ${functionName}\\([^)]*\\): Promise<void> \\{[\\s\\S]{0,120}Promise\\.resolve\\(\\)`),
    `${functionName} must safely complete without an Art target`
  );
}
assert.match(
  stageRuntime,
  /function showPointPopupsForAction\([^)]*\): void \{ void _action; \}/,
  "Point-popup state actions must not require engine-owned Art"
);

console.log("Player state is presentation-neutral; game-owned renderers are the only player Art path.");
