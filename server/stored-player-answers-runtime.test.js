import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const {
  deletePlayerAnswerRecord,
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
    expect(room.sessionOutputs.byVisit["voice-moment@0"].records).toEqual({
      p1: { text: "JURASSIC PARK" }
    });
  });

  it("keeps repeated visits as distinct producer outputs", () => {
    const room = { gameSessionId: 6, flowStateId: "writing-moment", momentVisitId: 3, currentRound: 1 };
    storePlayerAnswerRecord(room, "p1", { text: "FIRST" });
    room.momentVisitId = 7;
    storePlayerAnswerRecord(room, "p1", { text: "SECOND" });

    expect(room.sessionOutputs.byVisit["writing-moment@3"].records.p1.text).toBe("FIRST");
    expect(room.sessionOutputs.byVisit["writing-moment@7"].records.p1.text).toBe("SECOND");
    expect(room.sessionOutputs.latestByState["writing-moment"]).toBe("writing-moment@7");
  });

  it("removes a deselected answer from only the current producer visit", () => {
    const room = { gameSessionId: 2, flowStateId: "crafting", momentVisitId: 5, currentRound: 1 };
    storePlayerAnswerRecord(room, "p1", { text: "Selected" });

    expect(deletePlayerAnswerRecord(room, "p1")).toBe(true);
    expect(room.storedPlayerAnswers[1].crafting).toEqual({});
    expect(room.sessionOutputs.byVisit["crafting@5"].records).toEqual({});
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
