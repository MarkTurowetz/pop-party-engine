import { describe, expect, it } from "vitest";
import { resolveControllerSubmissionConfirmation } from "./controllerSubmissionConfirmation";

describe("controller submission confirmation", () => {
  it("confirms completed submit-once choices but never voting choices", () => {
    const player = { answer: { done: true, text: "T-Rex" }, input: { actionId: "choice-1", mode: "submitOnce" } };
    expect(resolveControllerSubmissionConfirmation({}, player)).toEqual({
      actionId: "choice-1",
      kind: "choice",
      message: "You answered: T-Rex"
    });
    expect(resolveControllerSubmissionConfirmation({}, {
      ...player,
      input: { actionId: "vote-1", mode: "submitOnce", type: "vote" }
    })).toBeNull();
  });

  it("confirms writing answers but never voice answers", () => {
    const player = { answer: { done: true, text: "A movie" } };
    expect(resolveControllerSubmissionConfirmation({ textInput: { actionId: "write-1", type: "text" } }, player)).toEqual({
      actionId: "write-1",
      kind: "writing",
      message: "You wrote: A movie"
    });
    expect(resolveControllerSubmissionConfirmation({ textInput: { actionId: "voice-1", type: "voice" } }, player)).toBeNull();
  });

  it("does not revive stale completed text without a current input contract", () => {
    expect(resolveControllerSubmissionConfirmation({}, { answer: { done: true, text: "Old answer" } })).toBeNull();
  });
});
