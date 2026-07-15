import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { createPlayerAnswersRuntime } = require("./player-answers-runtime");

function createRuntime() {
  return createPlayerAnswersRuntime({
    activePlayers: () => [],
    normalizePlayerFilter: (value) => String(value || "all")
  });
}

describe("displayed player answer correctness", () => {
  it("does not change the answer-content nonce when correctness is revealed", () => {
    const room = {
      displayedAnswerCorrectness: new Map(),
      displayedPlayerAnswers: new Map([["p1", { text: "YES", correct: null, nonce: "answer-1" }]]),
      playerAnswerRecords: { p1: { text: "YES", correct: true } }
    };

    createRuntime().markDisplayedAnswersCorrectness(room);

    expect(room.displayedPlayerAnswers.get("p1")).toEqual({ text: "YES", correct: true, nonce: "answer-1" });
  });

  it("does not change the answer-content nonce when correctness is cleared", () => {
    const room = {
      displayedAnswerCorrectness: new Map([["p1", true]]),
      displayedPlayerAnswers: new Map([["p1", { text: "YES", correct: true, nonce: "answer-1" }]])
    };

    createRuntime().clearDisplayedCorrectnessForPlayers(room, ["p1"]);

    expect(room.displayedPlayerAnswers.get("p1")).toEqual({ text: "YES", correct: null, nonce: "answer-1" });
  });
});
