import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { resolveVotingAnswerSource } = require("./room-phase-runtime");

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
