function createPlayerAnswersRuntime({ activePlayers, normalizePlayerFilter }) {
  function displayedPlayerAnswers(room) {
    if (!room.displayedPlayerAnswers || typeof room.displayedPlayerAnswers.get !== "function") {
      room.displayedPlayerAnswers = new Map();
    }
    return room.displayedPlayerAnswers;
  }

  function displayedAnswerCorrectness(room) {
    if (!room.displayedAnswerCorrectness || typeof room.displayedAnswerCorrectness.get !== "function") {
      room.displayedAnswerCorrectness = new Map();
    }
    return room.displayedAnswerCorrectness;
  }

  function rememberDisplayedPlayerAnswer(room, playerId, answer) {
    if (!playerId || !answer || !answer.text) return;
    const correctness = displayedAnswerCorrectness(room).get(playerId);
    displayedPlayerAnswers(room).set(playerId, {
      optionIndex: answer.optionIndex,
      originalOptionIndex: answer.originalOptionIndex,
      text: answer.text,
      done: answer.done === true,
      invalid: answer.invalid === true,
      correct: correctness === true ? true : correctness === false ? false : null,
      nonce: answer.nonce || Date.now()
    });
    if (correctness === true || correctness === false) displayedAnswerCorrectness(room).set(playerId, correctness);
  }

  function storedPlayerAnswer(room, playerId) {
    const liveAnswer = room.choiceInputAnswers?.get(playerId) || room.textInputAnswers?.get(playerId) || null;
    if (liveAnswer) return liveAnswer;
    const record = room.playerAnswerRecords?.[playerId] || null;
    return record?.text ? {
      optionIndex: record.optionIndex,
      originalOptionIndex: record.originalOptionIndex,
      text: record.text,
      done: true,
      correct: record.correct === true ? true : record.correct === false ? false : null,
      nonce: record.answeredAt || Date.now()
    } : null;
  }

  function seedDisplayedPlayerAnswers(room, playerIds = []) {
    const ids = Array.isArray(playerIds) && playerIds.length ? playerIds : activePlayers(room).map((player) => player.id);
    for (const playerId of ids) {
      const answer = storedPlayerAnswer(room, playerId);
      if (answer?.text) rememberDisplayedPlayerAnswer(room, playerId, answer);
    }
    updatePlayerAnswerGroups(room);
  }

  function forgetDisplayedPlayerAnswer(room, playerId) {
    if (!playerId) return;
    displayedPlayerAnswers(room).delete(playerId);
    displayedAnswerCorrectness(room).delete(playerId);
  }

  function clearDisplayedPlayerAnswers(room) {
    displayedPlayerAnswers(room).clear();
    displayedAnswerCorrectness(room).clear();
    if (room.hiddenPlayerAnswerIds?.clear) room.hiddenPlayerAnswerIds.clear();
    else room.hiddenPlayerAnswerIds = new Set();
    room.playerAnswerGroups = { correct: [], wrong: [], all: [] };
  }

  function clearPlayerAnswerData(room) {
    room.playerAnswerRecords = {};
    room.playerAnswerGroups = { correct: [], wrong: [], all: [] };
    displayedAnswerCorrectness(room).clear();
  }

  function clearDisplayedCorrectnessForPlayers(room, playerIds) {
    const correctness = displayedAnswerCorrectness(room);
    const displayedAnswers = displayedPlayerAnswers(room);
    for (const playerId of playerIds || []) {
      correctness.delete(playerId);
      const displayed = displayedAnswers.get(playerId);
      if (displayed) {
        displayed.correct = null;
      }
    }
  }

  function updatePlayerAnswerGroups(room) {
    const records = room.playerAnswerRecords || {};
    const all = [...new Set([...Object.keys(records), ...displayedPlayerAnswers(room).keys()])];
    room.playerAnswerGroups = {
      all,
      correct: all.filter((playerId) => records[playerId]?.correct === true),
      wrong: all.filter((playerId) => records[playerId]?.correct === false)
    };
  }

  function filteredPlayerIds(room, filter = "all") {
    updatePlayerAnswerGroups(room);
    const normalized = normalizePlayerFilter(filter);
    if (normalized === "votingWinner") return [...(room.votingWinners || [])];
    if (normalized === "votingLosers") {
      const winners = new Set(room.votingWinners || []);
      return activePlayers(room).map((player) => player.id).filter((playerId) => !winners.has(playerId));
    }
    return [...(room.playerAnswerGroups?.[normalized] || room.playerAnswerGroups?.all || [])];
  }

  function markDisplayedAnswersCorrectness(room) {
    const records = room.playerAnswerRecords || {};
    for (const [playerId, record] of Object.entries(records)) {
      if (record.correct === true || record.correct === false) {
        displayedAnswerCorrectness(room).set(playerId, record.correct);
        const displayed = displayedPlayerAnswers(room).get(playerId);
        if (displayed) {
          displayed.correct = record.correct;
        }
      }
    }
  }

  return {
    clearDisplayedCorrectnessForPlayers,
    clearDisplayedPlayerAnswers,
    clearPlayerAnswerData,
    displayedAnswerCorrectness,
    displayedPlayerAnswers,
    filteredPlayerIds,
    forgetDisplayedPlayerAnswer,
    markDisplayedAnswersCorrectness,
    rememberDisplayedPlayerAnswer,
    seedDisplayedPlayerAnswers,
    storedPlayerAnswer,
    updatePlayerAnswerGroups
  };
}

module.exports = { createPlayerAnswersRuntime };
