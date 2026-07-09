import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { createFlowActionRegistry } = require("./flow-action-registry");
const { normalizeFlowId } = require("../server/value-normalizers");

function registry() {
  return createFlowActionRegistry({
    availableFlowTransitions: [],
    cleanChoiceOptions: () => [],
    cleanFlowText: (value, fallback = "") => String(value || fallback).trim(),
    flowActionTarget: (value) => String(value || ""),
    normalizeCharacterLimit: () => 0,
    normalizeChoiceInputMode: () => "single",
    normalizeConstantInteger: () => 0,
    normalizeDecisionBranches: () => [],
    normalizeDecisionValueType: () => "string",
    normalizeFlowId,
    normalizeFlowVariableName: (value, fallback = "") => String(value || fallback),
    normalizeHostAudioPlayMode: () => "random",
    normalizeLineIndex: () => 0,
    normalizePlayerFilter: () => "all",
    normalizeTextTarget: (value) => String(value || "presentation"),
    normalizeVotingCardFilter: () => "all"
  });
}

describe("flow action registry", () => {
  it("preserves exact nested component target paths for game object timeline actions", () => {
    const action = registry().normalizeAction(
      "playGameObjectAnimation",
      {
        targetLayoutElementId: "Player Object",
        targetComponentId: "answerBubbleSlot / answerText",
        animationName: "pop"
      },
      { id: "a", name: "A", type: "playGameObjectAnimation" }
    );

    expect(action.targetLayoutElementId).toBe("player-object");
    expect(action.targetComponentId).toBe("answerBubbleSlot/answerText");
  });

  it("preserves exact nested component target paths when serializing public actions", () => {
    const action = registry().publicAction(
      {
        type: "stopGameObjectAnimation",
        targetLayoutElementId: "avatar",
        componentId: "dinoMask / poseFrame",
        animationName: "stego"
      },
      { id: "a", name: "A" }
    );

    expect(action.targetComponentId).toBe("dinoMask/poseFrame");
    expect(action.timelinePlaybackMode).toBe("stop");
  });
});
