import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { defineGame } = require("./game-definition-runtime");
const { defineGamePlugin } = require("./game-plugin-runtime");
const { createGameApplicationRuntime } = require("./game-application-runtime");
const { createLocalContentBundleProvider } = require("./local-content-bundle-provider");
const { replaceSnapshotFiles } = require("./content-snapshot-runtime");
const { createRevisionedContentStoreRuntime } = require("./revisioned-content-store-runtime");

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

function fixtureStore() {
  const snapshot = createLocalContentBundleProvider({
    root: path.join(projectRoot, "apps/reference/content")
  }).loadPublishedRevision();
  return createRevisionedContentStoreRuntime({
    initialSnapshot: snapshot,
    initialRelease: {
      gameBuild: "1.0.17",
      engineVersion: "1.2.3",
      pluginVersion: "1.0.17"
    }
  });
}

function fixtureStoreWithDurableFlow() {
  const packagedSnapshot = createLocalContentBundleProvider({
    root: path.join(projectRoot, "apps/reference/content")
  }).loadPublishedRevision();
  const durableFlow = structuredClone(packagedSnapshot.readJson("flow.json"));
  const durableConstants = structuredClone(packagedSnapshot.readJson("constants.json"));
  const durableStageLayouts = structuredClone(packagedSnapshot.readJson("layouts/stage.json"));
  const durableControllerLayouts = structuredClone(packagedSnapshot.readJson("layouts/controller.json"));
  const durableHostAudios = structuredClone(packagedSnapshot.readJson("audio/host-audios.json"));
  const durableArtManifest = structuredClone(packagedSnapshot.readJson("art/manifest.json"));
  const lobby = durableFlow.states.find((state) => state.id === "lobby");
  lobby.actions.push({
    id: "durable-only-lobby-action",
    name: "Durable Only Lobby Action",
    type: "setGameObjectShown",
    targetLayoutElementId: "stagejoinqr",
    targetLayoutScope: "moment",
    targetLayoutSurface: "stage",
    isShown: true,
    nextTargetActionId: "return",
    subActions: []
  });
  durableConstants.gameTitle = "Durable Tool Content";
  durableStageLayouts.canvas.width = 1919;
  durableControllerLayouts.canvas.width = 391;
  durableHostAudios.hostAudios.push({
    id: "durable-only-host-audio",
    name: "Durable Only Host Audio",
    lines: []
  });
  durableArtManifest.compositions["stage-background-gradient-plane"].description =
    "Durable only art description.";
  const durableSnapshot = replaceSnapshotFiles(packagedSnapshot, {
    "art/manifest.json": durableArtManifest,
    "audio/host-audios.json": durableHostAudios,
    "constants.json": durableConstants,
    "flow.json": durableFlow,
    "layouts/controller.json": durableControllerLayouts,
    "layouts/stage.json": durableStageLayouts
  });
  return {
    durableSnapshot,
    store: createRevisionedContentStoreRuntime({
      initialSnapshot: durableSnapshot,
      initialRelease: {
        gameBuild: "1.0.17",
        engineVersion: "1.2.3",
        pluginVersion: "1.0.17"
      }
    })
  };
}

function game(store) {
  return defineGame({
    gameId: "pop-party-reference",
    displayName: "Live Prototype Fixture",
    version: "1.0.17",
    engineCompatibility: "1.2.3",
    content: { mode: "bundle", schemaVersion: 1, store },
    plugin: defineGamePlugin({ namespace: "fixture", register() {} }),
    semanticRoles: require("../../../../apps/reference/semantic-roles")
  });
}

async function post(baseUrl, pathname, body = {}, headers = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body)
  });
  const payload = await response.json();
  if (!response.ok) throw Object.assign(new Error(payload.error), { status: response.status, payload });
  return payload;
}

async function lobby(baseUrl) {
  return (await (await fetch(`${baseUrl}/api/stage/LIVE/lobby`)).json()).lobby;
}

async function roomControllerLayouts(baseUrl) {
  const response = await fetch(`${baseUrl}/api/stage/LIVE/content/controller-layouts`);
  expect(response.status).toBe(200);
  return (await response.json()).layouts;
}

function lobbyControllerElementIds(layouts) {
  return layouts.states
    .find((state) => state.id === "lobby")
    .elements
    .map((element) => element.id);
}

describe("live prototype application integration", () => {
  it("serves and preserves durable Tool content when packaged content is stale", async () => {
    const { durableSnapshot, store } = fixtureStoreWithDurableFlow();
    const createRuntime = () => createGameApplicationRuntime({
      gameDefinition: game(store),
      workspaceRoot: projectRoot,
      contentRoot: path.join(projectRoot, "apps/reference/content"),
      authoringRoot: path.join(projectRoot, "apps/reference/content"),
      webRoot: projectRoot,
      authoringMode: "live-prototype",
      host: "127.0.0.1",
      port: 0
    });
    const readFlow = async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/game-flow`);
      expect(response.status).toBe(200);
      return response.json();
    };
    const readTool = async (baseUrl, pathname) => {
      const response = await fetch(`${baseUrl}${pathname}`);
      expect(response.status).toBe(200);
      return response.json();
    };
    const hasDurableAction = (payload) =>
      payload.flow.states
        .find((state) => state.id === "lobby")
        .actions.some((action) => action.id === "durable-only-lobby-action");

    let runtime = createRuntime();
    let startup = await runtime.start();
    try {
      const beforeSession = await readFlow(startup.localUrl);
      expect(beforeSession.revision).toBe(durableSnapshot.revision);
      expect(beforeSession.storage.kind).toBe("live-prototype");
      expect(hasDurableAction(beforeSession)).toBe(true);
      expect((await readTool(startup.localUrl, "/api/game-constants")).constants.gameTitle)
        .toBe("Durable Tool Content");
      expect((await readTool(startup.localUrl, "/api/stage-layouts")).layouts.canvas.width)
        .toBe(1919);
      const controllerLayouts = (await readTool(startup.localUrl, "/api/controller-layouts")).layouts;
      expect(controllerLayouts.canvas.width).toBe(391);
      expect(lobbyControllerElementIds(controllerLayouts)).toContain("controllerlobbybuttoncontainer");
      expect(lobbyControllerElementIds(controllerLayouts)).not.toContain("startgamebutton");
      await post(startup.localUrl, "/api/stage/rooms", { stageCode: "LIVE" });
      const pinnedControllerLayouts = await roomControllerLayouts(startup.localUrl);
      expect(lobbyControllerElementIds(pinnedControllerLayouts)).toEqual(
        lobbyControllerElementIds(controllerLayouts)
      );
      expect((await readTool(startup.localUrl, "/api/host-audios")).hostAudios.hostAudios)
        .toContainEqual(expect.objectContaining({ id: "durable-only-host-audio" }));
      expect((await readTool(startup.localUrl, "/api/art-assets")).compositions)
        .toContainEqual(expect.objectContaining({
          id: "stage-background-gradient-plane",
          description: "Durable only art description."
        }));

      const session = await post(startup.localUrl, "/api/authoring/workspace/session");
      const headers = { "X-Pop-Party-Authoring-Session": session.sessionId };
      const duringSession = await readFlow(startup.localUrl);
      expect(duringSession.revision).toBe(durableSnapshot.revision);
      expect(hasDurableAction(duringSession)).toBe(true);
      const currentControllerLayouts = await readTool(startup.localUrl, "/api/controller-layouts");
      const controllerStateIds = currentControllerLayouts.layouts.states.map((state) => state.id);
      expect(controllerStateIds).toContain("writing-moment");
      expect(controllerStateIds).toContain("controller-text-input");
      const gameOwnedControllerLayout = {
        id: "fixture-private-input",
        name: "Fixture Private Input",
        hiddenGlobals: [],
        elements: [{
          id: "fixture-private-input-widget",
          name: "Fixture Private Input Widget",
          kind: "art",
          artCompositionId: "controller-player-banner",
          defaultAnimationState: "On",
          x: 195,
          y: 422,
          width: 338,
          height: 78,
          scale: 1,
          rotation: 0
        }]
      };
      await post(startup.localUrl, "/api/tool-drafts", {
        controllerLayouts: {
          ...currentControllerLayouts.layouts,
          states: [...currentControllerLayouts.layouts.states, gameOwnedControllerLayout]
        }
      }, headers);
      const draftControllerLayouts = (await readTool(startup.localUrl, "/api/controller-layouts")).layouts;
      expect(draftControllerLayouts.states)
        .toContainEqual(expect.objectContaining({
          id: "fixture-private-input",
          elements: [
            expect.objectContaining({
              id: "fixture-private-input-widget",
              artCompositionId: "controller-player-banner"
            })
          ]
        }));

      const saved = await post(startup.localUrl, "/api/authoring/workspace/save", {
        idempotencyKey: "preserve-durable-flow-0001"
      }, headers);
      expect(saved.saved).toBe(true);
    } finally {
      await runtime.stop();
    }

    runtime = createRuntime();
    startup = await runtime.start();
    try {
      const afterRestart = await readFlow(startup.localUrl);
      expect(hasDurableAction(afterRestart)).toBe(true);
      expect(afterRestart.revision).toBe(store.getActiveRelease().contentRevision);
      const controllerLayouts = await readTool(startup.localUrl, "/api/controller-layouts");
      expect(controllerLayouts.layouts.states.map((state) => state.id))
        .toContain("writing-moment");
      expect(controllerLayouts.layouts.states)
        .toContainEqual(expect.objectContaining({
          id: "fixture-private-input",
          elements: [
            expect.objectContaining({
              id: "fixture-private-input-widget",
              artCompositionId: "controller-player-banner"
            })
          ]
        }));
    } finally {
      await runtime.stop();
    }
  });

  it("relays unsaved Tool data, discards it, and restores an atomic save after restart", async () => {
    const store = fixtureStore();
    const createRuntime = () => createGameApplicationRuntime({
      gameDefinition: game(store),
      workspaceRoot: projectRoot,
      contentRoot: path.join(projectRoot, "apps/reference/content"),
      authoringRoot: path.join(projectRoot, "apps/reference/content"),
      webRoot: projectRoot,
      authoringMode: "live-prototype",
      host: "127.0.0.1",
      port: 0
    });
    let runtime = createRuntime();
    let startup = await runtime.start();
    try {
      await post(startup.localUrl, "/api/stage/rooms", { stageCode: "LIVE" });
      const originalTitle = (await lobby(startup.localUrl)).gameTitle;
      const session = await post(startup.localUrl, "/api/authoring/workspace/session");
      const headers = { "X-Pop-Party-Authoring-Session": session.sessionId };
      const constants = (await (await fetch(`${startup.localUrl}/api/game-constants`)).json()).constants;
      await post(startup.localUrl, "/api/tool-drafts", {
        constants: { ...constants, gameTitle: "Unsaved live title" }
      }, headers);
      expect((await lobby(startup.localUrl)).gameTitle).toBe("Unsaved live title");
      expect((await (await fetch(`${startup.localUrl}/api/game-constants`)).json()).constants.gameTitle)
        .toBe("Unsaved live title");

      // Refreshing the same Tools tab resumes its session without discarding
      // the in-memory workspace.
      const refreshedSession = await post(
        startup.localUrl,
        "/api/authoring/workspace/session",
        {},
        headers
      );
      expect(refreshedSession.sessionId).toBe(session.sessionId);
      expect((await lobby(startup.localUrl)).gameTitle).toBe("Unsaved live title");
      await post(startup.localUrl, "/api/authoring/workspace/discard", {
        sessionId: refreshedSession.sessionId
      }, { "X-Pop-Party-Authoring-Session": refreshedSession.sessionId });
      expect((await lobby(startup.localUrl)).gameTitle).toBe(originalTitle);

      const saveSession = await post(startup.localUrl, "/api/authoring/workspace/session");
      const saveHeaders = { "X-Pop-Party-Authoring-Session": saveSession.sessionId };
      await post(startup.localUrl, "/api/tool-drafts", {
        constants: { ...constants, gameTitle: "Durable live title" }
      }, saveHeaders);
      const localSave = await post(
        startup.localUrl,
        "/api/authoring/workspace/checkpoint",
        {},
        saveHeaders
      );
      expect(localSave.checkpoint.workingRevision).toBe(localSave.workingRevision);
      await post(startup.localUrl, "/api/authoring/workspace/discard", {
        sessionId: saveSession.sessionId
      }, saveHeaders);
      expect((await lobby(startup.localUrl)).gameTitle).toBe(originalTitle);

      const recoveredSession = await post(startup.localUrl, "/api/authoring/workspace/session");
      const recoveredHeaders = {
        "X-Pop-Party-Authoring-Session": recoveredSession.sessionId
      };
      await post(startup.localUrl, "/api/authoring/workspace/restore-checkpoint", {
        checkpoint: localSave.checkpoint
      }, recoveredHeaders);
      expect((await lobby(startup.localUrl)).gameTitle).toBe("Durable live title");
      const saved = await post(startup.localUrl, "/api/authoring/workspace/save", {
        checkpointRevision: localSave.checkpoint.workingRevision,
        idempotencyKey: "application-save-0001"
      }, recoveredHeaders);
      expect(saved.saved).toBe(true);
      expect((await lobby(startup.localUrl)).gameTitle).toBe("Durable live title");
      const health = await (await fetch(`${startup.localUrl}/api/health`)).json();
      expect(health.release.contentRevision).toBe(saved.workingRevision);
      expect(health.application).toMatchObject({
        version: expect.any(String),
        commit: expect.any(String),
        branch: expect.any(String),
        channel: "development"
      });
      expect(health.engine).toEqual({
        version: require("../../package.json").version,
        capabilities: {
          browserWorkspaceCheckpoints: true
        }
      });
    } finally {
      await runtime.stop();
    }

    runtime = createRuntime();
    startup = await runtime.start();
    try {
      await post(startup.localUrl, "/api/stage/rooms", { stageCode: "LIVE" });
      expect((await lobby(startup.localUrl)).gameTitle).toBe("Durable live title");
    } finally {
      await runtime.stop();
    }
  });

  it("normalizes legacy controller button targets for published rooms", async () => {
    const store = fixtureStore();
    const runtime = createGameApplicationRuntime({
      gameDefinition: game(store),
      workspaceRoot: projectRoot,
      contentRoot: path.join(projectRoot, "apps/reference/content"),
      authoringRoot: path.join(projectRoot, "apps/reference/content"),
      webRoot: projectRoot,
      authoringMode: "standard",
      host: "127.0.0.1",
      port: 0
    });
    const startup = await runtime.start();
    try {
      await post(startup.localUrl, "/api/stage/rooms", { stageCode: "LIVE" });
      const layouts = await roomControllerLayouts(startup.localUrl);
      const elements = layouts.states.flatMap((state) => state.elements);
      const lobbyElements = layouts.states.find((state) => state.id === "lobby").elements;
      expect(lobbyElements).toContainEqual(expect.objectContaining({
        id: "controllerlobbybuttoncontainer",
        selector: "#controllerLobbyButtonContainer",
        artCompositionId: ""
      }));
      expect(elements).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: "controllerjoinbuttoncontainer", selector: "#controllerJoinButtonContainer" }),
        expect.objectContaining({ id: "controllerlobbybuttoncontainer", selector: "#controllerLobbyButtonContainer" }),
        expect.objectContaining({ id: "controllertextsubmitbuttoncontainer", selector: "#controllerTextSubmitButtonContainer" }),
        expect.objectContaining({ id: "controllervoicebuttoncontainer", selector: "#controllerVoiceButtonContainer" }),
        expect.objectContaining({ id: "controllermicaccessbuttoncontainer", selector: "#controllerMicAccessButtonContainer" })
      ]));
      const elementIds = elements.map((element) => element.id);
      for (const legacyElementId of [
        "joinbutton",
        "startgamebutton",
        "controllertextsubmitbutton",
        "controllervoicebutton",
        "controllermicaccessbutton"
      ]) {
        expect(elementIds).not.toContain(legacyElementId);
      }
    } finally {
      await runtime.stop();
    }
  });
});
