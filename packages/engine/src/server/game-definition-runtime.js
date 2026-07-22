"use strict";

const { createGamePluginRegistry } = require("./game-plugin-runtime");
const { normalizeSemanticRoleMap } = require("../shared/semantic-role-schema");

const GAME_ID_PATTERN = /^[a-z][a-z0-9-]{2,63}$/;
const VERSION_PATTERN = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/;
const REQUIRED_GAME_DATA_KEYS = Object.freeze([
  "acceptedArtTypes",
  "artAssets",
  "artGroups",
  "availableFlowActionTypes",
  "availableFlowTransitions",
  "avatarShapes",
  "defaultArtCompositions",
  "defaultControllerLayouts",
  "defaultGameConstants",
  "defaultGameFlow",
  "defaultHostAudios",
  "defaultPlayerColors",
  "defaultStageLayouts",
  "multipleChoicePrompts"
]);

function requiredString(definition, key) {
  const value = String(definition?.[key] || "").trim();
  if (!value) throw new Error(`Game definition requires ${key}`);
  return value;
}

function defineGame(definition = {}) {
  const gameId = requiredString(definition, "gameId");
  const displayName = requiredString(definition, "displayName");
  const version = requiredString(definition, "version");
  const engineCompatibility = requiredString(definition, "engineCompatibility");
  if (!GAME_ID_PATTERN.test(gameId)) throw new Error(`Game id must match ${GAME_ID_PATTERN}`);
  if (!VERSION_PATTERN.test(version)) throw new Error(`Game version must be semantic: ${version}`);
  if (!definition.gameData || typeof definition.gameData !== "object") {
    throw new Error("Game definition requires a gameData object");
  }
  const missingData = REQUIRED_GAME_DATA_KEYS.filter((key) => !(key in definition.gameData));
  if (missingData.length) {
    throw new Error(`Game definition is missing gameData: ${missingData.join(", ")}`);
  }
  if (!definition.plugin) throw new Error("Game definition requires a plugin");
  const pluginRegistry = createGamePluginRegistry();
  const registrations = pluginRegistry.install(definition.plugin);
  const content = Object.freeze({
    mode: String(definition.content?.mode || "").trim(),
    schemaVersion: Number(definition.content?.schemaVersion || 0),
    store: definition.content?.store || null
  });
  if (content.mode !== "legacy-monolith" && content.mode !== "bundle") {
    throw new Error(`Unsupported game content mode: ${content.mode || "(empty)"}`);
  }
  if (content.store && (typeof content.store.getActiveRelease !== "function" || typeof content.store.loadPublishedRevision !== "function")) {
    throw new Error("Game content store must implement getActiveRelease and loadPublishedRevision");
  }

  return Object.freeze({
    gameId,
    displayName,
    version,
    engineCompatibility,
    content,
    gameData: definition.gameData,
    plugin: definition.plugin,
    registrations,
    semanticRoles: normalizeSemanticRoleMap(definition.semanticRoles || {}, { requireCoreRoles: false })
  });
}

module.exports = { GAME_ID_PATTERN, REQUIRED_GAME_DATA_KEYS, defineGame };
