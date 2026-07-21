import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const { createRoomPhaseRuntime, resolveVotingAnswerSource } = require("./room-phase-runtime");

function createRouteRuntime(overrides = {}) {
  return createRoomPhaseRuntime({
    activePlayers: () => [],
    broadcastLobby: vi.fn(),
    clearActionTimer: vi.fn(),
    clearAppliedActionEffects: vi.fn(),
    clearChoiceInput: vi.fn(),
    clearCountdownTimer: vi.fn(),
    clearDisplayedPlayerAnswers: vi.fn(),
    clearMicrophoneAccessInput: vi.fn(),
    clearPlayerAnswerData: vi.fn(),
    clearTextInput: vi.fn(),
    clearVotingData: vi.fn(),
    clearVotingInput: vi.fn(),
    entryActionIndexForPhase: () => 0,
    getStateActions: () => [],
    isRoundIntroStateId: () => false,
    normalizeFlowId: (value) => String(value || ""),
    prepareVotingCards: vi.fn(),
    resetCraftingTimer: vi.fn(),
    resolveMomentRouteTarget: () => ({
      targetKind: "action",
      routeNodeId: "code-node",
      trace: []
    }),
    resolveMomentTargetStateId: () => "",
    runtimeGameFlow: () => ({ states: [] }),
    ...overrides
  });
}

describe("voting answer source resolution", () => {
  it("falls back to the latest submitted moment when a configured source is empty", () => {
    const room = {
      storedPlayerAnswers: {
        1: {
          "voice-moment": { p1: { text: "JURASSIC PARK" } }
        }
      }
    };

    expect(resolveVotingAnswerSource(room, 1, "writing-moment")).toEqual({
      stateId: "voice-moment",
      records: { p1: { text: "JURASSIC PARK" } },
      fallbackUsed: true
    });
  });

  it("uses the requested moment when it has current answers", () => {
    const records = { p1: { text: "THE MATRIX" } };
    const room = { storedPlayerAnswers: { 2: { "writing-moment": records } } };

    expect(resolveVotingAnswerSource(room, 2, "writing-moment")).toEqual({
      stateId: "writing-moment",
      records,
      fallbackUsed: false
    });
  });
});

describe("route action sessions", () => {
  it("starts each visit with fresh action effects so looped code nodes execute again", () => {
    const clearAppliedActionEffects = vi.fn();
    const runtime = createRouteRuntime({ clearAppliedActionEffects });
    const room = { phase: "writing" };

    runtime.advanceRoomFromRouteAction(room, { nextTargetNodeId: "code-node" });
    runtime.advanceRoomFromRouteAction(room, { nextTargetNodeId: "code-node" });

    expect(clearAppliedActionEffects).toHaveBeenCalledTimes(2);
    expect(room.routeActionSession.currentNodeId).toBe("code-node");
  });
});
