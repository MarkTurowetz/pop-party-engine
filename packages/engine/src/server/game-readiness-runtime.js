"use strict";

const {
  normalizeSemanticRoleMap,
  semanticRoleTargetKey,
  validateSemanticRoleDocument
} = require("../shared/semantic-role-schema");

class GameReadinessError extends Error {
  constructor(message, { code = "GAME_NOT_READY", details = {} } = {}) {
    super(message);
    this.name = "GameReadinessError";
    this.code = code;
    this.details = Object.freeze({ ...details });
  }
}

function readinessFailure(code, message, details = {}) {
  throw new GameReadinessError(message, { code, details });
}

function semanticRolesFrom(snapshot) {
  const logicalPath = String(snapshot.manifest.semanticRolesPath || "");
  let document;
  try {
    document = snapshot.readJson(logicalPath);
  } catch (error) {
    readinessFailure("SEMANTIC_ROLES_LOAD_FAILED", "Semantic roles could not be loaded", { logicalPath, cause: error.message });
  }
  let artManifest;
  try {
    artManifest = snapshot.readJson("art/manifest.json");
  } catch (error) {
    readinessFailure("SEMANTIC_ROLE_ART_LOAD_FAILED", "Art manifest could not be loaded for semantic role validation", { cause: error.message });
  }
  try {
    return validateSemanticRoleDocument(document, artManifest).roles;
  } catch (error) {
    readinessFailure(error.code || "SEMANTIC_ROLES_INVALID", error.message, { logicalPath, ...(error.details || {}) });
  }
}

function assertExpectedSemanticRoles(expectedRoles, actualRoles) {
  const expected = normalizeSemanticRoleMap(expectedRoles || {}, { requireCoreRoles: false });
  for (const [role, target] of Object.entries(expected)) {
    if (!actualRoles[role] || semanticRoleTargetKey(actualRoles[role]) !== semanticRoleTargetKey(target)) {
      readinessFailure("SEMANTIC_ROLE_MISMATCH", "Active content does not match the game semantic role mapping", {
        role,
        expectedTarget: semanticRoleTargetKey(target),
        actualTarget: actualRoles[role] ? semanticRoleTargetKey(actualRoles[role]) : ""
      });
    }
  }
}

function createGameReadinessRuntime(options = {}) {
  const game = options.gameDefinition;
  if (!game || typeof game !== "object") throw new Error("Game readiness requires a defined game");
  if (game.content?.mode !== "bundle") throw new Error("Game readiness requires bundle content mode");
  const contentStore = game.content.store;
  if (!contentStore || typeof contentStore.getActiveRelease !== "function" || typeof contentStore.loadPublishedRevision !== "function") {
    throw new Error("Game readiness requires a bundle content store");
  }
  const engineVersion = String(options.engineVersion || "").trim();
  const contentSchemaVersion = String(options.contentSchemaVersion || engineVersion).trim();
  if (!engineVersion) throw new Error("Game readiness requires the running engine version");
  let state = Object.freeze({ status: "pending", diagnostic: null, release: null });

  async function check() {
    try {
      const release = await contentStore.getActiveRelease();
      if (!release?.releaseRevision || !release?.contentRevision) readinessFailure("ACTIVE_RELEASE_MISSING", "No complete active release is available");
      if (release.gameId !== game.gameId) readinessFailure("ACTIVE_RELEASE_GAME_MISMATCH", "Active release belongs to another game", { expected: game.gameId, actual: release.gameId });
      if (release.gameBuild !== game.version) readinessFailure("ACTIVE_RELEASE_GAME_BUILD_MISMATCH", "Active release targets another game build", { expected: game.version, actual: release.gameBuild });
      if (game.engineCompatibility !== engineVersion) readinessFailure("GAME_ENGINE_INCOMPATIBLE", "Game does not declare compatibility with the running engine", { expected: game.engineCompatibility, actual: engineVersion });
      if (release.engineVersion !== engineVersion) readinessFailure("ACTIVE_RELEASE_ENGINE_MISMATCH", "Active release targets another engine version", { expected: engineVersion, actual: release.engineVersion });
      if (release.pluginVersion !== game.version) readinessFailure("ACTIVE_RELEASE_PLUGIN_MISMATCH", "Active release targets another game plugin version", { expected: game.version, actual: release.pluginVersion });
      let snapshot;
      try {
        snapshot = await contentStore.loadPublishedRevision(release.contentRevision);
      } catch (error) {
        readinessFailure("ACTIVE_CONTENT_LOAD_FAILED", "Active content revision could not be loaded", { contentRevision: release.contentRevision, cause: error.message });
      }
      if (snapshot.revision !== release.contentRevision) readinessFailure("ACTIVE_CONTENT_REVISION_MISMATCH", "Loaded content revision differs from the active release", { expected: release.contentRevision, actual: snapshot.revision });
      if (snapshot.manifest.gameId !== game.gameId) readinessFailure("ACTIVE_CONTENT_GAME_MISMATCH", "Loaded content belongs to another game", { expected: game.gameId, actual: snapshot.manifest.gameId });
      if (snapshot.manifest.engineContentSchemaVersion !== contentSchemaVersion) readinessFailure("ACTIVE_CONTENT_SCHEMA_MISMATCH", "Loaded content targets another engine content schema", { expected: contentSchemaVersion, actual: snapshot.manifest.engineContentSchemaVersion });
      const semanticRoles = semanticRolesFrom(snapshot);
      assertExpectedSemanticRoles(game.semanticRoles, semanticRoles);
      for (const registration of game.registrations.validators || []) {
        if (typeof registration.value !== "function") readinessFailure("PLUGIN_VALIDATOR_INVALID", "Game validator registration is not callable", { id: registration.id });
        const validation = await registration.value({ game, release, semanticRoles, snapshot });
        if (validation?.ok === false) readinessFailure("PLUGIN_VALIDATION_FAILED", "Game validator rejected the active release", { id: registration.id, diagnostics: validation.diagnostics || [] });
      }
      const readyRelease = Object.freeze({
        gameId: release.gameId,
        gameBuild: release.gameBuild,
        engineVersion: release.engineVersion,
        pluginVersion: release.pluginVersion,
        contentRevision: release.contentRevision,
        releaseRevision: release.releaseRevision
      });
      state = Object.freeze({ status: "ready", diagnostic: null, release: readyRelease });
      return Object.freeze({ game, release: readyRelease, semanticRoles, snapshot });
    } catch (error) {
      const diagnostic = Object.freeze({
        code: String(error.code || "GAME_READINESS_FAILED"),
        message: String(error.message || "Game readiness failed"),
        details: Object.freeze({ ...(error.details || {}) })
      });
      state = Object.freeze({ status: "failed", diagnostic, release: null });
      throw error;
    }
  }

  return Object.freeze({
    check,
    get state() {
      return state;
    }
  });
}

module.exports = Object.freeze({ GameReadinessError, createGameReadinessRuntime });
