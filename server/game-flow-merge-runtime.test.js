import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { createGameFlowMergeRuntime } = require("./game-flow-merge-runtime");

const lobby = {
  id: "lobby",
  name: "Lobby",
  actions: [{ id: "lobby-action", type: "doNothing", subActions: [] }]
};
const intro = {
  id: "intro",
  name: "Intro",
  actions: [{ id: "intro-action", type: "doNothing", subActions: [] }]
};

function runtime() {
  return createGameFlowMergeRuntime({
    requiredFlowStates: [lobby, intro]
  });
}

function completeFlow(overrides = {}) {
  return {
    states: [lobby, intro],
    routeNodes: [],
    ...overrides
  };
}

describe("game flow save replacement", () => {
  it("accepts the complete incoming authored flow without merging older data", () => {
    const incoming = completeFlow({
      states: [
        { ...lobby, name: "Edited Lobby" },
        intro,
        { id: "round", actions: [] }
      ]
    });
    const existing = completeFlow({
      states: [lobby, intro, { id: "stale-round", actions: [{ id: "stale", type: "doNothing", subActions: [] }] }]
    });

    const saved = runtime().mergeFlowWithExistingSubActions(incoming, existing);

    expect(saved).toEqual(incoming);
    expect(saved).not.toBe(incoming);
    expect(saved.states.some((state) => state.id === "stale-round")).toBe(false);
  });

  it("rejects an empty save instead of preserving the previous flow", () => {
    expect(() => runtime().mergeFlowWithExistingSubActions({ states: [], routeNodes: [] }, completeFlow()))
      .toThrow("refusing to reuse previously saved states");
  });

  it("rejects omitted required states instead of restoring old or starter states", () => {
    expect(() => runtime().mergeFlowWithExistingSubActions({
      states: [{ id: "round", actions: [] }],
      routeNodes: []
    }, completeFlow())).toThrow("missing required authored states: lobby, intro");
  });

  it("rejects omitted nested subroutine actions instead of recovering them by id", () => {
    const incoming = completeFlow({
      states: [
        lobby,
        intro,
        {
          id: "round",
          actions: [{ id: "routine", type: "subroutine", subActions: [] }]
        }
      ]
    });
    const existing = completeFlow({
      states: [
        lobby,
        intro,
        {
          id: "round",
          actions: [{
            id: "routine",
            type: "subroutine",
            subActions: [],
            actions: [{ id: "old-child", type: "displayText", subActions: [] }]
          }]
        }
      ]
    });

    expect(() => runtime().mergeFlowWithExistingSubActions(incoming, existing))
      .toThrow("flow.states[2].actions[0].actions must be an array");
  });

  it("requires serialized subActions arrays so stale branches cannot survive", () => {
    const invalid = completeFlow({
      states: [
        lobby,
        intro,
        { id: "round", actions: [{ id: "answer", type: "displayText" }] }
      ]
    });

    expect(() => runtime().mergeFlowWithExistingSubActions(invalid, completeFlow()))
      .toThrow("subActions must be an array");
  });
});
