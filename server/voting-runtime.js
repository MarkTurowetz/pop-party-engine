function createVotingRuntime({
  activePlayers,
  clearAnswersSubmittedAdvanceTimer,
  normalizeVotingCardFilter
}) {
  function clearVotingInput(room) {
    clearAnswersSubmittedAdvanceTimer(room);
    room.votingInputActionId = "";
    room.votingInputPrompt = "";
    if (room.votingAnswers?.clear) {
      room.votingAnswers.clear();
    } else {
      room.votingAnswers = new Map();
    }
  }

  function clearVotingData(room) {
    clearVotingInput(room);
    room.votingCards = [];
    room.votingCardsShown = false;
    room.votingResultsShown = false;
    room.votingAuthorsRevealed = false;
    room.votingVotesRevealed = false;
    room.votingWinnerRevealed = false;
    room.votingWinners = [];
  }

  function answerRecordEntries(records) {
    if (!records) return [];
    if (records instanceof Map) return [...records.entries()];
    if (typeof records === "object") return Object.entries(records);
    return [];
  }

  function answerTextFromRecord(record) {
    if (record == null) return "";
    if (typeof record === "string" || typeof record === "number") return String(record).trim();
    if (typeof record !== "object") return "";
    const candidates = [
      record.text,
      record.answer,
      record.value,
      record.submission,
      record.response,
      record.choiceText,
      record.label
    ];
    for (const candidate of candidates) {
      const text = String(candidate ?? "").trim();
      if (text) return text;
    }
    return "";
  }

  function prepareVotingCards(room) {
    const records = room.playerAnswerRecords || {};
    const answersByPlayerId = new Map();
    for (const [key, record] of answerRecordEntries(records)) {
      answersByPlayerId.set(String(key), record);
      if (record && typeof record === "object" && record.playerId) {
        answersByPlayerId.set(String(record.playerId), record);
      }
    }
    const skipped = [];
    const cards = activePlayers(room).reduce((items, player) => {
      const answer = answersByPlayerId.get(player.id);
      const text = answerTextFromRecord(answer);
      if (!text) {
        skipped.push({ playerId: player.id, reason: answer ? "blank-answer-text" : "missing-answer-record" });
        return items;
      }
      items.push({
        id: `vote-card-${player.id}`,
        authorPlayerId: player.id,
        text,
        voterIds: [],
        voteCount: 0,
        isWinner: false,
        hidden: false
      });
      return items;
    }, []);
    for (let i = cards.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [cards[i], cards[j]] = [cards[j], cards[i]];
    }
    room.votingCards = cards;
    room.votingCardsShown = false;
    room.votingResultsShown = false;
    room.votingWinners = [];
    room.lastVotingPrepare = {
      activePlayerCount: activePlayers(room).length,
      answerRecordCount: answerRecordEntries(records).length,
      cardCount: cards.length,
      skipped,
      preparedAt: Date.now()
    };
    clearVotingInput(room);
  }

  function votingCardByOptionIndex(room, optionIndex) {
    const cards = Array.isArray(room.votingCards) ? room.votingCards : [];
    return cards.filter((card) => card && card.hidden !== true)[optionIndex] || null;
  }

  function revealVotingResults(room) {
    const cards = Array.isArray(room.votingCards) ? room.votingCards : [];
    let highestVotes = -1;
    for (const card of cards) {
      const voters = Array.isArray(card.voterIds) ? card.voterIds : [];
      card.voteCount = voters.length;
      highestVotes = Math.max(highestVotes, card.voteCount);
    }
    for (const card of cards) {
      card.isWinner = highestVotes >= 0 && card.voteCount === highestVotes;
    }
    room.votingWinners = cards.filter((card) => card.isWinner).map((card) => card.authorPlayerId);
    room.votingResultsShown = true;
  }

  function revealAuthors(room) {
    room.votingCardsShown = true;
    room.votingAuthorsRevealed = true;
  }

  function revealVotes(room) {
    const cards = Array.isArray(room.votingCards) ? room.votingCards : [];
    let highestVotes = -1;
    for (const card of cards) {
      card.voteCount = (Array.isArray(card.voterIds) ? card.voterIds : []).length;
      highestVotes = Math.max(highestVotes, card.voteCount);
    }
    room.votingVotesRevealed = true;
  }

  function revealWinningAnswer(room) {
    const cards = Array.isArray(room.votingCards) ? room.votingCards : [];
    let highestVotes = -1;
    for (const card of cards) {
      card.voteCount = (Array.isArray(card.voterIds) ? card.voterIds : []).length;
      highestVotes = Math.max(highestVotes, card.voteCount);
    }
    for (const card of cards) {
      card.isWinner = highestVotes >= 0 && card.voteCount === highestVotes;
    }
    room.votingWinners = cards.filter((card) => card.isWinner).map((card) => card.authorPlayerId);
    room.votingWinnerRevealed = true;
    room.votingResultsShown = true;
  }

  function setVotingCardsShown(room, action) {
    const shouldShow = action?.isShown !== false;
    const filter = normalizeVotingCardFilter(action?.cardFilter);
    const cards = Array.isArray(room.votingCards) ? room.votingCards : [];
    if (shouldShow && filter === "all") room.votingCardsShown = true;
    if (!shouldShow && filter === "all") room.votingCardsShown = false;
    for (const card of cards) {
      if (filter === "winners" && card.isWinner !== true) continue;
      if (filter === "losers" && card.isWinner === true) continue;
      card.hidden = !shouldShow;
    }
  }

  function serializeVotingCards(room) {
    if (room.votingCardsShown === false) return [];
    const votesRevealed = room.votingVotesRevealed === true || room.votingResultsShown === true;
    const authorsRevealed = room.votingAuthorsRevealed === true || room.votingResultsShown === true;
    const winnerRevealed = room.votingWinnerRevealed === true || room.votingResultsShown === true;
    return (room.votingCards || [])
      .filter((card) => card && card.hidden !== true)
      .map((card, index) => {
        const authorPlayer = authorsRevealed ? room.players.get(card.authorPlayerId) : null;
        const voters = votesRevealed
          ? (card.voterIds || [])
              .map((playerId) => {
                const player = room.players.get(playerId);
                return player ? { id: player.id, name: player.name, avatar: player.avatar } : null;
              })
              .filter(Boolean)
              .sort((a, b) => {
                const players = [...(room.players?.values() || [])];
                return players.findIndex((p) => p.id === a.id) - players.findIndex((p) => p.id === b.id);
              })
          : [];
        return {
          id: card.id,
          index,
          text: card.text,
          voteCount: votesRevealed ? Number(card.voteCount || 0) : 0,
          isWinner: winnerRevealed && card.isWinner === true,
          isLoser: winnerRevealed && card.isWinner === false && room.votingWinners.length > 0,
          authorsRevealed,
          votesRevealed,
          winnerRevealed,
          resultsShown: room.votingResultsShown === true,
          authorName: authorPlayer ? authorPlayer.name : "",
          authorAvatar: authorPlayer ? authorPlayer.avatar : null,
          voters
        };
      });
  }

  return {
    answerRecordEntries,
    answerTextFromRecord,
    clearVotingData,
    clearVotingInput,
    prepareVotingCards,
    revealAuthors,
    revealVotes,
    revealWinningAnswer,
    revealVotingResults,
    serializeVotingCards,
    setVotingCardsShown,
    votingCardByOptionIndex
  };
}

module.exports = { createVotingRuntime };
