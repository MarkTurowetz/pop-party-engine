import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { defineGame } = require("./game-definition-runtime");
const { defineGamePlugin } = require("./game-plugin-runtime");
const { createGameApplicationRuntime } = require("./game-application-runtime");
const { createLocalContentBundleProvider } = require("./local-content-bundle-provider");
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

describe("live prototype application integration", () => {
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

      // A refreshed Tools page begins a replacement session and discards the
      // abandoned page's unsaved workspace before loading its editors.
      const refreshedSession = await post(startup.localUrl, "/api/authoring/workspace/session");
      expect((await lobby(startup.localUrl)).gameTitle).toBe(originalTitle);
      await post(startup.localUrl, "/api/authoring/workspace/discard", {
        sessionId: refreshedSession.sessionId
      }, { "X-Pop-Party-Authoring-Session": refreshedSession.sessionId });

      const saveSession = await post(startup.localUrl, "/api/authoring/workspace/session");
      const saveHeaders = { "X-Pop-Party-Authoring-Session": saveSession.sessionId };
      await post(startup.localUrl, "/api/tool-drafts", {
        constants: { ...constants, gameTitle: "Durable live title" }
      }, saveHeaders);
      const saved = await post(startup.localUrl, "/api/authoring/workspace/save", {
        idempotencyKey: "application-save-0001"
      }, saveHeaders);
      expect(saved.saved).toBe(true);
      expect((await lobby(startup.localUrl)).gameTitle).toBe("Durable live title");
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
});
