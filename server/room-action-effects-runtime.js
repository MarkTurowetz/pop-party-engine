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
  filteredPlayerIds,
  gameConstants,
  hasAppliedActionEffect,
  markAppliedActionEffect,
  markDisplayedAnswersCorrectness,
  normalizePlayerFilter,
  prepareVotingCards,
  revealAuthors,
  revealVotes,
  revealWinningAnswer,
  revealVotingResults,
  seedDisplayedPlayerAnswers,
  setCraftingTimerShown,
  setVotingCardsShown,
  startCraftingTimer,
  storeRandomTriviaPrompt
}) {
  const actionRegistry = createFlowActionRegistry({
    activePlayers,
    clearDisplayedCorrectnessForPlayers,
    filteredPlayerIds,
    gameConstants,
    markDisplayedAnswersCorrectness,
    normalizePlayerFilter,
    prepareVotingCards,
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
    applyDynamicGameStateCode
  });

  function applyRoomActionEffects(room, action) {
    if (!action || hasAppliedActionEffect(room, action.id)) return;
    markAppliedActionEffect(room, action.id);
    actionRegistry.applyRoomEffect(room, action);
  }

  return { applyRoomActionEffects };
}

module.exports = { createRoomActionEffectsRuntime };
