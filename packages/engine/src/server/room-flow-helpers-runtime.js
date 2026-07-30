"use strict";

const {
  flowEventTypeForAction,
  isFlowEventBarrierAction
} = require("../shared/flow-action-registry");
const { createRuntimeFault } = require("./runtime-fault-runtime");
const {
  applySubroutineOutputs,
  createSubroutineLocalScope
} = require("./subroutine-interface-runtime");

function createRoomFlowHelpersRuntime({
  activePlayers,
  advanceRoomFromMomentReturn,
  advanceRoomFromRouteAction,
  broadcastLobby,
  clearActionTimer,
  clearActiveInputFlowEvent,
  clearAnswersSubmittedAdvanceTimer,
  clearAppliedActionEffects,
  clearChoiceInput,
  clearCraftingTimerTimeout,
  clearMicrophoneAccessInput,
  clearTextInput,
  clearVotingInput,
  entryActionIndexForPhase,
  getStateActions,
  enterGamePhase,
  flowActionTarget,
  flowActionIndexById,
  flowEventTargetForAction,
  finalizeTextInputDrafts = () => 0,
  getFlowState,
  isNoActionTarget,
  isReturnActionTarget,
  pauseCraftingTimer,
  publicFlowAction,
  resolveDecisionActionIndex,
  runtimeGameFlow,
}) {
  function routeNodeById(room, nodeId) {
    const target = String(nodeId || "");
    if (!target) return null;
    return (runtimeGameFlow(room).routeNodes || []).find((node) => node.id === target) || null;
  }

  function currentRouteAction(room) {
    const node = routeNodeById(room, room.routeActionSession?.currentNodeId);
    if (!node || node.routeNodeType !== "action") {
      if (room.routeActionSession) room.routeActionSession = null;
      return null;
    }
    return publicFlowAction({
      ...node,
      routeNodeType: "action",
      routeNodeId: node.id,
      nextTargetActionId: node.type === "jumpNode"
        ? node.jumpTargetActionId || node.nextTargetNodeId || node.nextTargetActionId || ""
        : node.nextTargetNodeId || node.nextTargetActionId || ""
    }, -1);
  }

  function currentRoomAction(room) {
    if (room.presentedAction) return room.presentedAction;
    const routeAction = currentRouteAction(room);
    if (routeAction) return routeAction;
    if (!Number.isFinite(room.actionIndex) || room.actionIndex < 0) {
      const flowStateId = room.flowStateId || room.phase;
      const entryIndex = entryActionIndexForPhase(room, flowStateId);
      const actions = getStateActions(flowStateId, room);
      room.actionIndex = entryIndex === -1 ? actions.length : Math.max(0, entryIndex);
    }
    let guard = 0;
    while (guard < 40) {
      const actions = getStateActions(room.flowStateId || room.phase, room);
      if (room.actionIndex >= actions.length) {
        if (room.phase !== "lobby" && room.phase !== "starting") {
          createRuntimeFault(room, {
            code: "FLOW_ACTION_MISSING",
            message: `${room.flowStateId || room.phase} reached the end of its action list without an authored exit.`,
            expected: "An End Moment or another valid flow action",
            actual: `Action index ${room.actionIndex}; ${actions.length} authored actions`
          });
        }
        return null;
      }
      const action = actions[room.actionIndex];
      if (action?.type === "subroutine") {
        if (!enterNestedSubroutine(room, action)) return null;
        guard += 1;
        continue;
      }
      if (action?.type === "decision") {
        clearAppliedActionEffects(room);
        const nextActionIndex = resolveDecisionActionIndex(room, action);
        if (nextActionIndex === null) {
          createRuntimeFault(room, {
            code: "DECISION_NO_MATCH",
            message: `${action.name || action.id || "Decision"} has no matching branch.`,
            actionId: action.id,
            expected: "A matching decision branch",
            actual: room.lastDecisionTrace?.haltReason || "No branch matched"
          });
          return null;
        }
        room.actionIndex = Math.max(0, Math.min(actions.length, nextActionIndex));
        guard += 1;
        continue;
      }
      return publicFlowAction(action, room.actionIndex);
    }
    markNoAction(room, null, "Flow Guard Limit");
    return null;
  }

  function actionAdvanceTarget(action) {
    if (action?.type === "jumpNode") return action.jumpTargetActionId || "none";
    return action?.nextTargetActionId || "";
  }

  function markNoAction(room, action, haltReason = "No Action") {
    room.lastDecisionTrace = {
      actionId: action?.id || "",
      actionName: action?.name || "",
      selectedTarget: "none",
      haltReason,
      activePlayerCount: activePlayers(room).length,
      evaluatedAt: Date.now()
    };
    createRuntimeFault(room, {
      code: "FLOW_TARGET_INVALID",
      message: `${action?.name || action?.id || "The current flow action"} cannot continue: ${haltReason}.`,
      actionId: action?.id,
      expected: "A valid authored next target",
      actual: haltReason
    });
  }

  function haltInvalidFlowTarget(room, action, eventType, actual = "No target") {
    createRuntimeFault(room, {
      code: "FLOW_TARGET_INVALID",
      message: `${action?.name || action?.id || "The current flow action"} cannot continue because its ${eventType || "next"} target is invalid.`,
      actionId: action?.id,
      expected: "A valid authored flow target",
      actual
    });
    clearActionTimer(room);
    broadcastLobby(room);
    return false;
  }

  function ensureSubroutineStack(room) {
    if (!Array.isArray(room.subroutineStack)) room.subroutineStack = [];
    if (!Array.isArray(room.subroutinePath)) room.subroutinePath = [];
  }

  function actionList(action) {
    return Array.isArray(action?.actions) ? action.actions : [];
  }

  function entryIndexForSubroutine(room, action) {
    const target = flowActionTarget(action?.entryTargetActionId);
    if (isReturnActionTarget(target)) return -2;
    if (isNoActionTarget(target)) return -1;
    if (target) {
      const targetIndex = flowActionIndexById(room, target);
      if (targetIndex >= 0) return targetIndex;
    }
    const actions = getStateActions(room.phase, room);
    return actions.length ? 0 : -1;
  }

  function enterNestedSubroutine(room, action) {
    ensureSubroutineStack(room);
    const parentPath = [...room.subroutinePath];
    let localVariables;
    try {
      localVariables = createSubroutineLocalScope(room, action);
    } catch (error) {
      createRuntimeFault(room, {
        code: "SUBROUTINE_INPUT_INVALID",
        message: `${action.name || action.id || "Subroutine"} could not initialize its local inputs.`,
        actionId: action.id,
        expected: "Declared inputs that resolve to their authored value types",
        actual: String(error?.message || error)
      });
      return false;
    }
    room.subroutineStack.push({
      phase: room.phase,
      subroutinePath: parentPath,
      actionIndex: room.actionIndex,
      actionId: action.id,
      localVariables: room.localVariables && typeof room.localVariables === "object"
        ? room.localVariables
        : {}
    });
    room.subroutinePath = [...parentPath, action.id];
    room.localVariables = localVariables;
    const entryIndex = entryIndexForSubroutine(room, action);
    if (entryIndex === -2) {
      returnFromNestedSubroutine(room, action);
      return true;
    }
    const actions = actionList(action);
    room.actionIndex = entryIndex === -1 ? actions.length : Math.max(0, entryIndex);
    return true;
  }

  function restoreSubroutineFrame(room, frame) {
    room.phase = frame.phase || room.phase;
    room.subroutinePath = Array.isArray(frame.subroutinePath) ? [...frame.subroutinePath] : [];
    room.actionIndex = Math.max(0, Number(frame.actionIndex || 0));
    room.localVariables = frame.localVariables && typeof frame.localVariables === "object"
      ? frame.localVariables
      : {};
  }

  function parentSubroutineActionForFrame(room, frame) {
    const actions = getStateActions(room.phase, room);
    const indexed = actions[room.actionIndex];
    if (indexed?.id === frame.actionId) return indexed;
    return actions.find((action) => action.id === frame.actionId) || indexed || null;
  }

  function returnFromNestedSubroutine(room, sourceAction = null) {
    ensureSubroutineStack(room);
    const frame = room.subroutineStack.pop();
    if (!frame) {
      advanceRoomFromMomentReturn(room);
      return true;
    }
    const calleeLocals = room.localVariables && typeof room.localVariables === "object"
      ? room.localVariables
      : {};
    restoreSubroutineFrame(room, frame);
    const parentAction = parentSubroutineActionForFrame(room, frame);
    if (!parentAction) {
      markNoAction(room, sourceAction, "Missing Parent Subroutine");
      return false;
    }
    try {
      applySubroutineOutputs(room, parentAction, calleeLocals, room.localVariables);
    } catch (error) {
      createRuntimeFault(room, {
        code: "SUBROUTINE_OUTPUT_INVALID",
        message: `${parentAction.name || parentAction.id || "Subroutine"} could not return its declared outputs.`,
        actionId: parentAction.id,
        expected: "Declared outputs that resolve and assign to compatible g.* or parent l.* targets",
        actual: String(error?.message || error)
      });
      return false;
    }
    advanceRoomAfterAction(room, parentAction);
    return true;
  }

  function advanceRoomAfterAction(room, action) {
    if (room.runtimeFault) return false;
    room.actionExecutionSignature = "";
    if (action?.routeNodeType === "action" || room.routeActionSession?.currentNodeId === action?.id) {
      advanceRoomFromRouteAction(room, action);
      return;
    }
    if (action?.type === "subroutine" && !Array.isArray(room.subroutinePath)) {
      room.subroutinePath = [];
    }
    const target = actionAdvanceTarget(action);
    if (isNoActionTarget(target)) {
      markNoAction(room, action, "No Target");
      return false;
    }
    if (isReturnActionTarget(target)) {
      if (Array.isArray(room.subroutineStack) && room.subroutineStack.length) {
        returnFromNestedSubroutine(room, action);
      } else {
        advanceRoomFromMomentReturn(room);
      }
      return;
    }
    const targetIndex = flowActionIndexById(room, target);
    if (targetIndex >= 0) {
      room.actionIndex = targetIndex;
      return;
    }
    markNoAction(room, action, target ? "Missing Target" : "No Action");
    return false;
  }

  function jumpToAction(room, actionId, sourceAction = currentRoomAction(room)) {
    if (room.runtimeFault) return false;
    room.actionExecutionSignature = "";
    if (room.routeActionSession?.currentNodeId) {
      room.presentedAction = null;
      clearActiveInputFlowEvent(room);
      clearAppliedActionEffects(room);
      advanceRoomFromRouteAction(room, { nextTargetNodeId: actionId, jumpTargetActionId: actionId, type: "jumpNode" });
      return;
    }
    if (isReturnActionTarget(actionId)) {
      room.presentedAction = null;
      clearActiveInputFlowEvent(room);
      clearAppliedActionEffects(room);
      if (Array.isArray(room.subroutineStack) && room.subroutineStack.length) {
        returnFromNestedSubroutine(room, sourceAction);
      } else {
        advanceRoomFromMomentReturn(room);
      }
      return;
    }
    const targetIndex = flowActionIndexById(room, actionId);
    room.presentedAction = null;
    clearActiveInputFlowEvent(room);
    clearAppliedActionEffects(room);
    if (targetIndex >= 0) {
      room.actionIndex = targetIndex;
      return true;
    }
    markNoAction(room, sourceAction, actionId ? "Missing Target" : "No Action");
    return false;
  }

  function emitInputFlowEvent(room, eventType) {
    if (room.runtimeFault) return false;
    clearAnswersSubmittedAdvanceTimer(room);
    const currentAction = currentRoomAction(room);
    const barrierEventType = flowEventTypeForAction(currentAction);
    const target = flowEventTargetForAction(currentAction, eventType);
    const eventKey = `${currentAction?.id || "none"}:${eventType}`;
    if (!currentAction || room.activeInputFlowEventKey === eventKey) {
      return false;
    }
    if (barrierEventType && barrierEventType !== eventType) return false;
    if (eventType === "countdownComplete" && barrierEventType !== eventType) return false;
    const canUseBarrierFallback = barrierEventType === eventType
      && currentAction.type === "transitionState";
    if (isNoActionTarget(target) && !canUseBarrierFallback) {
      return haltInvalidFlowTarget(room, currentAction, eventType);
    }
    if (eventType === "timerEnd") finalizeTextInputDrafts(room);
    room.activeInputFlowEventKey = eventKey;
    if (room.craftingTimerRunning) {
      pauseCraftingTimer(room);
    } else {
      clearCraftingTimerTimeout(room);
    }
    if (eventType === "timerEnd") {
      room.craftingTimerRemainingMs = 0;
      room.craftingTimerEndHandled = true;
    }
    clearChoiceInput(room);
    clearMicrophoneAccessInput(room);
    clearTextInput(room);
    clearVotingInput(room);
    if (isNoActionTarget(target)) {
      if (!currentAction.targetState) return haltInvalidFlowTarget(room, currentAction, eventType);
      enterGamePhase(room, currentAction.targetState);
      return true;
    }
    jumpToAction(room, target, currentAction);
    broadcastLobby(room);
    return true;
  }

  function pendingFlowEvents(room) {
    if (!(room.pendingFlowEvents instanceof Set)) room.pendingFlowEvents = new Set(room.pendingFlowEvents || []);
    return room.pendingFlowEvents;
  }

  function releasePendingFlowEvents(room) {
    if (room.runtimeFault) return false;
    const action = currentRoomAction(room);
    if (!isFlowEventBarrierAction(action)) return false;
    const eventType = flowEventTypeForAction(action);
    const pending = pendingFlowEvents(room);
    if (!eventType || !pending.has(eventType)) return false;
    pending.delete(eventType);
    return emitInputFlowEvent(room, eventType);
  }

  function scheduleAnswersSubmittedAdvance(room) {
    if (room.runtimeFault) return;
    if (room.answersSubmittedAdvanceTimerId) return;
    const currentAction = currentRoomAction(room);
    const target = flowEventTargetForAction(currentAction, "allPlayersSubmitted");
    if (isNoActionTarget(target)) {
      haltInvalidFlowTarget(room, currentAction, "allPlayersSubmitted");
      return;
    }
    room.answersSubmittedAdvanceStartedAt = 0;
    room.answersSubmittedAdvanceEndsAt = 0;
    room.answersSubmittedAdvanceRemainingMs = 0;
    emitInputFlowEvent(room, "allPlayersSubmitted");
  }

  function scheduleMicrophoneAccessAdvance(room) {
    if (room.runtimeFault) return;
    if (room.answersSubmittedAdvanceTimerId) return;
    const currentAction = currentRoomAction(room);
    const target = flowEventTargetForAction(currentAction, "microphoneAccessGranted");
    if (isNoActionTarget(target)) {
      haltInvalidFlowTarget(room, currentAction, "microphoneAccessGranted");
      return;
    }
    emitInputFlowEvent(room, "microphoneAccessGranted");
  }

  function pauseAnswersSubmittedAdvanceTimer(room) {
    if (!room.answersSubmittedAdvanceTimerId) return;
    clearTimeout(room.answersSubmittedAdvanceTimerId);
    room.answersSubmittedAdvanceTimerId = null;
    room.answersSubmittedAdvanceRemainingMs = Math.max(0, (room.answersSubmittedAdvanceEndsAt || Date.now()) - Date.now());
    room.answersSubmittedAdvanceStartedAt = 0;
    room.answersSubmittedAdvanceEndsAt = 0;
  }

  function resumeAnswersSubmittedAdvanceTimer(room) {
    if (room.runtimeFault || room.answersSubmittedAdvanceTimerId || room.answersSubmittedAdvanceRemainingMs <= 0) return;
    const currentAction = currentRoomAction(room);
    const target = flowEventTargetForAction(currentAction, "allPlayersSubmitted");
    if (isNoActionTarget(target)) {
      clearAnswersSubmittedAdvanceTimer(room);
      return;
    }
    const delayMs = Math.max(0, room.answersSubmittedAdvanceRemainingMs || 0);
    const now = Date.now();
    room.answersSubmittedAdvanceStartedAt = now;
    room.answersSubmittedAdvanceEndsAt = now + delayMs;
    room.answersSubmittedAdvanceTimerId = setTimeout(() => {
      room.answersSubmittedAdvanceTimerId = null;
      room.answersSubmittedAdvanceStartedAt = 0;
      room.answersSubmittedAdvanceEndsAt = 0;
      room.answersSubmittedAdvanceRemainingMs = 0;
      emitInputFlowEvent(room, "allPlayersSubmitted");
    }, delayMs);
  }

  function countdownTargetState(room) {
    const lobbyState = getFlowState(runtimeGameFlow(room), "lobby");
    const action = lobbyState?.actions.find((item) => item.type === "transitionState" && item.trigger === "onCountdownComplete");
    return action?.targetState || "";
  }

  function completeCountdownTrigger(room) {
    const lobbyState = getFlowState(runtimeGameFlow(room), room.flowStateId || "lobby");
    const barrier = lobbyState?.actions.find((item) => flowEventTypeForAction(item) === "countdownComplete");
    if (!barrier) {
      haltInvalidFlowTarget(room, null, "countdownComplete", "No countdown completion action");
      return;
    }
    pendingFlowEvents(room).add("countdownComplete");
    if (!releasePendingFlowEvents(room)) broadcastLobby(room);
  }

  return {
    advanceRoomAfterAction,
    completeCountdownTrigger,
    countdownTargetState,
    currentRoomAction,
    emitInputFlowEvent,
    jumpToAction,
    pauseAnswersSubmittedAdvanceTimer,
    resumeAnswersSubmittedAdvanceTimer,
    releasePendingFlowEvents,
    scheduleAnswersSubmittedAdvance,
    scheduleMicrophoneAccessAdvance,
  };
}

module.exports = { createRoomFlowHelpersRuntime };
