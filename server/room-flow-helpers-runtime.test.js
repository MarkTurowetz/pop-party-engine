import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const { createRoomFlowHelpersRuntime } = require("./room-flow-helpers-runtime");

function setup() {
  const flow = {
    states: [
      {
        id: "lobby",
        entryTargetActionId: "setup",
        actions: [
          {
            id: "countdown",
            name: "On Countdown Complete",
            type: "transitionState",
            trigger: "onCountdownComplete",
            targetState: "intro",
            nextTargetActionId: ""
          },
          { id: "setup", name: "Setup", type: "setupGame", nextTargetActionId: "header" },
          { id: "header", name: "Header", type: "displayText", nextTargetActionId: "countdown" }
        ]
      },
      {
        id: "intro",
        entryTargetActionId: "intro-entry",
        actions: [{ id: "intro-entry", name: "Intro", type: "doNothing", nextTargetActionId: "" }]
      }
    ],
    routeNodes: []
  };
  const broadcasts = vi.fn();
  const getStateActions = (stateId) => flow.states.find((state) => state.id === stateId)?.actions || [];
  const actionIndexById = (room, actionId) => getStateActions(room.flowStateId || room.phase)
    .findIndex((action) => action.id === actionId);
  const entryActionIndexForPhase = (_room, phase) => {
    const state = flow.states.find((item) => item.id === phase);
    return state ? state.actions.findIndex((action) => action.id === state.entryTargetActionId) : -1;
  };
  const enterGamePhase = vi.fn((room, phase) => {
    room.phase = phase;
    room.flowStateId = phase;
    room.actionIndex = entryActionIndexForPhase(room, phase);
    room.pendingFlowEvents.clear();
  });
  const runtime = createRoomFlowHelpersRuntime({
    activePlayers: () => [],
    advanceRoomFromMomentReturn: vi.fn(),
    advanceRoomFromRouteAction: vi.fn(),
    broadcastLobby: broadcasts,
    clearActionTimer: vi.fn(),
    clearActiveInputFlowEvent: (room) => { room.activeInputFlowEventKey = ""; },
    clearAnswersSubmittedAdvanceTimer: vi.fn(),
    clearAppliedActionEffects: vi.fn(),
    clearChoiceInput: vi.fn(),
    clearCraftingTimerTimeout: vi.fn(),
    clearMicrophoneAccessInput: vi.fn(),
    clearTextInput: vi.fn(),
    clearVotingInput: vi.fn(),
    entryActionIndexForPhase,
    enterGamePhase,
    flowActionTarget: (value) => String(value || ""),
    flowActionIndexById: actionIndexById,
    flowEventTargetForAction: (action, eventType) => eventType === "countdownComplete" ? action?.nextTargetActionId || "" : "",
    getFlowState: (targetFlow, stateId) => targetFlow.states.find((state) => state.id === stateId) || null,
    getStateActions,
    isNoActionTarget: (target) => !target || target === "none",
    isReturnActionTarget: (target) => target === "return",
    pauseCraftingTimer: vi.fn(),
    publicFlowAction: (action, index) => ({ ...action, index }),
    resolveDecisionActionIndex: vi.fn(),
    runtimeGameFlow: () => flow
  });
  const room = {
    phase: "lobby",
    flowStateId: "lobby",
    actionIndex: -1,
    subroutinePath: [],
    subroutineStack: [],
    pendingFlowEvents: new Set(),
    activeInputFlowEventKey: "",
    craftingTimerRunning: false
  };
  return { broadcasts, enterGamePhase, room, runtime };
}

describe("room flow action exposure and event barriers", () => {
  it("starts every flow state at its authored entry target", () => {
    const { room, runtime } = setup();
    expect(runtime.currentRoomAction(room).id).toBe("setup");
    expect(room.actionIndex).toBe(1);
  });

  it("keeps the lobby flow action active while the visible phase is starting", () => {
    const { room, runtime } = setup();
    room.actionIndex = 2;
    room.phase = "starting";
    expect(runtime.currentRoomAction(room).id).toBe("header");
  });

  it("queues an early countdown and releases it only after prior actions reach the barrier", () => {
    const { enterGamePhase, room, runtime } = setup();
    room.actionIndex = 2;
    room.phase = "starting";
    room.actionExecutionSignature = "active-header";

    runtime.completeCountdownTrigger(room);
    expect(runtime.currentRoomAction(room).id).toBe("header");
    expect(room.pendingFlowEvents.has("countdownComplete")).toBe(true);
    expect(enterGamePhase).not.toHaveBeenCalled();

    runtime.advanceRoomAfterAction(room, runtime.currentRoomAction(room));
    expect(room.actionExecutionSignature).toBe("");
    expect(runtime.currentRoomAction(room).id).toBe("countdown");
    expect(runtime.releasePendingFlowEvents(room)).toBe(true);
    expect(enterGamePhase).toHaveBeenCalledWith(room, "intro");
  });
});
