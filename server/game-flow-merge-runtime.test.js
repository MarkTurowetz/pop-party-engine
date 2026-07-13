import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { createGameFlowMergeRuntime } = require("./game-flow-merge-runtime");

const defaultLobby = {
  id: "lobby",
  name: "Default Lobby",
  actions: [{ id: "default-lobby-action", type: "transitionState" }]
};
const defaultIntro = {
  id: "intro",
  name: "Default Intro",
  actions: [{ id: "default-intro-action", type: "presentText" }]
};

function runtime(existingFlow) {
  return createGameFlowMergeRuntime({
    readGameFlowSource: () => existingFlow,
    requiredFlowStates: [defaultLobby, defaultIntro]
  });
}

describe("game flow save merging", () => {
  it("restores an omitted required state from the existing authored flow", () => {
    const authoredLobby = {
      id: "lobby",
      name: "Authored Lobby",
      actions: [{ id: "setup", type: "setupGame" }]
    };
    const existing = {
      states: [authoredLobby, defaultIntro, { id: "round", actions: [] }]
    };
    const incoming = {
      states: [defaultIntro, { id: "round", actions: [] }]
    };

    const merged = runtime(existing).mergeFlowWithExistingSubActions(incoming, existing);

    expect(merged.states.map((state) => state.id)).toEqual(["lobby", "intro", "round"]);
    expect(merged.states[0]).toBe(authoredLobby);
  });

  it("uses built-in defaults when durable data already lacks required states", () => {
    const existing = { states: [{ id: "round", actions: [] }] };
    const incoming = { states: [{ id: "round", actions: [] }] };

    const merged = runtime(existing).mergeFlowWithExistingSubActions(incoming, existing);

    expect(merged.states.map((state) => state.id)).toEqual(["lobby", "intro", "round"]);
    expect(merged.states[0]).toBe(defaultLobby);
    expect(merged.states[1]).toBe(defaultIntro);
  });

  it("preserves the complete existing flow when a save submits no states", () => {
    const round = { id: "round", actions: [] };
    const existing = { states: [defaultLobby, defaultIntro, round] };

    const merged = runtime(existing).mergeFlowWithExistingSubActions({ states: [] }, existing);

    expect(merged.states).toEqual([defaultLobby, defaultIntro, round]);
  });

  it("keeps incoming authored required states instead of overwriting them", () => {
    const incomingLobby = { id: "lobby", name: "Edited Lobby", actions: [] };
    const incomingIntro = { id: "intro", name: "Edited Intro", actions: [] };
    const existing = { states: [defaultLobby, defaultIntro] };

    const merged = runtime(existing).mergeFlowWithExistingSubActions({
      states: [incomingLobby, incomingIntro]
    }, existing);

    expect(merged.states).toEqual([incomingLobby, incomingIntro]);
  });

  it("continues to preserve nested actions omitted by an incoming save", () => {
    const childAction = { id: "child", type: "displayText" };
    const existing = {
      states: [
        defaultLobby,
        defaultIntro,
        {
          id: "round",
          actions: [{ id: "routine", type: "subroutine", actions: [childAction] }]
        }
      ]
    };
    const incoming = {
      states: [
        defaultLobby,
        defaultIntro,
        { id: "round", actions: [{ id: "routine", type: "subroutine" }] }
      ]
    };

    const merged = runtime(existing).mergeFlowWithExistingSubActions(incoming, existing);

    expect(merged.states[2].actions[0].actions).toEqual([childAction]);
  });
});
