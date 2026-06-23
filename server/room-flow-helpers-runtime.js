"use strict";

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
  getStateActions,
  enterGamePhase,
  flowActionIndexById,
  flowEventTargetForAction,
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
    const actions = getStateActions(room.phase, room);
    if (room.actionIndex >= actions.length) return null;
    let guard = 0;
    while (actions[room.actionIndex]?.type === "decision" && guard < 20) {
      clearAppliedActionEffects(room);
      const nextActionIndex = resolveDecisionActionIndex(room, actions[room.actionIndex]);
      if (nextActionIndex === null) return null;
      room.actionIndex = Math.max(0, Math.min(actions.length, nextActionIndex));
      guard += 1;
      if (room.actionIndex >= actions.length) return null;
    }
    return publicFlowAction(actions[room.actionIndex], room.actionIndex);
  }

  function actionAdvanceTarget(action) {
    if (action?.type === "jumpNode") return action.jumpTargetActionId || "none";
    return action?.nextTargetActionId || "";
  }

  function advanceRoomAfterAction(room, action) {
    if (action?.routeNodeType === "action" || room.routeActionSession?.currentNodeId === action?.id) {
      advanceRoomFromRouteAction(room, action);
      return;
    }
    const target = actionAdvanceTarget(action);
    if (isNoActionTarget(target)) return;
    if (isReturnActionTarget(target)) {
      advanceRoomFromMomentReturn(room);
      return;
    }
    const targetIndex = flowActionIndexById(room, target);
    if (targetIndex >= 0) {
      room.actionIndex = targetIndex;
      return;
    }
    if (target) return;
    room.lastDecisionTrace = {
      actionId: action?.id || "",
      actionName: action?.name || "",
      selectedTarget: "none",
      haltReason: "No Matching Branch",
      activePlayerCount: activePlayers(room).length,
      evaluatedAt: Date.now()
    };
  }

  function jumpToAction(room, actionId, fallbackIndex = room.actionIndex + 1) {
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
      advanceRoomFromMomentReturn(room);
      return;
    }
    const targetIndex = flowActionIndexById(room, actionId);
    room.presentedAction = null;
    clearActiveInputFlowEvent(room);
    clearAppliedActionEffects(room);
    room.actionIndex = targetIndex >= 0 ? targetIndex : fallbackIndex;
  }

  function emitInputFlowEvent(room, eventType) {
    clearAnswersSubmittedAdvanceTimer(room);
    const fallbackIndex = room.actionIndex + 1;
    const currentAction = currentRoomAction(room);
    const target = flowEventTargetForAction(currentAction, eventType);
    const eventKey = `${currentAction?.id || "none"}:${eventType}`;
    if (!currentAction || room.activeInputFlowEventKey === eventKey) {
      return false;
    }
    const canUseCountdownFallback = eventType === "countdownComplete"
      && currentAction.type === "transitionState";
    if (isNoActionTarget(target) && !canUseCountdownFallback) {
      return false;
    }
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
      enterGamePhase(room, currentAction.targetState || "intro");
      return true;
    }
    jumpToAction(room, target, fallbackIndex);
    broadcastLobby(room);
    return true;
  }

  function scheduleAnswersSubmittedAdvance(room) {
    if (room.answersSubmittedAdvanceTimerId) return;
    const currentAction = currentRoomAction(room);
    const target = flowEventTargetForAction(currentAction, "allPlayersSubmitted");
    if (isNoActionTarget(target)) return;
    const delayMs = 500;
    const now = Date.now();
    room.answersSubmittedAdvanceStartedAt = now;
    room.answersSubmittedAdvanceEndsAt = now + delayMs;
    room.answersSubmittedAdvanceRemainingMs = delayMs;
    room.answersSubmittedAdvanceTimerId = setTimeout(() => {
      room.answersSubmittedAdvanceTimerId = null;
      room.answersSubmittedAdvanceStartedAt = 0;
      room.answersSubmittedAdvanceEndsAt = 0;
      room.answersSubmittedAdvanceRemainingMs = 0;
      emitInputFlowEvent(room, "allPlayersSubmitted");
    }, delayMs);
  }

  function scheduleMicrophoneAccessAdvance(room) {
    if (room.answersSubmittedAdvanceTimerId) return;
    const currentAction = currentRoomAction(room);
    const target = flowEventTargetForAction(currentAction, "microphoneAccessGranted");
    if (isNoActionTarget(target)) return;
    room.answersSubmittedAdvanceTimerId = setTimeout(() => {
      room.answersSubmittedAdvanceTimerId = null;
      emitInputFlowEvent(room, "microphoneAccessGranted");
    }, 100);
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
    if (room.answersSubmittedAdvanceTimerId || room.answersSubmittedAdvanceRemainingMs <= 0) return;
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
    return action?.targetState || "intro";
  }

  function completeCountdownTrigger(room) {
    const lobbyState = getFlowState(runtimeGameFlow(room), "lobby");
    const action = lobbyState?.actions.find((item) => item.type === "transitionState" && item.trigger === "onCountdownComplete");
    if (!action) {
      enterGamePhase(room, "intro");
      return;
    }
    room.phase = lobbyState.id;
    room.lobbyFlowActive = true;
    room.actionIndex = Math.max(0, lobbyState.actions.findIndex((item) => item.id === action.id));
    room.currentPresentationActionId = "";
    room.currentDisplayTextActionId = "";
    clearActionTimer(room);
    emitInputFlowEvent(room, "countdownComplete");
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
    scheduleAnswersSubmittedAdvance,
    scheduleMicrophoneAccessAdvance,
  };
}

module.exports = { createRoomFlowHelpersRuntime };
