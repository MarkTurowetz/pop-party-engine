import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const { createGameReadinessRuntime, createGameReleaseValidator } = require("./game-readiness-runtime");
const { coreSemanticRoleDefinitions } = require("../shared/semantic-role-schema");

function semanticFixture() {
  const roles = {};
  const compositions = {};
  for (const [index, [role, definition]] of Object.entries(coreSemanticRoleDefinitions).entries()) {
    const compositionId = `fixture-${index}`;
    const componentKind = definition.terminalKind === "composition" ? "" : definition.terminalKind;
    roles[role] = componentKind ? { compositionId, instancePath: ["target"] } : { compositionId };
    const components = (definition.requiredInstanceLabels || []).map((instanceLabel) => ({
      id: instanceLabel,
      instanceLabel,
      kind: "shape"
    }));
    if (componentKind) components.push({ id: "target", instanceLabel: "target", kind: componentKind });
    compositions[compositionId] = {
      surface: definition.surface,
      components
    };
  }
  return { roles, artManifest: { compositions } };
}

function fixture(overrides = {}) {
  const semantic = semanticFixture();
  const documents = {
    "semantic-roles.json": { schemaVersion: 1, roles: semantic.roles },
    "art/manifest.json": { ...semantic.artManifest, assets: [] },
    "flow.json": { states: [{ id: "lobby", actions: [] }, { id: "intro", actions: [] }], routeNodes: [] },
    "constants.json": {
      playerColors: ["#ffffff"],
      craftingTimerDuration: 30,
      startGameCountdownDuration: 1,
      pointsForCorrectAnswer: 200,
      gameTitle: "Fixture",
      numberOfRounds: 3,
      randomChanceTest: 0.5,
      speechToTextSendInputBuffer: 1,
      overrideFirstGameOfSession: false,
      customConstants: []
    },
    "layouts/stage.json": { canvas: {}, global: {}, states: [{ id: "lobby", elements: [] }] },
    "layouts/controller.json": { canvas: {}, global: {}, states: [{ id: "join", elements: [] }] },
    "audio/host-audios.json": { hostAudios: [] },
    "prompts/prompts.json": { prompts: [] },
    "game-data/runtime.json": { schemaVersion: 1, avatarShapes: ["triangle"], artGroups: [], availableFlowTransitions: [] }
  };
  const snapshot = {
    revision: "content-1",
    manifest: { gameId: "fixture-game", engineContentSchemaVersion: "1.0.0", semanticRolesPath: "semantic-roles.json" },
    readJson: vi.fn((logicalPath) => structuredClone(documents[logicalPath]))
  };
  const release = {
    gameId: "fixture-game",
    gameBuild: "0.1.0",
    engineVersion: "1.0.0",
    pluginVersion: "0.1.0",
    contentRevision: "content-1",
    releaseRevision: "release-1",
    ...(overrides.release || {})
  };
  const game = {
    gameId: "fixture-game",
    version: "0.1.0",
    engineCompatibility: "1.0.0",
    semanticRoles: semantic.roles,
    registrations: { validators: overrides.validators || [] },
    content: {
      mode: "bundle",
      store: {
        getActiveRelease: vi.fn(async () => release),
        loadPublishedRevision: vi.fn(async () => snapshot)
      }
    },
    ...(overrides.game || {})
  };
  return { game, release, snapshot };
}

describe("game readiness runtime", () => {
  it("returns an immutable active tuple only after the entire bundle is compatible", async () => {
    const validator = vi.fn(async () => ({ ok: true }));
    const { game } = fixture({ validators: [{ id: "fixture.validate", value: validator }] });
    const runtime = createGameReadinessRuntime({ gameDefinition: game, engineVersion: "1.0.0" });
    const result = await runtime.check();
    expect(result.release).toMatchObject({ gameId: "fixture-game", contentRevision: "content-1" });
    expect(result.semanticRoles).toEqual(semanticFixture().roles);
    expect(result.gameData.defaultGameFlow.states[0].id).toBe("lobby");
    expect(validator).toHaveBeenCalledOnce();
    expect(runtime.state.status).toBe("ready");
  });

  it("fails closed when the active release targets another engine", async () => {
    const { game } = fixture({ release: { engineVersion: "2.0.0" } });
    const runtime = createGameReadinessRuntime({ gameDefinition: game, engineVersion: "1.0.0" });
    await expect(runtime.check()).rejects.toMatchObject({ code: "ACTIVE_RELEASE_ENGINE_MISMATCH" });
    expect(runtime.state).toMatchObject({ status: "failed", diagnostic: { code: "ACTIVE_RELEASE_ENGINE_MISMATCH" } });
  });

  it("fails closed on missing semantic roles and plugin validation errors", async () => {
    const { game, snapshot } = fixture({ validators: [{ id: "fixture.validate", value: () => ({ ok: false, diagnostics: ["bad"] }) }] });
    const semantic = semanticFixture();
    const originalReadJson = snapshot.readJson;
    snapshot.readJson = (logicalPath) => logicalPath === "semantic-roles.json"
      ? { schemaVersion: 1, roles: {} }
      : originalReadJson(logicalPath);
    const rolesRuntime = createGameReadinessRuntime({ gameDefinition: game, engineVersion: "1.0.0" });
    await expect(rolesRuntime.check()).rejects.toMatchObject({ code: "SEMANTIC_ROLE_REQUIRED_MISSING" });
    snapshot.readJson = originalReadJson;
    const validatorRuntime = createGameReadinessRuntime({ gameDefinition: game, engineVersion: "1.0.0" });
    await expect(validatorRuntime.check()).rejects.toMatchObject({ code: "PLUGIN_VALIDATION_FAILED" });
  });

  it("fails closed when pinned bundle runtime data is incomplete", async () => {
    const { game, snapshot } = fixture();
    const originalReadJson = snapshot.readJson;
    snapshot.readJson = (logicalPath) => logicalPath === "constants.json"
      ? { playerColors: ["#ffffff"], customConstants: [] }
      : originalReadJson(logicalPath);
    const runtime = createGameReadinessRuntime({ gameDefinition: game, engineVersion: "1.0.0" });

    await expect(runtime.check()).rejects.toMatchObject({ code: "BUNDLE_GAME_DATA_INVALID" });
    expect(runtime.state).toMatchObject({ status: "failed", diagnostic: { code: "BUNDLE_GAME_DATA_INVALID" } });
  });

  it("validates an already-pinned room snapshot without requiring bundle mode on the game definition", async () => {
    const { game, release, snapshot } = fixture({ game: { content: { mode: "legacy-monolith" } } });
    const gameData = { defaultGameFlow: { states: [{ id: "lobby" }] } };
    const validateRelease = createGameReleaseValidator({ gameDefinition: game, engineVersion: "1.0.0" });

    await expect(validateRelease({ gameData, release, snapshot })).resolves.toMatchObject({
      release: { contentRevision: "content-1" },
      semanticRoles: semanticFixture().roles
    });

    await expect(validateRelease({
      gameData,
      release: { ...release, gameBuild: "9.9.9" },
      snapshot
    })).rejects.toMatchObject({ code: "ACTIVE_RELEASE_GAME_BUILD_MISMATCH" });
  });
});
