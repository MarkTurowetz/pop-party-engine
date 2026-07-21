import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const {
  storeCurrentMomentAnswers,
  storePlayerAnswerRecord
} = require("./stored-player-answers-runtime");

describe("stored player answers", () => {
  it("stores each accepted answer immediately under its current moment and round", () => {
    const room = { flowStateId: "voice-moment", currentRound: 2 };

    expect(storePlayerAnswerRecord(room, "p1", { text: "JURASSIC PARK" })).toBe(true);
    expect(room.storedPlayerAnswers).toEqual({
      2: { "voice-moment": { p1: { text: "JURASSIC PARK" } } }
    });
  });

  it("merges the final moment snapshot without removing already accepted answers", () => {
    const room = {
      phase: "writing-moment",
      currentRound: 1,
      storedPlayerAnswers: {
        1: { "writing-moment": { p1: { text: "ALIEN" } } }
      },
      playerAnswerRecords: {
        p1: { text: "ALIEN" },
        p2: { text: "JAWS" }
      }
    };

    expect(storeCurrentMomentAnswers(room)).toBe(true);
    expect(room.storedPlayerAnswers[1]["writing-moment"]).toEqual({
      p1: { text: "ALIEN" },
      p2: { text: "JAWS" }
    });
  });

  it("does not store lobby answers", () => {
    const room = { phase: "lobby", playerAnswerRecords: { p1: { text: "NO" } } };
    expect(storeCurrentMomentAnswers(room)).toBe(false);
    expect(room.storedPlayerAnswers).toBeUndefined();
  });
});
