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
    if (action.type === "revealAuthors") {
      revealAuthors(room);
    }
    if (action.type === "revealVotes") {
      revealVotes(room);
    }
    if (action.type === "revealWinningAnswer") {
      revealWinningAnswer(room);
    }
    if (action.type === "setupGame") {
      for (const player of room.players.values()) {
        player.points = 0;
        player.pendingPoints = 0;
      }
      room.currentRound = 0;
      room.flowVariables = {};
      room.pendingPointPopups = [];
      room.pendingPointPopupNonce = 0;
      room.playerAnswerRecords = {};
      room.playerAnswerGroups = { correct: [], wrong: [], all: [] };
      room.storedPlayerAnswers = {};
      room.votingCards = [];
      room.votingCardsShown = false;
      room.votingResultsShown = false;
      room.votingAuthorsRevealed = false;
      room.votingVotesRevealed = false;
      room.votingWinnerRevealed = false;
      room.votingWinners = [];
      room.playersShown = false;
      room.playerAnswersShown = false;
      room.hiddenPlayerAnswerIds = new Set();
      room.displayedPlayerAnswers = new Map();
      room.displayedAnswerCorrectness = new Map();
    }
    if (action.type === "getPlayerAnswers") {
      const inputId = String(action.inputId || "input").trim() || "input";
      const round = resolveStoredAnswerRound(room, action.round);
      const varName = String(action.variableName || "playerAnswers").trim() || "playerAnswers";
      const records = room.storedPlayerAnswers?.[round]?.[inputId] || {};
      room.flowVariables = room.flowVariables || {};
      room.flowVariables[varName] = Object.entries(records).map(([playerId, rec]) => ({
        playerId,
        ...(rec && typeof rec === "object" ? rec : { text: String(rec || "") })
      }));
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
