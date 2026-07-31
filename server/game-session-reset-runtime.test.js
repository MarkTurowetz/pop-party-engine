import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { resetGameSessionState } = require("./game-session-reset-runtime");

describe("resetGameSessionState", () => {
  it("preserves player identity while removing all completed-game data", () => {
    const player = {
      id: "p1",
      name: "Ava",
      avatar: { shape: "rex", color: "blue" },
      points: 900,
      pendingPoints: 50,
      active: true,
      gameSessionId: 4
    };
    const disconnectedPlayer = {
      id: "p2",
      name: "Ben",
      avatar: { shape: "stego", color: "green" },
      points: 100,
      pendingPoints: 10,
      active: false,
      gameSessionId: 4
    };
    const room = {
      gameSessionId: 4,
      players: new Map([[player.id, player], [disconnectedPlayer.id, disconnectedPlayer]]),
      flowVariables: { answer: 42 },
      G: { test: 1 },
      storedPlayerAnswers: { 1: { writing: { p1: { text: "old" } } } },
      sessionOutputs: { sessionId: 4, byVisit: { "writing@2": { records: { p1: { text: "old" } } } } },
      runtimeFault: { code: "OLD_FAULT" },
      debugLog: { message: "l.old = stale" },
      debugLogSequence: 3,
      displayedPlayerAnswers: new Map([["p1", { text: "old" }]]),
      displayedAnswerCorrectness: new Map([["p1", true]]),
      hiddenPlayerAnswerIds: new Set(["p1"]),
      playerAnswerRecords: { p1: { text: "old" } },
      playerAnswerGroups: { all: ["p1"], correct: ["p1"], wrong: [] },
      choiceInputActionId: "old-choice",
      choiceInputAnswers: new Map([["p1", { done: true }]]),
      textInputActionId: "old-text",
      textInputAnswers: new Map([["p1", { done: true }]]),
      microphoneAccessActionId: "old-mic",
      microphoneAccessAnswers: new Map([["p1", { done: true }]]),
      pendingPointPopups: [{ playerId: "p1", points: 50 }],
      votingCards: [{ id: "old-card" }],
      votingWinners: ["p1"],
      microphoneAccessGrantedPlayerIds: new Set(["p1"])
    };

    resetGameSessionState(room);

    expect(room.gameSessionId).toBe(5);
    expect(room.storedPlayerAnswers).toEqual({});
    expect(room.sessionOutputs).toEqual({ sessionId: 5, byVisit: {}, latestByState: {} });
    expect(room.runtimeFault).toBeNull();
    expect(room.debugLog).toBeNull();
    expect(room.debugLogSequence).toBe(0);
    expect(room.displayedPlayerAnswers.size).toBe(0);
    expect(room.playerAnswerRecords).toEqual({});
    expect(room.choiceInputActionId).toBe("");
    expect(room.choiceInputAnswers.size).toBe(0);
    expect(room.textInputActionId).toBe("");
    expect(room.textInputAnswers.size).toBe(0);
    expect(room.microphoneAccessActionId).toBe("");
    expect(room.microphoneAccessAnswers.size).toBe(0);
    expect(room.votingCards).toEqual([]);
    expect(room.pendingPointPopups).toEqual([]);
    expect(room.flowVariables).toEqual({});
    expect(room.G).toEqual({});
    expect(room.microphoneAccessGrantedPlayerIds.size).toBe(0);
    expect(player).toMatchObject({ id: "p1", name: "Ava", avatar: { shape: "rex", color: "blue" }, points: 0, pendingPoints: 0 });
    expect(player.gameSessionId).toBe(5);
    expect(disconnectedPlayer).toMatchObject({ points: 0, pendingPoints: 0, gameSessionId: 4 });
  });
});
