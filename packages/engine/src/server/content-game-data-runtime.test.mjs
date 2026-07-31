import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { createBundleGameData } = require("./content-game-data-runtime");

function snapshot(overrides = {}) {
  const files = {
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
    "art/manifest.json": { compositions: { card: { name: "Card" } }, assets: [] },
    "game-data/runtime.json": {
      schemaVersion: 1,
      avatarShapes: ["triangle"],
      artGroups: [{ id: "cards" }],
      availableFlowTransitions: [{ id: "wipe", name: "Wipe" }]
    },
    ...overrides
  };
  return { readJson: (logicalPath) => structuredClone(files[logicalPath]) };
}

describe("bundle game data runtime", () => {
  it("materializes complete game runtime data from one pinned bundle snapshot", () => {
    const gameData = createBundleGameData(snapshot());
    expect(gameData.defaultGameFlow.states[0].id).toBe("lobby");
    expect(gameData.defaultArtCompositions[0].id).toBe("card");
    expect(gameData.avatarShapes).toEqual(["triangle"]);
    expect(gameData.defaultPlayerColors).toEqual(["#ffffff"]);
    expect(gameData.availableFlowActionTypes.some((action) => action.id === "prepareVotingCards")).toBe(true);
    expect(gameData.availableFlowActionTypes).toContainEqual(expect.objectContaining({
      id: "logValue",
      name: "Log Value",
      category: "standard"
    }));
  });

  it("rejects incomplete constants instead of filling values from engine defaults", () => {
    expect(() => createBundleGameData(snapshot({
      "constants.json": { playerColors: ["#ffffff"], customConstants: [] }
    }))).toThrow("Bundle constants are incomplete: craftingTimerDuration");
  });

  it("rejects incomplete flow trees instead of restoring old actions or required states", () => {
    expect(() => createBundleGameData(snapshot({
      "flow.json": { states: [{ id: "lobby", actions: [] }], routeNodes: [] }
    }))).toThrow("missing required authored state: intro");
  });
});
