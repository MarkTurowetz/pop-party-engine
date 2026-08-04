import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const { createPlayerPublicRuntime } = require("./player-public-runtime");

function roomWithAnswers() {
  return {
    choiceInputActionId: "old-choice",
    choiceInputAnswers: new Map([["p1", { done: true, optionIndex: 0, text: "Old choice" }]]),
    choiceInputMode: "submitOnce",
    displayedPlayerAnswers: new Map(),
    hiddenPlayerAnswerIds: new Set(),
    microphoneAccessActionId: "",
    microphoneAccessAnswers: new Map(),
    microphoneAccessMode: "all",
    textInputActionId: "new-text",
    textInputAnswers: new Map(),
    textInputMode: "textAll",
    vipPlayerId: "p1"
  };
}

describe("player public input state", () => {
  it("does not serialize a stale choice answer as completion for the current text action", () => {
    const runtime = createPlayerPublicRuntime({ choiceInputPayload: vi.fn(() => null) });
    const player = { active: true, id: "p1", name: "Player", avatar: {} };

    const result = runtime.publicPlayer(player, roomWithAnswers(), { id: "new-text", type: "textSubmissionInput" });

    expect(result.needsInput).toBe(true);
    expect(result.answer).toBeNull();
  });

  it("does not expose an in-progress core input to a late non-recipient", () => {
    const choiceInputPayload = vi.fn(() => ({ actionId: "choice" }));
    const runtime = createPlayerPublicRuntime({ choiceInputPayload });
    const room = {
      choiceInputActionId: "choice",
      choiceInputAnswers: new Map(),
      choiceInputMode: "submitOnce",
      controllerInputRecipientIds: new Set(["p1"]),
      displayedPlayerAnswers: new Map(),
      hiddenPlayerAnswerIds: new Set(),
      textInputActionId: "",
      microphoneAccessActionId: "",
      gamePluginInputActionId: "",
      vipPlayerId: "p1"
    };

    const result = runtime.publicPlayer({ active: true, id: "late", name: "Late" }, room, { id: "choice" });

    expect(result.needsInput).toBe(false);
    expect(result.input).toBeNull();
  });
});
