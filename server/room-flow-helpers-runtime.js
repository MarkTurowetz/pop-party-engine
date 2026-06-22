"use strict";

function createRoomFlowHelpersRuntime({
  activePlayers,
  advanceRoomFromMomentReturn,
  broadcastLobby,
  clearActionTimer,
  clearActiveInputFlowEvent,
  clearAnswersSubmittedAdvanceTimer,
  clearAppliedActionEffects,
  clearChoiceInput,
  clearCraftingTimerTimeout,
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
  function currentRoomAction(room) {
    if (room.presentedAction) return room.presentedAction;
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

function advanceRoomAfterAction(room, action) {
    const target = action?.nextTargetActionId || "";
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
    room.answersSubmittedAdvanceTimerId = setTimeout(() => {
      room.answersSubmittedAdvanceTimerId = null;
      emitInputFlowEvent(room, "allPlayersSubmitted");
    }, 500);
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
    scheduleAnswersSubmittedAdvance,
  };
}

module.exports = { createRoomFlowHelpersRuntime };
