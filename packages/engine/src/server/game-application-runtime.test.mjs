import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const {
  createGameApplicationRequestHandler,
  publicRuntimeMetadata
} = require("./game-application-runtime");

function fixture() {
  const gameDefinition = {
    gameId: "fixture-game",
    displayName: "Fixture <Game>",
    version: "0.1.0",
    plugin: { namespace: "fixture" },
    registrations: {
      stageRenderers: [{
        id: "fixture.stage",
        value: { renderBootstrap: ({ game }) => ({ heading: game.displayName, message: "Stage <ready>." }) }
      }],
      controllerRenderers: [{
        id: "fixture.controller",
        value: { renderBootstrap: ({ game }) => ({ heading: game.displayName, message: "Controller <ready>." }) }
      }]
    }
  };
  const active = {
    release: {
      gameId: "fixture-game",
      gameBuild: "0.1.0",
      engineVersion: "1.0.0",
      pluginVersion: "0.1.0",
      contentRevision: "content-1",
      releaseRevision: "release-1"
    }
  };
  return { active, gameDefinition };
}

function dispatch(handler, url, method = "GET") {
  const headers = {};
  const chunks = [];
  let status = 0;
  const response = {
    writeHead(nextStatus, nextHeaders) {
      status = nextStatus;
      Object.assign(headers, nextHeaders);
    },
    end(chunk) {
      if (chunk) chunks.push(Buffer.from(chunk));
    }
  };
  handler({ method, url }, response);
  return { body: Buffer.concat(chunks).toString("utf8"), headers, status };
}

describe("game application bootstrap", () => {
  it("exposes the exact validated release without private runtime state", () => {
    const { active, gameDefinition } = fixture();
    expect(publicRuntimeMetadata(gameDefinition, active)).toEqual({
      game: {
        id: "fixture-game",
        displayName: "Fixture <Game>",
        version: "0.1.0",
        pluginNamespace: "fixture"
      },
      release: active.release
    });

    const response = dispatch(createGameApplicationRequestHandler({ active, gameDefinition }), "/health");
    expect(response.status).toBe(200);
    expect(JSON.parse(response.body)).toMatchObject({
      ok: true,
      status: "ready",
      release: { contentRevision: "content-1", engineVersion: "1.0.0" }
    });
    expect(response.headers["Cache-Control"]).toBe("no-store");
  });

  it("serves explicit stage and controller bootstrap surfaces without legacy art", () => {
    const { active, gameDefinition } = fixture();
    const handler = createGameApplicationRequestHandler({ active, gameDefinition });
    const stage = dispatch(handler, "/stage");
    const controller = dispatch(handler, "/controller", "HEAD");

    expect(stage.status).toBe(200);
    expect(stage.body).toContain('data-pop-party-role="stage"');
    expect(stage.body).toContain('data-content-revision="content-1"');
    expect(stage.body).toContain("Fixture &lt;Game&gt;");
    expect(stage.body).toContain("Stage &lt;ready&gt;.");
    expect(stage.body).not.toContain("legacy");
    expect(controller.status).toBe(200);
    expect(controller.body).toBe("");
  });

  it("fails closed when authenticated tooling has not been configured", () => {
    const { active, gameDefinition } = fixture();
    const handler = createGameApplicationRequestHandler({ active, gameDefinition });
    const tools = dispatch(handler, "/tools");
    const mutation = dispatch(handler, "/stage", "POST");
    const missing = dispatch(handler, "/unknown");

    expect(tools.status).toBe(503);
    expect(JSON.parse(tools.body).diagnostic.code).toBe("GAME_TOOLING_NOT_CONFIGURED");
    expect(mutation.status).toBe(405);
    expect(missing.status).toBe(404);
  });

  it("rejects missing or ambiguous game-owned renderers instead of installing a fallback", () => {
    const { active, gameDefinition } = fixture();
    expect(() => createGameApplicationRequestHandler({
      active,
      gameDefinition: { ...gameDefinition, registrations: { ...gameDefinition.registrations, stageRenderers: [] } }
    })).toThrow(/exactly one stage bootstrap renderer; found 0/);
    expect(() => createGameApplicationRequestHandler({
      active,
      gameDefinition: {
        ...gameDefinition,
        registrations: {
          ...gameDefinition.registrations,
          controllerRenderers: [...gameDefinition.registrations.controllerRenderers, ...gameDefinition.registrations.controllerRenderers]
        }
      }
    })).toThrow(/exactly one controller bootstrap renderer; found 2/);
    expect(() => createGameApplicationRequestHandler({
      active,
      gameDefinition: {
        ...gameDefinition,
        registrations: {
          ...gameDefinition.registrations,
          stageRenderers: [{ id: "fixture.invalid", value: { renderBootstrap: () => ({}) } }]
        }
      }
    })).toThrow(/returned an invalid bootstrap view/);
  });
});
