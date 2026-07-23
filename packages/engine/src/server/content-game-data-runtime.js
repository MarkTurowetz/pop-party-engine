"use strict";

const { availableFlowActionTypes } = require("../shared/flow-action-registry");
const { createGameFlowMergeRuntime } = require("./game-flow-merge-runtime");

const ACCEPTED_ART_TYPES = Object.freeze({
  "image/png": ".png",
  "image/svg+xml": ".svg",
  "image/jpeg": ".jpg",
  "image/webp": ".webp"
});

const REQUIRED_CONSTANT_KEYS = Object.freeze([
  "playerColors",
  "craftingTimerDuration",
  "startGameCountdownDuration",
  "pointsForCorrectAnswer",
  "gameTitle",
  "numberOfRounds",
  "randomChanceTest",
  "speechToTextSendInputBuffer",
  "overrideFirstGameOfSession",
  "customConstants"
]);

function requiredObject(value, logicalPath) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Bundle runtime data must be an object: ${logicalPath}`);
  }
  return value;
}

function requiredArray(value, logicalPath, { allowEmpty = true } = {}) {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0)) {
    throw new Error(`Bundle runtime data must be ${allowEmpty ? "an" : "a non-empty"} array: ${logicalPath}`);
  }
  return value;
}

function requiredJson(snapshot, logicalPath) {
  if (!snapshot || typeof snapshot.readJson !== "function") {
    throw new Error("Bundle game data requires a validated content snapshot");
  }
  return snapshot.readJson(logicalPath);
}

function createBundleGameData(snapshot) {
  const flow = requiredObject(requiredJson(snapshot, "flow.json"), "flow.json");
  createGameFlowMergeRuntime({ requiredFlowStates: [{ id: "lobby" }, { id: "intro" }] })
    .assertCompleteAuthoredFlow(flow);

  const constants = requiredObject(requiredJson(snapshot, "constants.json"), "constants.json");
  const missingConstants = REQUIRED_CONSTANT_KEYS.filter((key) => !Object.prototype.hasOwnProperty.call(constants, key));
  if (missingConstants.length) {
    throw new Error(`Bundle constants are incomplete: ${missingConstants.join(", ")}`);
  }
  requiredArray(constants.playerColors, "constants.json.playerColors", { allowEmpty: false });
  requiredArray(constants.customConstants, "constants.json.customConstants");
  if (!constants.playerColors.every((color) => typeof color === "string" && color.trim())) {
    throw new Error("Bundle player colors must be non-empty strings");
  }
  for (const key of [
    "craftingTimerDuration",
    "startGameCountdownDuration",
    "pointsForCorrectAnswer",
    "numberOfRounds",
    "randomChanceTest",
    "speechToTextSendInputBuffer"
  ]) {
    if (!Number.isFinite(Number(constants[key]))) throw new Error(`Bundle constant must be numeric: ${key}`);
  }
  if (typeof constants.gameTitle !== "string" || !constants.gameTitle.trim()) {
    throw new Error("Bundle constant must be a non-empty string: gameTitle");
  }
  if (typeof constants.overrideFirstGameOfSession !== "boolean") {
    throw new Error("Bundle constant must be boolean: overrideFirstGameOfSession");
  }

  const stageLayouts = requiredObject(requiredJson(snapshot, "layouts/stage.json"), "layouts/stage.json");
  requiredObject(stageLayouts.canvas, "layouts/stage.json.canvas");
  requiredObject(stageLayouts.global, "layouts/stage.json.global");
  requiredArray(stageLayouts.states, "layouts/stage.json.states", { allowEmpty: false });

  const controllerLayouts = requiredObject(requiredJson(snapshot, "layouts/controller.json"), "layouts/controller.json");
  requiredObject(controllerLayouts.canvas, "layouts/controller.json.canvas");
  requiredObject(controllerLayouts.global, "layouts/controller.json.global");
  requiredArray(controllerLayouts.states, "layouts/controller.json.states", { allowEmpty: false });

  const hostAudios = requiredObject(requiredJson(snapshot, "audio/host-audios.json"), "audio/host-audios.json");
  requiredArray(hostAudios.hostAudios, "audio/host-audios.json.hostAudios");

  const promptDocument = requiredObject(requiredJson(snapshot, "prompts/prompts.json"), "prompts/prompts.json");
  requiredArray(promptDocument.prompts, "prompts/prompts.json.prompts");

  const artManifest = requiredObject(requiredJson(snapshot, "art/manifest.json"), "art/manifest.json");
  const compositions = requiredObject(artManifest.compositions, "art/manifest.json.compositions");
  requiredArray(artManifest.assets, "art/manifest.json.assets");

  const runtimeDocument = requiredObject(requiredJson(snapshot, "game-data/runtime.json"), "game-data/runtime.json");
  if (runtimeDocument.schemaVersion !== 1) {
    throw new Error(`Unsupported bundle runtime-data schema version: ${String(runtimeDocument.schemaVersion ?? "")}`);
  }
  const avatarShapes = requiredArray(runtimeDocument.avatarShapes, "game-data/runtime.json.avatarShapes", { allowEmpty: false });
  const artGroups = requiredArray(runtimeDocument.artGroups, "game-data/runtime.json.artGroups");
  const availableFlowTransitions = requiredArray(
    runtimeDocument.availableFlowTransitions,
    "game-data/runtime.json.availableFlowTransitions"
  );
  if (!avatarShapes.every((shape) => typeof shape === "string" && shape.trim())) {
    throw new Error("Bundle avatar shapes must be non-empty strings");
  }

  return Object.freeze({
    acceptedArtTypes: ACCEPTED_ART_TYPES,
    artAssets: structuredClone(artManifest.assets),
    artGroups: structuredClone(artGroups),
    availableFlowActionTypes: structuredClone(availableFlowActionTypes),
    availableFlowTransitions: structuredClone(availableFlowTransitions),
    avatarShapes: structuredClone(avatarShapes),
    defaultArtCompositions: Object.freeze(Object.entries(compositions).map(([id, composition]) => ({
      id,
      ...structuredClone(composition)
    }))),
    defaultControllerLayouts: structuredClone(controllerLayouts),
    defaultGameConstants: structuredClone(constants),
    defaultGameFlow: structuredClone(flow),
    defaultHostAudios: structuredClone(hostAudios),
    defaultPlayerColors: structuredClone(constants.playerColors),
    defaultStageLayouts: structuredClone(stageLayouts),
    multipleChoicePrompts: structuredClone(promptDocument.prompts)
  });
}

module.exports = Object.freeze({ ACCEPTED_ART_TYPES, REQUIRED_CONSTANT_KEYS, createBundleGameData });
