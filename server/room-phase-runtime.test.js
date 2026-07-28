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
      gameSessionId: 3,
      sessionOutputs: {
        sessionId: 3,
        byVisit: {
          "voice-moment@8": { sessionId: 3, stateId: "voice-moment", visitId: 8, records: { p1: { text: "JURASSIC PARK" } } }
        },
        latestByState: { "voice-moment": "voice-moment@8" }
      }
    };

    expect(resolveVotingAnswerSource(room, { sessionId: 3, stateId: "writing-moment", visitId: 9 })).toEqual({
      sourceRef: { sessionId: 3, stateId: "writing-moment", visitId: 9 },
      records: {},
      output: null,
      fallbackUsed: false
    });
  });

  it("uses only the requested producer visit in the current game session", () => {
    const records = { p1: { text: "THE MATRIX" } };
    const output = { sessionId: 4, stateId: "writing-moment", visitId: 11, records };
    const room = {
      gameSessionId: 4,
      sessionOutputs: {
        sessionId: 4,
        byVisit: { "writing-moment@11": output },
        latestByState: { "writing-moment": "writing-moment@11" }
      }
    };

    expect(resolveVotingAnswerSource(room, { sessionId: 4, stateId: "writing-moment", visitId: 11 })).toEqual({
      sourceRef: { sessionId: 4, stateId: "writing-moment", visitId: 11 },
      records,
      output,
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
    const clearScheduledSubActions = vi.fn();
    const runtime = createRouteRuntime({ clearScheduledSubActions });
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

    expect(clearScheduledSubActions).toHaveBeenCalledWith(room);
    expect(room.storedPlayerAnswers).toEqual({});
    expect(room.votingCards).toEqual([]);
    expect(room.playerSessionKey).toBe("");
    expect(room.numSequentialGames).toBe(0);
    expect(room.players.get("p1")).toMatchObject({ id: "p1", name: "Ava", points: 0, pendingPoints: 0 });
  });

  it("adopts the prepared authoring snapshot before resolving the new lobby entry", () => {
    const prepareLobbySession = vi.fn((room) => {
      room.gameData = { revision: "latest-saved" };
    });
    const entryActionIndexForPhase = vi.fn((room) => (
      room.gameData?.revision === "latest-saved" ? 2 : 0
    ));
    const runtime = createRouteRuntime({
      entryActionIndexForPhase,
      getStateActions: () => [{ id: "old" }, { id: "other" }, { id: "latest-entry" }],
      prepareLobbySession
    });
    const room = { phase: "writing", players: new Map(), pendingFlowEvents: new Set() };

    runtime.enterLobbyPhase(room);

    expect(prepareLobbySession).toHaveBeenCalledWith(room);
    expect(entryActionIndexForPhase).toHaveBeenCalledWith(room, "lobby");
    expect(room.actionIndex).toBe(2);
    expect(room.runtimeFault).toBeNull();
  });

  it("halts the new lobby visibly instead of falling back after authoring preparation fails", () => {
    const runtime = createRouteRuntime({
      getStateActions: () => [{ id: "old-entry" }],
      prepareLobbySession: () => {
        throw Object.assign(new Error("saved layout is incomplete"), {
          code: "AUTHORING_CONTENT_INVALID"
        });
      }
    });
    const room = { phase: "writing", players: new Map(), pendingFlowEvents: new Set() };

    runtime.enterLobbyPhase(room);

    expect(room.actionIndex).toBe(1);
    expect(room.runtimeFault).toMatchObject({
      code: "AUTHORING_CONTENT_INVALID",
      message: "The new game session could not load the latest saved authoring content.",
      actual: "saved layout is incomplete"
    });
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

  it("halts visibly when the immediately preceding producer visit has no valid answers", () => {
    const runtime = createReusableVotingRuntime((room) => {
      room.votingCards = [];
      room.lastVotingPrepare = { cardCount: 0, skipped: [] };
    });
    const room = {
      gameSessionId: 9,
      momentVisitId: 14,
      phase: "voice-moment",
      flowStateId: "voice-moment",
      currentRound: 1,
      playerAnswerRecords: {},
      pendingFlowEvents: new Set()
    };

    expect(runtime.enterGamePhase(room, "voting-moment")).toBe(false);
    expect(room.runtimeFault).toMatchObject({
      code: "VOTING_SOURCE_INVALID",
      gameSessionId: 9,
      stateId: "voting-moment",
      sourceRef: { sessionId: 9, stateId: "voice-moment", visitId: 14 }
    });
    expect(room.actionTimerId).toBeUndefined();
    expect(room.votingCards).toEqual([]);
  });
});
