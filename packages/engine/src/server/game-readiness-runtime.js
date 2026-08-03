"use strict";

const {
  normalizeSemanticRoleMap,
  semanticRoleTargetKey,
  validateSemanticRoleDocument
} = require("../shared/semantic-role-schema");
const { ENGINE_CONTENT_SCHEMA_VERSION } = require("../shared/content-bundle-schema");
const { createBundleGameData } = require("./content-game-data-runtime");

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

function layoutElementsForRenderer(gameData, surface, target = {}) {
  const layouts = surface === "stage" ? gameData.defaultStageLayouts : gameData.defaultControllerLayouts;
  if (!layouts) return [];
  const scope = String(target.layoutScope || "moment");
  if (scope === "global") return layouts.global?.elements || [];
  if (scope === "layer") {
    return (layouts.layers || []).find((layer) => String(layer.id || "") === String(target.layoutLayerId || ""))?.elements || [];
  }
  return (layouts.states || []).flatMap((state) => state.elements || []);
}

function artComponentForId(components, componentId, compositions, visited = new Set()) {
  for (const component of components || []) {
    if ([component.id, component.instanceLabel, component.name].some((value) => String(value || "") === componentId)) return component;
    const nested = artComponentForId(component.children, componentId, compositions, visited);
    if (nested) return nested;
    const referenceId = String(component.artCompositionId || "");
    if (String(component.kind || "").toLowerCase() !== "reference" || !referenceId || visited.has(referenceId)) continue;
    const referenced = compositions.get(referenceId);
    if (!referenced) continue;
    const match = artComponentForId(referenced.components, componentId, compositions, new Set([...visited, referenceId]));
    if (match) return match;
  }
  return null;
}

function validateRendererItemContract({ registration, binding, surface, compositions }) {
  const compositionId = String(binding.item?.artCompositionId || "");
  const composition = compositions.get(compositionId);
  if (!composition || String(composition.surface || "").toLowerCase() !== surface || String(composition.compositionKind || "gameObject").toLowerCase() !== "gameobject") {
    readinessFailure("PLUGIN_RENDERER_COLLECTION_COMPOSITION_INVALID", `Renderer "${registration.id}" collection references an unknown or wrong-surface Game Object`, { rendererId: registration.id, compositionId, surface });
  }
  for (const child of binding.item.bindings || []) {
    const targetId = String(child.targetComponentId || "");
    const target = targetId ? artComponentForId(composition.components, targetId, compositions, new Set([compositionId])) : null;
    if ((child.kind === "text" || child.kind === "component" || (child.kind === "state" && targetId)) && !target) {
      readinessFailure("PLUGIN_RENDERER_COLLECTION_COMPONENT_INVALID", `Renderer "${registration.id}" collection binding targets an unknown Art component`, { rendererId: registration.id, compositionId, targetComponentId: targetId });
    }
    if (child.kind === "collection") {
      if (!target || String(target.kind || "").toLowerCase() !== "container") {
        readinessFailure("PLUGIN_RENDERER_NESTED_COLLECTION_TARGET_INVALID", `Renderer "${registration.id}" nested collection must target an Art Manager container`, { rendererId: registration.id, compositionId, targetComponentId: targetId });
      }
      validateRendererItemContract({ registration, binding: child, surface, compositions });
    }
  }
}

function validateRendererContentContracts(game, gameData, semanticRoles) {
  const compositions = new Map((gameData.defaultArtCompositions || []).map((composition) => [String(composition.id || ""), composition]));
  for (const [kind, surface] of [["stageRenderers", "stage"], ["controllerRenderers", "controller"]]) {
    for (const registration of game.registrations?.[kind] || []) {
      const collections = (registration.value.bindings || []).filter((binding) => binding.kind === "collection");
      if (!collections.length) continue;
      const candidates = layoutElementsForRenderer(gameData, surface, registration.value.target);
      const targetId = String(registration.value.target.layoutElementId || "");
      const target = candidates.find((element) => String(element.id || "") === targetId);
      if (!target || String(target.kind || "").toLowerCase() !== "collection") {
        readinessFailure("PLUGIN_RENDERER_COLLECTION_TARGET_INVALID", `Renderer "${registration.id}" collection must target a same-surface Layout collection`, { rendererId: registration.id, targetId, surface });
      }
      if (collections.length !== 1 || (registration.value.bindings || []).length !== 1) {
        readinessFailure("PLUGIN_RENDERER_COLLECTION_ROOT_INVALID", `Renderer "${registration.id}" collection target requires exactly one root collection binding`, { rendererId: registration.id });
      }
      validateRendererItemContract({ registration, binding: collections[0], surface, compositions });
    }
  }
}

function validateControllerInteractionContentContracts(game, gameData) {
  const compositions = new Map((gameData.defaultArtCompositions || []).map((composition) => [String(composition.id || ""), composition]));
  for (const registration of game.registrations?.controllerInteractions || []) {
    const config = registration.value;
    const candidates = layoutElementsForRenderer(gameData, "controller", {
      layoutScope: config.controller.layoutScope,
      layoutLayerId: config.controller.layoutLayerId
    });
    const elements = new Map(candidates.map((element) => [String(element.id || ""), element]));
    const disclosure = config.controller.disclosure;
    if (disclosure) {
      const triggerCandidates = layoutElementsForRenderer(gameData, "controller", {
        layoutScope: String(disclosure.triggerLayoutScope || "global"),
        layoutLayerId: disclosure.triggerLayoutLayerId
      });
      if (!triggerCandidates.some((element) => String(element.id || "") === String(disclosure.triggerLayoutElementId || ""))) {
        readinessFailure("PLUGIN_CONTROLLER_INTERACTION_DISCLOSURE_TARGET_INVALID", `Controller interaction "${registration.id}" disclosure targets an unknown Controller Layout element`, {
          interactionId: registration.id,
          targetId: String(disclosure.triggerLayoutElementId || ""),
          layoutScope: String(disclosure.triggerLayoutScope || "global")
        });
      }
    }
    for (const binding of config.controller.bindings || []) {
      const targetId = String(binding.layoutElementId || "");
      const target = elements.get(targetId);
      if (!target) {
        readinessFailure("PLUGIN_CONTROLLER_INTERACTION_TARGET_INVALID", `Controller interaction "${registration.id}" targets an unknown persistent Controller Layout element`, {
          interactionId: registration.id,
          targetId,
          layoutScope: config.controller.layoutScope,
          layoutLayerId: config.controller.layoutLayerId || ""
        });
      }
      if (binding.kind === "choiceCollection") {
        if (String(target.kind || "").toLowerCase() !== "collection") {
          readinessFailure("PLUGIN_CONTROLLER_INTERACTION_COLLECTION_TARGET_INVALID", `Controller interaction "${registration.id}" choice collection must target a Controller Layout collection`, { interactionId: registration.id, targetId });
        }
        const compositionId = String(binding.item?.artCompositionId || "");
        const composition = compositions.get(compositionId);
        if (!composition || String(composition.surface || "").toLowerCase() !== "controller" || String(composition.compositionKind || "gameObject").toLowerCase() !== "gameobject") {
          readinessFailure("PLUGIN_CONTROLLER_INTERACTION_COMPOSITION_INVALID", `Controller interaction "${registration.id}" references an unknown or wrong-surface Controller Game Object`, { interactionId: registration.id, compositionId });
        }
        const componentId = String(binding.item?.targetComponentId || "");
        if (!artComponentForId(composition.components, componentId, compositions, new Set([compositionId]))) {
          readinessFailure("PLUGIN_CONTROLLER_INTERACTION_COMPONENT_INVALID", `Controller interaction "${registration.id}" choice item targets an unknown Art component`, { interactionId: registration.id, compositionId, targetComponentId: componentId });
        }
        continue;
      }
      if (binding.kind === "text") {
        const compositionId = String(target.artCompositionId || "");
        const composition = compositions.get(compositionId);
        const componentId = String(binding.targetComponentId || "");
        if (!composition || !artComponentForId(composition.components, componentId, compositions, new Set([compositionId]))) {
          readinessFailure("PLUGIN_CONTROLLER_INTERACTION_COMPONENT_INVALID", `Controller interaction "${registration.id}" text binding targets an unknown Art component`, { interactionId: registration.id, compositionId, targetComponentId: componentId });
        }
      }
      if (binding.kind === "choice") {
        const compositionId = String(target.artCompositionId || "");
        const composition = compositions.get(compositionId);
        for (const componentId of [binding.interactionTargetComponentId].filter(Boolean)) {
          if (!composition || !artComponentForId(composition.components, String(componentId), compositions, new Set([compositionId]))) {
            readinessFailure("PLUGIN_CONTROLLER_INTERACTION_COMPONENT_INVALID", `Controller interaction "${registration.id}" choice binding targets an unknown Art component`, {
              interactionId: registration.id,
              compositionId,
              targetComponentId: String(componentId)
            });
          }
        }
      }
    }
  }
}

function createGameReleaseValidator(options = {}) {
  const game = options.gameDefinition;
  if (!game || typeof game !== "object") throw new Error("Game release validation requires a defined game");
  const engineVersion = String(options.engineVersion || "").trim();
  const contentSchemaVersion = String(options.contentSchemaVersion || ENGINE_CONTENT_SCHEMA_VERSION).trim();
  if (!engineVersion) throw new Error("Game release validation requires the running engine version");

  return async function validateGameRelease(context = {}) {
    const { gameData, release, snapshot } = context;
    if (!release?.releaseRevision || !release?.contentRevision) readinessFailure("ACTIVE_RELEASE_MISSING", "No complete active release is available");
    if (release.gameId !== game.gameId) readinessFailure("ACTIVE_RELEASE_GAME_MISMATCH", "Active release belongs to another game", { expected: game.gameId, actual: release.gameId });
    if (release.gameBuild !== game.version) readinessFailure("ACTIVE_RELEASE_GAME_BUILD_MISMATCH", "Active release targets another game build", { expected: game.version, actual: release.gameBuild });
    if (game.engineCompatibility !== engineVersion) readinessFailure("GAME_ENGINE_INCOMPATIBLE", "Game does not declare compatibility with the running engine", { expected: game.engineCompatibility, actual: engineVersion });
    if (release.engineVersion !== engineVersion) readinessFailure("ACTIVE_RELEASE_ENGINE_MISMATCH", "Active release targets another engine version", { expected: engineVersion, actual: release.engineVersion });
    if (release.pluginVersion !== game.version) readinessFailure("ACTIVE_RELEASE_PLUGIN_MISMATCH", "Active release targets another game plugin version", { expected: game.version, actual: release.pluginVersion });
    if (!snapshot || snapshot.revision !== release.contentRevision) readinessFailure("ACTIVE_CONTENT_REVISION_MISMATCH", "Loaded content revision differs from the active release", { expected: release.contentRevision, actual: snapshot?.revision || "" });
    if (snapshot.manifest?.gameId !== game.gameId) readinessFailure("ACTIVE_CONTENT_GAME_MISMATCH", "Loaded content belongs to another game", { expected: game.gameId, actual: snapshot.manifest?.gameId || "" });
    if (snapshot.manifest?.engineContentSchemaVersion !== contentSchemaVersion) readinessFailure("ACTIVE_CONTENT_SCHEMA_MISMATCH", "Loaded content targets another engine content schema", { expected: contentSchemaVersion, actual: snapshot.manifest?.engineContentSchemaVersion || "" });
    if (!gameData || typeof gameData !== "object") readinessFailure("BUNDLE_GAME_DATA_INVALID", "Active content did not materialize complete game runtime data");
    const semanticRoles = semanticRolesFrom(snapshot);
    assertExpectedSemanticRoles(game.semanticRoles, semanticRoles);
    validateRendererContentContracts(game, gameData, semanticRoles);
    validateControllerInteractionContentContracts(game, gameData);
    for (const registration of game.registrations?.validators || []) {
      if (typeof registration.value !== "function") readinessFailure("PLUGIN_VALIDATOR_INVALID", "Game validator registration is not callable", { id: registration.id });
      const validation = await registration.value({ game, gameData, release, semanticRoles, snapshot });
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
    return Object.freeze({ game, gameData, release: readyRelease, semanticRoles, snapshot });
  };
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
  const contentSchemaVersion = String(options.contentSchemaVersion || ENGINE_CONTENT_SCHEMA_VERSION).trim();
  if (!engineVersion) throw new Error("Game readiness requires the running engine version");
  const validateGameRelease = createGameReleaseValidator({
    gameDefinition: game,
    engineVersion,
    contentSchemaVersion
  });
  let state = Object.freeze({ status: "pending", diagnostic: null, release: null });

  async function check() {
    try {
      const release = await contentStore.getActiveRelease();
      if (!release?.releaseRevision || !release?.contentRevision) readinessFailure("ACTIVE_RELEASE_MISSING", "No complete active release is available");
      let snapshot;
      try {
        snapshot = await contentStore.loadPublishedRevision(release.contentRevision);
      } catch (error) {
        readinessFailure("ACTIVE_CONTENT_LOAD_FAILED", "Active content revision could not be loaded", { contentRevision: release.contentRevision, cause: error.message });
      }
      let gameData;
      try {
        gameData = createBundleGameData(snapshot);
      } catch (error) {
        readinessFailure("BUNDLE_GAME_DATA_INVALID", "Active content cannot materialize complete game runtime data", {
          cause: error.message
        });
      }
      const active = await validateGameRelease({ gameData, release, snapshot });
      state = Object.freeze({ status: "ready", diagnostic: null, release: active.release });
      return active;
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

module.exports = Object.freeze({ GameReadinessError, createGameReadinessRuntime, createGameReleaseValidator });
