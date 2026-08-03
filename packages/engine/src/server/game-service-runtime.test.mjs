import { EventEmitter } from "node:events";
import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const { createGameServiceRuntime } = require("./game-service-runtime");
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
    compositions[compositionId] = { surface: definition.surface, components };
  }
  return { roles, artManifest: { compositions } };
}

function gameFixture(events, releaseOverrides = {}) {
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
    readJson(logicalPath) {
      return structuredClone(documents[logicalPath]);
    }
  };
  const release = {
    gameId: "fixture-game",
    gameBuild: "0.1.0",
    engineVersion: "1.0.0",
    pluginVersion: "0.1.0",
    contentRevision: "content-1",
    releaseRevision: "release-1",
    ...releaseOverrides
  };
  return {
    gameId: "fixture-game",
    version: "0.1.0",
    engineCompatibility: "1.0.0",
    semanticRoles: semantic.roles,
    registrations: { validators: [] },
    content: {
      mode: "bundle",
      store: {
        async getActiveRelease() {
          events.push("active-release");
          return release;
        },
        async loadPublishedRevision() {
          events.push("content-snapshot");
          return snapshot;
        }
      }
    }
  };
}

function fakeServer(events) {
  const server = new EventEmitter();
  server.listening = false;
  server.listen = vi.fn(() => {
    events.push("bind");
    queueMicrotask(() => {
      server.listening = true;
      server.emit("listening");
    });
  });
  server.address = () => ({ port: 4321 });
  server.close = vi.fn((callback) => {
    server.listening = false;
    callback();
  });
  return server;
}

describe("createGameServiceRuntime", () => {
  it("pins ready content and creates the authoritative handler before binding", async () => {
    const events = [];
    const gameDefinition = gameFixture(events);
    const server = fakeServer(events);
    let dispatch;
    const runtime = createGameServiceRuntime({
      gameDefinition,
      engineVersion: "1.0.0",
      port: 0,
      createServer(handler) {
        events.push("server-created");
        dispatch = handler;
        return server;
      },
      createRequestHandler(active) {
        events.push(`handler:${active.release.contentRevision}`);
        return () => active.release.contentRevision;
      },
      initialize(active) {
        events.push(`initialize:${active.release.releaseRevision}`);
      },
      onStarted(startup, active) {
        events.push(`started:${startup.port}:${active.release.contentRevision}`);
      }
    });

    await runtime.start();

    expect(events).toEqual([
      "server-created",
      "active-release",
      "content-snapshot",
      "handler:content-1",
      "initialize:release-1",
      "bind",
      "started:4321:content-1"
    ]);
    expect(dispatch({}, {})).toBe("content-1");
    expect(runtime.active.release.contentRevision).toBe("content-1");
    expect(runtime.state).toMatchObject({ status: "running", release: { releaseRevision: "release-1" } });

    await runtime.stop();
    expect(runtime.active).toBeNull();
    expect(runtime.state.status).toBe("stopped");
  });

  it("keeps the port closed when readiness fails", async () => {
    const events = [];
    const server = fakeServer(events);
    const createRequestHandler = vi.fn(() => () => {});
    const runtime = createGameServiceRuntime({
      gameDefinition: gameFixture(events, { engineVersion: "2.0.0" }),
      engineVersion: "1.0.0",
      createServer: () => server,
      createRequestHandler
    });

    await expect(runtime.start()).rejects.toMatchObject({ code: "ACTIVE_RELEASE_ENGINE_MISMATCH" });
    expect(createRequestHandler).not.toHaveBeenCalled();
    expect(server.listen).not.toHaveBeenCalled();
    expect(runtime.active).toBeNull();
    expect(runtime.state).toMatchObject({ status: "failed", diagnostic: { code: "ACTIVE_RELEASE_ENGINE_MISMATCH" } });
  });

  it("rejects a missing authoritative request handler instead of installing a fallback", async () => {
    const events = [];
    const server = fakeServer(events);
    const runtime = createGameServiceRuntime({
      gameDefinition: gameFixture(events),
      engineVersion: "1.0.0",
      createServer: () => server,
      createRequestHandler: () => null
    });

    await expect(runtime.start()).rejects.toMatchObject({ code: "GAME_REQUEST_HANDLER_INVALID" });
    expect(server.listen).not.toHaveBeenCalled();
    expect(runtime.active).toBeNull();
    expect(runtime.state).toMatchObject({ status: "failed", diagnostic: { code: "GAME_REQUEST_HANDLER_INVALID" } });
  });
});
