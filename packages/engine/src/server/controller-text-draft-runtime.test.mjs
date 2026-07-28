import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const { createControllerSubmitHandlersRuntime } = require("./controller-submit-handlers-runtime");

function createHarness() {
  const player = { id: "p1", active: true };
  const room = {
    flowStateId: "writing",
    gameSessionId: 4,
    momentVisitId: 2,
    players: new Map([[player.id, player]]),
    sessionOutputs: { sessionId: 4, byVisit: {}, latestByState: {} },
    storedPlayerAnswers: {},
    textInputActionId: "write",
    textInputAnswers: new Map(),
    textInputCharacterLimit: 80,
    textInputDrafts: new Map(),
    textInputMode: "textAll",
    textInputVisitId: 7
  };
  const responses = [];
  const runtime = createControllerSubmitHandlersRuntime({
    allActivePlayersHaveSubmittedInput: () => false,
    applyChoiceInputAction: vi.fn(),
    applyMicrophoneAccessAction: vi.fn(),
    applyTextInputAction: vi.fn(),
    broadcastLobby: vi.fn(),
    cleanSubmittedText: (value, limit) => String(value || "").trim().slice(0, limit),
    currentRoomAction: () => ({ id: "write", type: "textSubmissionInput" }),
    displayedAnswerCorrectness: () => new Map(),
    emitInputFlowEvent: vi.fn(),
    forgetDisplayedPlayerAnswer: vi.fn(),
    getExistingRoom: () => room,
    lobbyPayload: () => ({}),
    normalizePlayerId: (value) => String(value || ""),
    normalizeStageCode: (value) => String(value || ""),
    readJson: async (req) => req.payload,
    rememberDisplayedPlayerAnswer: vi.fn(),
    resolveRoomActionText: (action) => action,
    scheduleAnswersSubmittedAdvance: vi.fn(),
    sendJson: (_res, status, body) => responses.push({ status, body }),
    updatePlayerAnswerGroups: vi.fn()
  });
  return { player, responses, room, runtime };
}

describe("controller text drafts", () => {
  it("keeps the newest draft and finalizes its non-empty text when the timer ends", async () => {
    const { responses, room, runtime } = createHarness();
    const base = {
      actionId: "write",
      gameSessionId: 4,
      inputVisitId: 7,
      playerId: "p1",
      stageCode: "ROOM",
      draft: true
    };

    await runtime.handleControllerTextSubmit({ payload: { ...base, draftSequence: 2, text: "latest 42" } }, {});
    await runtime.handleControllerTextSubmit({ payload: { ...base, draftSequence: 1, text: "stale" } }, {});

    expect(responses.at(-1)).toEqual({ status: 200, body: { ok: true, draft: true } });
    expect(runtime.finalizeTextInputDrafts(room)).toBe(1);
    expect(room.textInputAnswers.get("p1")).toMatchObject({ done: true, invalid: false, text: "latest 42" });
    expect(room.playerAnswerRecords.p1).toMatchObject({ actionId: "write", text: "latest 42" });
    expect(room.storedPlayerAnswers[1].writing.p1.text).toBe("latest 42");
  });

  it("does not create an answer when the saved field is blank", async () => {
    const { room, runtime } = createHarness();
    await runtime.handleControllerTextSubmit({
      payload: {
        actionId: "write",
        draft: true,
        draftSequence: 1,
        gameSessionId: 4,
        inputVisitId: 7,
        playerId: "p1",
        stageCode: "ROOM",
        text: "   "
      }
    }, {});

    expect(runtime.finalizeTextInputDrafts(room)).toBe(0);
    expect(room.textInputAnswers.has("p1")).toBe(false);
    expect(room.playerAnswerRecords).toBeUndefined();
  });
});
