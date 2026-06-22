"use strict";

const { stageCompletionCleanupForActionType } = require("../shared/flow-action-registry");

function createActionCompletionRuntime({
  advanceRoomAfterAction,
  applyRoomActionEffects = () => {},
  broadcastLobby,
  clearChoiceInput,
  clearTextInput,
  currentRoomAction,
  enterGamePhase
}) {
  function clearCompletionInput(room, action) {
    const cleanup = stageCompletionCleanupForActionType(action?.type);
    if (cleanup === "choice") clearChoiceInput(room);
    if (cleanup === "text") clearTextInput(room);
  }

  function clearActionTimer(room) {
    if (room.actionTimerId) {
      clearTimeout(room.actionTimerId);
      room.actionTimerId = null;
    }
    room.actionCompletionPendingId = "";
  }

  function completeCurrentAction(room, expectedActionId = "", source = "callback") {
    const currentAction = currentRoomAction(room);
    if (!currentAction) return false;
    if (expectedActionId && currentAction.id !== expectedActionId) return false;
    if (room.actionCompletionPendingId === currentAction.id) return false;

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
          currentRoomAction(room);
          broadcastLobby(room);
          return;
        }
        enterGamePhase(room, currentAction.targetState || "intro");
      };
      if (delayMs > 0) {
        room.actionCompletionPendingId = currentAction.id;
        room.actionTimerId = setTimeout(() => {
          room.actionTimerId = null;
          room.actionCompletionPendingId = "";
          completeTransitionState();
        }, delayMs);
        return true;
      }
      completeTransitionState();
      return true;
    }

    clearActionTimer(room);
    const delayMs = timing.mode === "E+" ? Math.max(0, Number(timing.seconds || 0) * 1000) : 0;
    if (delayMs > 0) {
      room.actionCompletionPendingId = currentAction.id;
      room.actionTimerId = setTimeout(() => {
        room.actionTimerId = null;
        room.actionCompletionPendingId = "";
        clearCompletionInput(room, currentAction);
        advanceRoomAfterAction(room, currentAction);
        currentRoomAction(room);
        broadcastLobby(room);
      }, delayMs);
      return true;
    }

    clearCompletionInput(room, currentAction);
    advanceRoomAfterAction(room, currentAction);
    currentRoomAction(room);
    broadcastLobby(room);
    return true;
  }

  return {
    clearActionTimer,
    completeCurrentAction
  };
}

module.exports = { createActionCompletionRuntime };
