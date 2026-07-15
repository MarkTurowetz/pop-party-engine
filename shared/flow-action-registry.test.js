import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const {
  availableFlowActionTypes,
  createFlowActionRegistry,
  isCompletableStageActionType,
  stageActionRunnerDefinitions
} = require("./flow-action-registry");
const { normalizeFlowId } = require("../server/value-normalizers");

function registry(extra = {}) {
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
    normalizeVotingCardFilter: () => "all",
    ...extra
  });
}

describe("flow action registry", () => {
  it.each([
    ["startMoment", "Start Moment"],
    ["endMoment", "End Moment"]
  ])("registers %s as a primary stage lifecycle action", (type, name) => {
    const actionRegistry = registry();
    const available = availableFlowActionTypes.find((action) => action.id === type);
    const runner = stageActionRunnerDefinitions.find((definition) => definition.type === type);

    expect(available).toMatchObject({ id: type, name, category: "standard", primaryOnly: true });
    expect(runner).toEqual({ actionId: type, type, runner: type });
    expect(isCompletableStageActionType(type)).toBe(true);
    expect(actionRegistry.publicAction({ type }, { id: type, name })).toMatchObject({ type });
  });

  it("runs the authoritative room reset only from End Moment", () => {
    const endGameMoment = vi.fn();
    const room = {};
    const actionRegistry = registry({ endGameMoment });

    expect(actionRegistry.applyRoomEffect(room, { type: "startMoment" })).toBe(false);
    expect(actionRegistry.applyRoomEffect(room, { type: "endMoment" })).toBe(true);
    expect(endGameMoment).toHaveBeenCalledWith(room);
  });

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
