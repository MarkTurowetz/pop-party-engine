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
    "game-data/runtime.json": { schemaVersion: 1, artGroups: [], availableFlowTransitions: [] }
  };
  const snapshot = {
    revision: "content-1",
    manifest: { gameId: "fixture-game", engineContentSchemaVersion: "1.2.0", semanticRolesPath: "semantic-roles.json" },
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
  it("keeps content-schema compatibility independent from engine patch releases", async () => {
    const { game } = fixture({
      game: { engineCompatibility: "1.2.2" },
      release: { engineVersion: "1.2.2" }
    });
    const runtime = createGameReadinessRuntime({ gameDefinition: game, engineVersion: "1.2.2" });

    await expect(runtime.check()).resolves.toMatchObject({
      release: { engineVersion: "1.2.2", contentRevision: "content-1" },
      snapshot: { manifest: { engineContentSchemaVersion: "1.2.0" } }
    });
  });

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

  it("validates nested renderer collection layout, composition, and container references at readiness", async () => {
    const { game, release, snapshot } = fixture({
      game: {
        registrations: {
          validators: [],
          stageRenderers: [{
            id: "fixture.hand",
            value: {
              target: { layoutElementId: "hand", layoutScope: "moment" },
              bindings: [{
                id: "rows", kind: "collection", source: "rows",
                item: {
                  keySource: "id", artCompositionId: "row", bindings: [{
                    id: "cards", kind: "collection", source: "cards", targetComponentId: "slot",
                    item: { keySource: "id", artCompositionId: "card", bindings: [{ id: "label", kind: "text", source: "label", targetComponentId: "label" }] }
                  }]
                }
              }]
            }
          }],
          controllerRenderers: []
        }
      }
    });
    const gameData = {
      defaultStageLayouts: { states: [{ id: "play", elements: [{ id: "hand", kind: "collection" }] }] },
      defaultControllerLayouts: { states: [] },
      defaultArtCompositions: [
        { id: "row", surface: "stage", compositionKind: "gameObject", components: [{ id: "slot", kind: "container" }] },
        { id: "card", surface: "stage", compositionKind: "gameObject", components: [{ id: "label", kind: "text" }] }
      ]
    };
    const validateRelease = createGameReleaseValidator({ gameDefinition: game, engineVersion: "1.0.0" });
    await expect(validateRelease({ gameData, release, snapshot })).resolves.toMatchObject({ release: { contentRevision: "content-1" } });

    gameData.defaultArtCompositions[0].components[0].kind = "shape";
    await expect(validateRelease({ gameData, release, snapshot })).rejects.toMatchObject({ code: "PLUGIN_RENDERER_NESTED_COLLECTION_TARGET_INVALID" });
  });

  it("fails closed when a persistent controller interaction targets invalid authored content", async () => {
    const registration = {
      id: "fixture.profile",
      value: {
        controller: {
          layoutScope: "layer",
          layoutLayerId: "profile-picker",
          disclosure: { triggerLayoutElementId: "player-banner", triggerLayoutScope: "global" },
          bindings: [{
            id: "avatars",
            kind: "choiceCollection",
            layoutElementId: "avatar-options",
            field: "avatarId",
            item: { artCompositionId: "avatar-option", targetComponentId: "label" }
          }]
        }
      }
    };
    const { game, release, snapshot } = fixture({
      game: {
        registrations: {
          validators: [],
          stageRenderers: [],
          controllerRenderers: [],
          controllerInteractions: [registration]
        }
      }
    });
    const gameData = {
      defaultStageLayouts: { states: [] },
      defaultControllerLayouts: {
        global: { elements: [{ id: "player-banner", kind: "art", artCompositionId: "player-banner" }] },
        layers: [{ id: "profile-picker", elements: [{ id: "avatar-options", kind: "collection" }] }],
        states: []
      },
      defaultArtCompositions: [{
        id: "avatar-option",
        surface: "controller",
        compositionKind: "gameObject",
        components: [{ id: "label", kind: "text" }]
      }, {
        id: "player-banner",
        surface: "controller",
        compositionKind: "gameObject",
        components: []
      }]
    };
    const validateRelease = createGameReleaseValidator({ gameDefinition: game, engineVersion: "1.0.0" });
    await expect(validateRelease({ gameData, release, snapshot })).resolves.toMatchObject({ release: { contentRevision: "content-1" } });

    gameData.defaultArtCompositions[0].surface = "stage";
    await expect(validateRelease({ gameData, release, snapshot })).rejects.toMatchObject({
      code: "PLUGIN_CONTROLLER_INTERACTION_COMPOSITION_INVALID"
    });
    gameData.defaultArtCompositions[0].surface = "controller";
    gameData.defaultControllerLayouts.layers[0].elements[0].kind = "art";
    await expect(validateRelease({ gameData, release, snapshot })).rejects.toMatchObject({
      code: "PLUGIN_CONTROLLER_INTERACTION_COLLECTION_TARGET_INVALID"
    });
  });

  it("fails readiness closed when fixed or collection interaction and hold Art contracts cannot resolve their authored timelines", async () => {
    const progress = {
      delaySeconds: 0.5,
      targetComponentId: "hold-meter-ref",
      startLabel: "HoldStart",
      completeLabel: "HoldComplete",
      resetLabel: "Off"
    };
    const registration = {
      id: "fixture.gesture",
      value: {
        controller: {
          layoutStateId: "gesture",
          bindings: [
            {
              id: "fixed", kind: "choice", layoutElementId: "fixed-choice", field: "choice", optionIndex: 0,
              interactionTargetComponentId: "interaction-ref",
              holdSubmit: { seconds: 1.5, submitValues: {}, progress }
            },
            {
              id: "collection", kind: "choiceCollection", layoutElementId: "choice-list", field: "choice",
              interactionTargetComponentId: "interaction-ref",
              item: { artCompositionId: "choice-button", targetComponentId: "label" },
              holdSubmit: { seconds: 1.5, submitValues: {}, progress }
            }
          ]
        }
      }
    };
    const { game, release, snapshot } = fixture({
      game: { registrations: { validators: [], inputs: [registration] } }
    });
    const meterTimeline = {
      fps: 10,
      frameCount: 12,
      labels: [
        { name: "Off", frame: 0 },
        { name: "HoldStart", frame: 1 },
        { name: "HoldComplete", frame: 11 }
      ],
      commands: [{ frame: 0, type: "setVisible", target: "false" }, { frame: 11, type: "stop" }],
      tracks: [{ targetId: "meter-fill", keyframes: [
        { frame: 1, easing: "linear", props: { scale: 0 } },
        { frame: 11, props: { scale: 1 } }
      ] }]
    };
    const interactionTimeline = {
      fps: 30,
      frameCount: 13,
      labels: [
        { name: "Default", frame: 0 },
        { name: "Down", frame: 1 },
        { name: "Up", frame: 4 },
        { name: "HoverIn", frame: 7 },
        { name: "HoverOut", frame: 10 }
      ],
      commands: [0, 3, 6, 9, 12].map((frame) => ({ frame, type: "stop" })),
      tracks: []
    };
    const gameData = {
      defaultStageLayouts: { states: [] },
      defaultControllerLayouts: {
        global: { elements: [] },
        states: [{ id: "gesture", elements: [
          { id: "fixed-choice", kind: "art", artCompositionId: "choice-button" },
          { id: "choice-list", kind: "collection" }
        ] }]
      },
      defaultArtCompositions: [
        {
          id: "choice-button",
          surface: "controller",
          compositionKind: "gameObject",
          components: [
            { id: "label", kind: "text" },
            { id: "interaction-ref", kind: "reference", artCompositionId: "choice-interaction" },
            { id: "hold-meter-ref", kind: "reference", artCompositionId: "hold-meter" }
          ]
        },
        {
          id: "hold-meter",
          surface: "controller",
          compositionKind: "prefab",
          components: [{ id: "meter-fill", kind: "shape" }],
          timeline: meterTimeline
        },
        {
          id: "choice-interaction",
          surface: "controller",
          compositionKind: "prefab",
          components: [{ id: "interaction-shape", kind: "shape" }],
          timeline: interactionTimeline
        }
      ]
    };
    const validateRelease = createGameReleaseValidator({ gameDefinition: game, engineVersion: "1.0.0" });

    await expect(validateRelease({ gameData, release, snapshot })).resolves.toMatchObject({ release: { contentRevision: "content-1" } });
    gameData.defaultArtCompositions[2].timeline.labels = gameData.defaultArtCompositions[2].timeline.labels
      .filter((label) => label.name !== "HoverOut");
    await expect(validateRelease({ gameData, release, snapshot })).rejects.toMatchObject({
      code: "PLUGIN_INPUT_INTERACTION_TIMELINE_INVALID",
      details: { missingLabels: ["HoverOut"] }
    });
    gameData.defaultArtCompositions[2].timeline.labels.push({ name: "HoverOut", frame: 10 });
    gameData.defaultArtCompositions[1].timeline.labels = gameData.defaultArtCompositions[1].timeline.labels
      .filter((label) => label.name !== "HoldComplete");
    await expect(validateRelease({ gameData, release, snapshot })).rejects.toMatchObject({
      code: "PLUGIN_INPUT_HOLD_PROGRESS_TIMELINE_INVALID"
    });
  });

  it("validates game-owned player collections without an engine roster composition", async () => {
    const registration = {
      id: "fixture.players",
      value: {
        target: { kind: "layout", layoutElementId: "players", layoutScope: "global" },
        bindings: [{
          id: "players", kind: "collection", source: "players",
          item: {
            keySource: "id", artCompositionId: "game-player", bindings: [
              { id: "score", kind: "text", source: "score", targetComponentId: "score" },
              {
                id: "rows", kind: "collection", source: "rows", targetComponentId: "rows",
                item: { keySource: "id", artCompositionId: "game-row", bindings: [] }
              }
            ]
          }
        }]
      }
    };
    const { game, release, snapshot } = fixture({
      game: { registrations: { validators: [], stageRenderers: [registration], controllerRenderers: [] } }
    });
    const gameData = {
      defaultStageLayouts: { global: { elements: [{ id: "players", kind: "collection" }] }, states: [] },
      defaultControllerLayouts: { states: [] },
      defaultArtCompositions: [
        {
          id: "game-player",
          surface: "stage",
          compositionKind: "gameObject",
          components: [
            { id: "score", kind: "text" },
            { id: "rows", kind: "container" }
          ]
        },
        { id: "game-row", surface: "stage", compositionKind: "gameObject", components: [] }
      ]
    };
    const validateRelease = createGameReleaseValidator({ gameDefinition: game, engineVersion: "1.0.0" });

    await expect(validateRelease({ gameData, release, snapshot })).resolves.toMatchObject({ release: { contentRevision: "content-1" } });
    gameData.defaultArtCompositions[0].components.find((component) => component.id === "rows").kind = "shape";
    await expect(validateRelease({ gameData, release, snapshot })).rejects.toMatchObject({ code: "PLUGIN_RENDERER_NESTED_COLLECTION_TARGET_INVALID" });
  });
});
