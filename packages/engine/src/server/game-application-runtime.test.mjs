import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const {
  createGameApplicationRuntime,
  publicRuntimeMetadata
} = require("./game-application-runtime");

function fixture() {
  const gameDefinition = {
    gameId: "fixture-game",
    displayName: "Fixture Game",
    version: "0.1.0",
    plugin: { namespace: "fixture" },
    registrations: {
      actions: [],
      controllerRenderers: [],
      diagnostics: [],
      migrations: [],
      stageRenderers: [],
      stateSchemas: [],
      toolPanels: [],
      validators: []
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

describe("game application runtime", () => {
  it("exposes exact validated release metadata", () => {
    const { active, gameDefinition } = fixture();
    expect(publicRuntimeMetadata(gameDefinition, active)).toEqual({
      game: {
        id: "fixture-game",
        displayName: "Fixture Game",
        version: "0.1.0",
        pluginNamespace: "fixture"
      },
      release: active.release
    });
  });

  it("constructs the engine-owned application without game bootstrap renderers", () => {
    const { gameDefinition } = fixture();
    const runtime = createGameApplicationRuntime({ gameDefinition });

    expect(runtime.active).toBeNull();
    expect(runtime.server).toBeNull();
    expect(runtime.start).toBeTypeOf("function");
    expect(runtime.stop).toBeTypeOf("function");
    expect(runtime.state).toEqual({ status: "pending", diagnostic: null, release: null });
  });

  it("rejects an undefined game boundary", () => {
    expect(() => createGameApplicationRuntime()).toThrow(/requires a defined game/);
  });
});
