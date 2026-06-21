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
  revealVotingResults,
  seedDisplayedPlayerAnswers,
  setCraftingTimerShown,
  setVotingCardsShown,
  startCraftingTimer,
  storeRandomTriviaPrompt
}) {
  function applyRoomActionEffects(room, action) {
    if (!action || hasAppliedActionEffect(room, action.id)) return;
    markAppliedActionEffect(room, action.id);
    if (action.type === "getRandomMultipleChoiceContent") {
      storeRandomTriviaPrompt(room, action.variableName);
    }
    if (action.type === "prepareVotingCards") {
      prepareVotingCards(room);
    }
    if (action.type === "setVotingCardsShown") {
      setVotingCardsShown(room, action);
    }
    if (action.type === "revealVotingResults") {
      revealVotingResults(room);
    }
    if (action.type === "setPlayersShown") {
      room.playersShown = action.isShown !== false;
    }
    if (action.type === "setPlayerAnswersShown") {
      const shouldShow = action.isShown !== false;
      const filter = normalizePlayerFilter(action.playerFilter);
      const targetPlayerIds = shouldShow && filter === "all"
        ? activePlayers(room).map((player) => player.id)
        : filteredPlayerIds(room, filter);
      if (shouldShow) seedDisplayedPlayerAnswers(room, targetPlayerIds);
      room.playerAnswersVisibleFilter = filter;
      room.hiddenPlayerAnswerIds = room.hiddenPlayerAnswerIds instanceof Set ? room.hiddenPlayerAnswerIds : new Set();
      if (filter === "all") {
        room.playerAnswersShown = shouldShow;
        if (shouldShow) room.hiddenPlayerAnswerIds.clear();
        else {
          clearDisplayedCorrectnessForPlayers(room, targetPlayerIds);
          for (const playerId of targetPlayerIds) room.hiddenPlayerAnswerIds.add(playerId);
        }
      } else {
        room.playerAnswersShown = true;
        if (!shouldShow) clearDisplayedCorrectnessForPlayers(room, targetPlayerIds);
        for (const playerId of targetPlayerIds) {
          if (shouldShow) room.hiddenPlayerAnswerIds.delete(playerId);
          else room.hiddenPlayerAnswerIds.add(playerId);
        }
      }
    }
    if (action.type === "revealPlayerAnswerCorrectness") {
      markDisplayedAnswersCorrectness(room);
    }
    if (action.type === "showPoints") {
      const playerIds = filteredPlayerIds(room, action.playerFilter);
      const points = Number(action.points || 0) > 0 ? Number(action.points) : gameConstants().pointsForCorrectAnswer;
      room.pendingPointPopupNonce = Number(room.pendingPointPopupNonce || 0) + 1;
      const nonce = room.pendingPointPopupNonce;
      room.pendingPointPopups = playerIds.map((playerId, index) => {
        const player = room.players.get(playerId);
        if (player) player.pendingPoints = Number(player.pendingPoints || 0) + points;
        return { id: `${nonce}-${playerId}`, nonce, playerId, points, index, createdAt: Date.now() };
      });
    }
    if (action.type === "givePendingPoints") {
      for (const player of room.players.values()) {
        const pending = Number(player.pendingPoints || 0);
        if (pending > 0) {
          player.points = Number(player.points || 0) + pending;
          player.pendingPoints = 0;
        }
      }
    }
    if (action.type === "setTimerShown") {
      setCraftingTimerShown(room, action.isShown !== false);
    }
    if (action.type === "startCraftingTimer") {
      startCraftingTimer(room, action);
    }
  }

  return { applyRoomActionEffects };
}

module.exports = { createRoomActionEffectsRuntime };
