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

function createReusableVotingRuntime(prepareVotingCards) {
  const states = [
    { id: "writing-moment", actions: [] },
    { id: "voice-moment", actions: [] },
    { id: "voting-moment", actions: [{ id: "vote", type: "voteOnAnswersInput" }] }
  ];
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
    getStateActions: (stateId) => states.find((state) => state.id === stateId)?.actions || [],
    isRoundIntroStateId: () => false,
    normalizeFlowId: (value) => String(value || ""),
    prepareVotingCards,
    resetCraftingTimer: vi.fn(),
    resolveMomentRouteTarget: () => ({}),
    resolveMomentTargetStateId: () => "",
    runtimeGameFlow: () => ({ states })
  });
}

describe("voting answer source resolution", () => {
  it("does not resurface an older moment when the requested source is empty", () => {
    const room = {
      storedPlayerAnswers: {
        1: {
          "voice-moment": { p1: { text: "JURASSIC PARK" } }
        }
      }
    };

    expect(resolveVotingAnswerSource(room, 1, "writing-moment")).toEqual({
      stateId: "writing-moment",
      records: {},
      fallbackUsed: false
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

describe("game termination lifecycle", () => {
  it("wipes game-session data when returning to the lobby", () => {
    const runtime = createRouteRuntime();
    const room = {
      phase: "writing-moment",
      players: new Map([["p1", { id: "p1", name: "Ava", points: 10, pendingPoints: 5 }]]),
      storedPlayerAnswers: { 1: { writing: { p1: { text: "old answer" } } } },
      votingCards: [{ id: "old-card" }],
      playerSessionKey: "p1",
      numSequentialGames: 4,
      pendingFlowEvents: new Set(["old-event"])
    };

    runtime.enterLobbyPhase(room);

    expect(room.storedPlayerAnswers).toEqual({});
    expect(room.votingCards).toEqual([]);
    expect(room.playerSessionKey).toBe("");
    expect(room.numSequentialGames).toBe(0);
    expect(room.players.get("p1")).toMatchObject({ id: "p1", name: "Ava", points: 0, pendingPoints: 0 });
  });
});

describe("reusable voting moments", () => {
  it("prepares a fresh card source from each immediately preceding input moment", () => {
    const preparedAnswers = [];
    const runtime = createReusableVotingRuntime((room) => {
      preparedAnswers.push(structuredClone(room.playerAnswerRecords));
      room.votingCards = Object.entries(room.playerAnswerRecords).map(([playerId, answer], index) => ({
        id: `card-${preparedAnswers.length}-${index}`,
        authorPlayerId: playerId,
        text: answer.text
      }));
    });
    const room = {
      phase: "writing-moment",
      flowStateId: "writing-moment",
      currentRound: 1,
      playerAnswerRecords: { p1: { text: "ALIEN" }, p2: { text: "JAWS" } },
      pendingFlowEvents: new Set()
    };

    runtime.enterGamePhase(room, "voting-moment");
    const firstVotingVisitId = room.momentVisitId;
    runtime.enterGamePhase(room, "voice-moment");
    room.playerAnswerRecords = { p1: { text: "JURASSIC PARK" } };
    runtime.enterGamePhase(room, "voting-moment");

    expect(preparedAnswers).toEqual([
      { p1: { text: "ALIEN" }, p2: { text: "JAWS" } },
      { p1: { text: "JURASSIC PARK" } }
    ]);
    expect(room.storedPlayerAnswers[1]).toEqual({
      "writing-moment": { p1: { text: "ALIEN" }, p2: { text: "JAWS" } },
      "voice-moment": { p1: { text: "JURASSIC PARK" } }
    });
    expect(room.lastVotingSourceStateId).toBe("voice-moment");
    expect(room.momentVisitId).toBe(firstVotingVisitId + 2);
  });
});
