"use strict";

const {
  isFlowEventBarrierAction,
  stageCompletionCleanupForActionType
} = require("../shared/flow-action-registry");

function createActionCompletionRuntime({
  advanceRoomAfterAction,
  applyRoomActionEffects = () => {},
  broadcastLobby,
  clearChoiceInput,
  clearMicrophoneAccessInput,
  clearTextInput,
  currentRoomAction,
  enterGamePhase,
  releasePendingFlowEvents = () => false
}) {
  function clearCompletionInput(room, action) {
    const cleanup = stageCompletionCleanupForActionType(action?.type);
    if (cleanup === "choice") clearChoiceInput(room);
    if (cleanup === "microphone") clearMicrophoneAccessInput(room);
    if (cleanup === "text") clearTextInput(room);
  }

  function clearActionTimer(room) {
    if (room.actionTimerId) {
      clearTimeout(room.actionTimerId);
      room.actionTimerId = null;
    }
    room.actionCompletionPendingId = "";
    room.actionTimerStartedAt = 0;
    room.actionTimerEndsAt = 0;
    room.actionTimerRemainingMs = 0;
  }

  function broadcastAfterAdvance(room) {
    currentRoomAction(room);
    if (!releasePendingFlowEvents(room)) broadcastLobby(room);
  }

  function finishPendingAction(room, expectedActionId) {
    const currentAction = currentRoomAction(room);
    if (!currentAction || currentAction.id !== expectedActionId) {
      clearActionTimer(room);
      return false;
    }
    room.actionTimerId = null;
    room.actionCompletionPendingId = "";
    room.actionTimerStartedAt = 0;
    room.actionTimerEndsAt = 0;
    room.actionTimerRemainingMs = 0;

    if (currentAction.type === "transitionState") {
      const useNodeExit = Boolean(currentAction.nextTargetActionId);
      if (useNodeExit) {
        advanceRoomAfterAction(room, currentAction);
        broadcastAfterAdvance(room);
        return true;
      }
      enterGamePhase(room, currentAction.targetState || "intro");
      return true;
    }

    clearCompletionInput(room, currentAction);
    advanceRoomAfterAction(room, currentAction);
    broadcastAfterAdvance(room);
    return true;
  }

  function schedulePendingAction(room, currentAction, delayMs) {
    const delay = Math.max(0, Number(delayMs || 0));
    const now = Date.now();
    room.actionCompletionPendingId = currentAction.id;
    room.actionTimerStartedAt = now;
    room.actionTimerEndsAt = now + delay;
    room.actionTimerRemainingMs = delay;
    room.actionTimerId = setTimeout(() => {
      finishPendingAction(room, currentAction.id);
    }, delay);
  }

  function pauseActionTimer(room) {
    if (!room.actionTimerId) return;
    clearTimeout(room.actionTimerId);
    room.actionTimerId = null;
    room.actionTimerRemainingMs = Math.max(0, (room.actionTimerEndsAt || Date.now()) - Date.now());
    room.actionTimerStartedAt = 0;
    room.actionTimerEndsAt = 0;
  }

  function resumeActionTimer(room) {
    if (room.actionTimerId || !room.actionCompletionPendingId) return;
    const currentAction = currentRoomAction(room);
    if (!currentAction || currentAction.id !== room.actionCompletionPendingId) {
      clearActionTimer(room);
      return;
    }
    schedulePendingAction(room, currentAction, room.actionTimerRemainingMs || 0);
  }

  function completeCurrentAction(room, expectedActionId = "", source = "callback") {
    if (room.isPaused) return false;
    const currentAction = currentRoomAction(room);
    if (!currentAction) return false;
    if (expectedActionId && currentAction.id !== expectedActionId) return false;
    if (room.actionCompletionPendingId === currentAction.id) return false;
    if (isFlowEventBarrierAction(currentAction)) return false;

    const timing = currentAction.timing || { mode: "E+", seconds: 0 };
    if (timing.mode === "S+" && source !== "startTimer") return false;
    if (timing.mode === "E+" && source === "startTimer") return false;

    applyRoomActionEffects(room, currentAction);

    if (currentAction.type === "transitionState") {
      clearActionTimer(room);
      const delayMs = timing.mode === "E+" ? Math.max(0, Number(timing.seconds || 0) * 1000) : 0;
      const useNodeExit = Boolean(currentAction.nextTargetActionId);
      const completeTransitionState = () => {
        if (useNodeExit) {
          advanceRoomAfterAction(room, currentAction);
          broadcastAfterAdvance(room);
          return;
        }
        enterGamePhase(room, currentAction.targetState || "intro");
      };
      if (delayMs > 0) {
        schedulePendingAction(room, currentAction, delayMs);
        return true;
      }
      completeTransitionState();
      return true;
    }

    clearActionTimer(room);
    const delayMs = timing.mode === "E+" ? Math.max(0, Number(timing.seconds || 0) * 1000) : 0;
    if (delayMs > 0) {
      schedulePendingAction(room, currentAction, delayMs);
      return true;
    }

    clearCompletionInput(room, currentAction);
    advanceRoomAfterAction(room, currentAction);
    broadcastAfterAdvance(room);
    return true;
  }

  return {
    clearActionTimer,
    completeCurrentAction,
    pauseActionTimer,
    resumeActionTimer
  };
}

module.exports = { createActionCompletionRuntime };
