import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const { createControllerInputPayloadRuntime } = require("./controller-input-payload-runtime");
const { controllerInputStaleError } = require("./controller-submit-handlers-runtime");

function runtime() {
  return createControllerInputPayloadRuntime({
    cleanChoiceOptions: (options) => options || [],
    clearDisplayedPlayerAnswers: vi.fn(),
    clearPlayerAnswerData: vi.fn(),
    normalizeCharacterLimit: (value) => Number(value || 0),
    normalizeChoiceInputMode: (value) => value || "singleSelect",
    triviaContentForAction: () => null
  });
}

describe("controller input lifecycle", () => {
  it("allocates a new visit when the same authored input is re-entered", () => {
    const inputRuntime = runtime();
    const room = { textInputActionId: "", textInputAnswers: new Map(), controllerInputVisitCounter: 20 };
    const action = { id: "write", type: "textSubmissionInput" };

    inputRuntime.applyTextInputAction(room, action);
    expect(room.textInputVisitId).toBe(21);
    room.textInputActionId = "";
    inputRuntime.applyTextInputAction(room, action);

    expect(room.textInputVisitId).toBe(22);
  });

  it("rejects responses from an earlier input visit or game session", () => {
    const room = { gameSessionId: 7 };
    expect(controllerInputStaleError({ gameSessionId: 7, inputVisitId: 4 }, room, 4, "Text input")).toBe("");
    expect(controllerInputStaleError({ gameSessionId: 7, inputVisitId: 3 }, room, 4, "Text input")).toBe("Text input is stale");
    expect(controllerInputStaleError({ gameSessionId: 6, inputVisitId: 4 }, room, 4, "Text input")).toBe(
      "Text input belongs to an earlier game"
    );
  });
});
