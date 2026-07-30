"use strict";

const { createFlowActionRegistry } = require("../shared/flow-action-registry");
const { applyDynamicGameStateCode } = require("./dynamic-game-state-runtime");

function resolveStoredAnswerRound(room, roundSpec) {
  if (!roundSpec || roundSpec === "current") return room.currentRound || 1;
  const n = Number(roundSpec);
  if (Number.isFinite(n) && n > 0) return n;
  const fromVar = room.flowVariables?.[String(roundSpec)];
  if (fromVar != null) {
    const v = Number(fromVar);
    return v > 0 ? v : room.currentRound || 1;
  }
  return room.currentRound || 1;
}

function createRoomActionEffectsRuntime({
  activePlayers,
  clearDisplayedCorrectnessForPlayers,
  endGameMoment,
  filteredPlayerIds,
  gameConstants,
  hasAppliedActionEffect,
  markAppliedActionEffect,
  markDisplayedAnswersCorrectness,
  normalizePlayerFilter,
  prepareVotingCards,
  resetGameSessionState: resetGameSessionStateImpl,
  revealAuthors,
  revealVotes,
  revealWinningAnswer,
  revealVotingResults,
  seedDisplayedPlayerAnswers,
  setCraftingTimerShown,
  setVotingCardsShown,
  startCraftingTimer,
  storeRandomTriviaPrompt,
  pluginActionDefinitions = [],
  executeGameAction = () => false,
  broadcastLobby = () => {},
  clearTimeoutImpl = clearTimeout,
  setTimeoutImpl = setTimeout
}) {
  function scheduledExecutionIds(room) {
    if (!(room.scheduledSubActionExecutionIds instanceof Set)) {
      room.scheduledSubActionExecutionIds = new Set(room.scheduledSubActionExecutionIds || []);
    }
    return room.scheduledSubActionExecutionIds;
  }

  function scheduledTimerIds(room) {
    if (!(room.scheduledSubActionTimerIds instanceof Set)) {
      room.scheduledSubActionTimerIds = new Set();
    }
    return room.scheduledSubActionTimerIds;
  }

  function clearScheduledSubActions(room) {
    for (const timerId of scheduledTimerIds(room)) clearTimeoutImpl(timerId);
    room.scheduledSubActionTimerIds = new Set();
    room.scheduledSubActionExecutionIds = new Set();
    room.actionExecutionSignature = "";
  }

  function resetGameSessionState(room) {
    clearScheduledSubActions(room);
    resetGameSessionStateImpl(room);
  }

  const actionRegistry = createFlowActionRegistry({
    activePlayers,
    clearDisplayedCorrectnessForPlayers,
    endGameMoment,
    filteredPlayerIds,
    gameConstants,
    markDisplayedAnswersCorrectness,
    normalizePlayerFilter,
    prepareVotingCards,
    resetGameSessionState,
    resolveStoredAnswerRound,
    revealAuthors,
    revealVotes,
    revealWinningAnswer,
    revealVotingResults,
    seedDisplayedPlayerAnswers,
    setCraftingTimerShown,
    setVotingCardsShown,
    startCraftingTimer,
    storeRandomTriviaPrompt,
    applyDynamicGameStateCode,
    executeGameAction
  }, pluginActionDefinitions);

  function applyRoomActionEffects(room, action) {
    if (room.runtimeFault || !action || hasAppliedActionEffect(room, action.id)) return;
    markAppliedActionEffect(room, action.id);
    actionRegistry.applyRoomEffect(room, action);
  }

  function scheduleRoomSubActions(room, action, actionExecutionId) {
    if (room.runtimeFault || !action || !Array.isArray(action.subActions) || action.subActions.length === 0) return;
    const gameSessionId = Number(room.gameSessionId || 0);
    const executionKey = `${gameSessionId}:${Number(actionExecutionId || 0)}:${String(action.id || "")}`;
    const executions = scheduledExecutionIds(room);
    if (executions.has(executionKey)) return;
    executions.add(executionKey);

    const applyScheduledEffect = (subAction, shouldBroadcast) => {
      if (Number(room.gameSessionId || 0) !== gameSessionId || room.runtimeFault) return;
      const applied = actionRegistry.applyRoomEffect(room, subAction);
      if (applied && shouldBroadcast) broadcastLobby(room);
    };

    for (const subAction of action.subActions) {
      const delayMs = Math.max(0, Number(subAction?.timing?.seconds || 0) * 1000);
      if (delayMs === 0) {
        applyScheduledEffect(subAction, false);
        continue;
      }
      let timerId;
      timerId = setTimeoutImpl(() => {
        scheduledTimerIds(room).delete(timerId);
        applyScheduledEffect(subAction, true);
      }, delayMs);
      scheduledTimerIds(room).add(timerId);
    }
  }

  return {
    applyRoomActionEffects,
    clearScheduledSubActions,
    scheduleRoomSubActions
  };
}

module.exports = { createRoomActionEffectsRuntime };
