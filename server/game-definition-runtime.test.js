import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { defineGame } = require("./game-definition-runtime");
const { defineGamePlugin } = require("./game-plugin-runtime");

const requiredGameData = Object.fromEntries([
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
].map((key) => [key, {}]));

function validDefinition(overrides = {}) {
  return {
    gameId: "example-game",
    displayName: "Example Game",
    version: "0.1.0",
    engineCompatibility: "1.0.0",
    content: { mode: "bundle", schemaVersion: 1 },
    plugin: defineGamePlugin({ namespace: "example", register() {} }),
    ...overrides
  };
}

describe("defineGame", () => {
  it("creates an immutable game boundary and installs namespaced registrations", () => {
    const plugin = defineGamePlugin({
      namespace: "example",
      register(registry) {
        registry.actions("example.roll", { name: "Roll", execute: () => 7 });
      }
    });
    const game = defineGame(validDefinition({ plugin }));

    expect(game.gameId).toBe("example-game");
    expect(game.registrations.actions.map((entry) => entry.id)).toEqual(["example.roll"]);
    expect(Object.isFrozen(game)).toBe(true);
  });

  it("requires legacy data only at the legacy boundary and rejects bundle-side duplicates", () => {
    expect(() => defineGame(validDefinition({ gameData: requiredGameData }))).toThrow(/must load runtime data from their pinned content snapshot/);
    expect(() => defineGame(validDefinition({
      content: { mode: "legacy-monolith", schemaVersion: 0 },
      gameData: {}
    }))).toThrow(/missing gameData/);
    expect(defineGame(validDefinition({
      content: { mode: "legacy-monolith", schemaVersion: 0 },
      gameData: requiredGameData
    })).gameData).toBe(requiredGameData);
  });

  it("rejects plugin ids outside the plugin namespace", () => {
    const plugin = defineGamePlugin({
      namespace: "example",
      register(registry) {
        registry.actions("engine.roll", {});
      }
    });
    expect(() => defineGame(validDefinition({ plugin }))).toThrow(/may only register ids/);
  });

  it("preserves a revision provider without letting the engine invent one", () => {
    const store = { getActiveRelease() {}, loadPublishedRevision() {} };
    expect(defineGame(validDefinition({ content: { mode: "bundle", schemaVersion: 1, store } })).content.store).toBe(store);
    expect(() => defineGame(validDefinition({ content: { mode: "bundle", schemaVersion: 1, store: {} } }))).toThrow(/content store/);
  });
});
