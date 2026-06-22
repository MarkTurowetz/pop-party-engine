"use strict";

function createRoomPhaseRuntime({
  activePlayers,
  broadcastLobby,
  clearActionTimer,
  clearAppliedActionEffects,
  clearChoiceInput,
  clearCountdownTimer,
  clearDisplayedPlayerAnswers,
  clearPlayerAnswerData,
  clearTextInput,
  clearVotingData,
  clearVotingInput,
  entryActionIndexForPhase,
  getStateActions,
  isRoundIntroStateId,
  normalizeFlowId,
  resetCraftingTimer,
  runtimeGameFlow,
}) {
  function advanceRoomFromMomentReturn(room) {
    const state = runtimeGameFlow(room).states.find((item) => item.id === room.phase);
    const targetStateId = normalizeFlowId(state?.nextStateTargetId, "");
    if (!targetStateId || isNoActionTarget(targetStateId)) return;
    if (runtimeGameFlow(room).states.some((item) => item.id === targetStateId)) {
      enterGamePhase(room, targetStateId);
    }
  }

  function isNoActionTarget(target) {
    return !target || target === "none";
  }

  function enterLobbyPhase(room) {
    clearCountdownTimer(room);
    clearActionTimer(room);
    room.phase = "lobby";
    room.countdownStartedAt = 0;
    room.countdownEndsAt = 0;
    room.actionIndex = 0;
    room.presentedAction = null;
    room.lastDecisionTrace = null;
    clearAppliedActionEffects(room);
    room.playersShown = true;
    room.playerAnswersShown = true;
    room.playerAnswersVisibleFilter = "all";
    room.flowVariables = {};
    clearPlayerAnswerData(room);
    room.pendingPointPopups = [];
    room.currentRound = 1;
    room.hasEnteredRoundIntro = false;
    resetCraftingTimer(room);
    clearChoiceInput(room);
    clearTextInput(room);
    clearVotingData(room);
    clearDisplayedPlayerAnswers(room);
  }

  function quitRoomToLobby(room) {
    enterLobbyPhase(room);
    for (const player of room.players.values()) {
      player.active = false;
      player.kickedFromGame = true;
      player.lastSeen = Date.now();
    }
    room.vipPlayerId = "";
    room.startToken = "";
    broadcastLobby(room);
  }

  function enterIntroPhase(room) {
    enterGamePhase(room, "intro");
  }

  function enterGamePhase(room, phase) {
    clearCountdownTimer(room);
    clearActionTimer(room);
    const previousPhase = room.phase;
    if (previousPhase === "lobby" || previousPhase === "starting") {
      const nextSessionKey = activePlayers(room).map((player) => player.id).sort().join("|");
      if (nextSessionKey && nextSessionKey === room.playerSessionKey) {
        room.numSequentialGames = Number(room.numSequentialGames || 0) + 1;
      } else {
        room.playerSessionKey = nextSessionKey;
        room.numSequentialGames = 0;
      }
    }
    room.phase = phase;
    room.countdownStartedAt = 0;
    room.countdownEndsAt = 0;
    const entryActionIndex = entryActionIndexForPhase(room, phase);
    room.actionIndex = entryActionIndex === -1
      ? getStateActions(phase, room).length
      : Math.max(0, entryActionIndex);
    room.presentedAction = null;
    room.lastDecisionTrace = null;
    clearAppliedActionEffects(room);
    room.playersShown = true;
    room.playerAnswersShown = true;
    room.playerAnswersVisibleFilter = "all";
    room.pendingPointPopups = [];
    resetCraftingTimer(room);
    clearChoiceInput(room);
    clearTextInput(room);
    clearVotingData(room);
    clearDisplayedPlayerAnswers(room);
    room.playerAnswerRecords = {};
    room.playerAnswerGroups = { correct: [], wrong: [], all: [] };
    if (isRoundIntroStateId(phase) && previousPhase !== phase) {
      if (room.hasEnteredRoundIntro) {
        room.currentRound += 1;
      } else {
        room.currentRound = 1;
        room.hasEnteredRoundIntro = true;
      }
    }
    if (entryActionIndex === -2) {
      advanceRoomFromMomentReturn(room);
      return;
    }
    broadcastLobby(room);
  }

  return { advanceRoomFromMomentReturn, enterGamePhase, enterIntroPhase, enterLobbyPhase, quitRoomToLobby };
}

module.exports = { createRoomPhaseRuntime };
