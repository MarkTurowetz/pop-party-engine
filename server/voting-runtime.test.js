import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const { createVotingRuntime } = require("./voting-runtime");

function runtime() {
  return createVotingRuntime({
    activePlayers: (room) => [...room.players.values()].filter((player) => player.active !== false),
    clearAnswersSubmittedAdvanceTimer: vi.fn(),
    normalizeVotingCardFilter: (value) => String(value || "all")
  });
}

describe("voting card preparation identity", () => {
  it("creates a fresh card identity every time answers are prepared", () => {
    const room = {
      players: new Map([["p1", { id: "p1", name: "Ava", active: true, avatar: { shape: "rex", color: "pink" } }]]),
      playerAnswerRecords: { p1: { playerId: "p1", text: "FIRST", answeredAt: 10 } },
      votingAnswers: new Map()
    };
    const voting = runtime();

    voting.prepareVotingCards(room);
    const firstId = room.votingCards[0].id;

    room.playerAnswerRecords = { p1: { playerId: "p1", text: "SECOND", answeredAt: 20 } };
    voting.prepareVotingCards(room);

    expect(firstId).toBe("vote-card-1-p1");
    expect(room.votingCards[0]).toMatchObject({ id: "vote-card-2-p1", generation: 2, text: "SECOND" });
  });
});
