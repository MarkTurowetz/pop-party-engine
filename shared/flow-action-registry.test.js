import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const {
  availableFlowActionTypes,
  createFlowActionRegistry,
  flowActionDefinitions,
  isCompletableStageActionType,
  stageActionRunnerDefinitions,
  validateFlowActionDefinitions
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
  it("requires complete, unique serializers for every registered action", () => {
    expect(() => validateFlowActionDefinitions(flowActionDefinitions)).not.toThrow();
    expect(flowActionDefinitions.every((definition) => (
      typeof definition.normalize === "function" && typeof definition.toPublic === "function"
    ))).toBe(true);
  });

  it("fails closed without converting an unknown action into Display Text", () => {
    const actionRegistry = registry();
    expect(actionRegistry.publicAction(
      { type: "futureAction" },
      { id: "future", actionType: "futureAction" }
    )).toEqual({ id: "future", actionType: "futureAction", type: "futureAction" });
  });

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

  it("keeps point-popup event identities fresh when a game restarts in the same room", () => {
    const actionRegistry = registry({
      filteredPlayerIds: () => ["p1"],
      gameConstants: () => ({ pointsForCorrectAnswer: 100 })
    });
    const room = {
      players: new Map([["p1", { points: 50, pendingPoints: 0 }]]),
      pendingPointPopupNonce: 7
    };

    actionRegistry.applyRoomEffect(room, { type: "setupGame" });
    actionRegistry.applyRoomEffect(room, { type: "showPoints", points: 25, playerFilter: "all" });

    expect(room.pendingPointPopupNonce).toBe(8);
    expect(room.pendingPointPopups).toEqual([expect.objectContaining({ id: "8-p1", playerId: "p1", points: 25 })]);
  });

  it.each(["setupGame", "getPlayerAnswers"])("preserves the registered %s type in the stage payload", (type) => {
    const actionRegistry = registry();
    expect(actionRegistry.publicAction({ type }, { id: type, actionType: type })).toMatchObject({
      id: type,
      actionType: type,
      type
    });
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
