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
    room.lastVotingSourceStateId = "";
    room.lastVotingSourceRef = null;
    room.lastVotingSourceFallbackUsed = false;
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

  function avatarSnapshot(avatar) {
    if (!avatar || typeof avatar !== "object") return null;
    return {
      color: avatar.color || "",
      shape: avatar.shape || ""
    };
  }

  function playerSnapshot(player) {
    if (!player || typeof player !== "object") return null;
    const id = String(player.id || "").trim();
    const name = String(player.name || "").trim();
    if (!id && !name) return null;
    return {
      id,
      name,
      avatar: avatarSnapshot(player.avatar)
    };
  }

  function answerAuthorSnapshot(record) {
    if (!record || typeof record !== "object") return null;
    const id = String(record.playerId || record.authorPlayerId || record.authorId || "").trim();
    const name = String(record.playerName || record.authorName || record.name || "").trim();
    const avatar = avatarSnapshot(record.playerAvatar || record.authorAvatar || record.avatar);
    if (!id && !name && !avatar) return null;
    return { id, name, avatar };
  }

  function updateCardAuthorSnapshot(room, card, fallbackRecord = null) {
    if (!card || typeof card !== "object") return card;
    const player = room.players?.get?.(card.authorPlayerId) || null;
    const liveAuthor = playerSnapshot(player);
    const answerAuthor = answerAuthorSnapshot(fallbackRecord);
    const storedAuthor = answerAuthorSnapshot(card);
    const authorId = liveAuthor?.id || storedAuthor?.id || answerAuthor?.id || String(card.authorPlayerId || "").trim();
    const authorName = liveAuthor?.name || storedAuthor?.name || answerAuthor?.name || "";
    const authorAvatar = liveAuthor?.avatar || storedAuthor?.avatar || answerAuthor?.avatar || null;
    card.authorPlayerId = authorId || card.authorPlayerId;
    card.authorName = authorName;
    card.authorAvatar = authorAvatar;
    return card;
  }

  function revealedCardAuthor(room, card) {
    updateCardAuthorSnapshot(room, card);
    return {
      name: String(card.authorName || "").trim(),
      avatar: avatarSnapshot(card.authorAvatar)
    };
  }

  function prepareVotingCards(room) {
    room.votingCardGeneration = Math.max(0, Number(room.votingCardGeneration || 0)) + 1;
    const generation = room.votingCardGeneration;
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
      const card = {
        // A player can author one card per preparation, but a later game must
        // create a new runtime object even when the same players answer again.
        id: `vote-card-${generation}-${player.id}`,
        generation,
        authorPlayerId: player.id,
        text,
        voterIds: [],
        voteCount: 0,
        isWinner: false,
        hidden: false
      };
      items.push(updateCardAuthorSnapshot(room, card, answer));
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

  function scoreVotingCards(room) {
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
    const answerPlayerIds = cards.map((card) => card.authorPlayerId).filter(Boolean);
    const winnerIds = new Set(room.votingWinners);
    room.playerAnswerGroups = {
      all: answerPlayerIds,
      correct: answerPlayerIds.filter((playerId) => winnerIds.has(playerId)),
      wrong: answerPlayerIds.filter((playerId) => !winnerIds.has(playerId))
    };
    return cards;
  }

  function revealVotingResults(room) {
    scoreVotingCards(room);
    room.votingCardsShown = true;
    room.votingResultsShown = true;
  }

  function revealAuthors(room) {
    for (const card of Array.isArray(room.votingCards) ? room.votingCards : []) {
      updateCardAuthorSnapshot(room, card);
    }
    room.votingCardsShown = true;
    room.votingAuthorsRevealed = true;
  }

  function revealVotes(room) {
    scoreVotingCards(room);
    room.votingCardsShown = true;
    room.votingVotesRevealed = true;
  }

  function revealWinningAnswer(room) {
    scoreVotingCards(room);
    room.votingCardsShown = true;
    room.votingWinnerRevealed = true;
    room.votingResultsShown = true;
  }

  function setVotingCardsShown(room, action) {
    const shouldShow = action?.isShown !== false;
    const filter = normalizeVotingCardFilter(action?.cardFilter);
    const cards = filter === "all" ? (Array.isArray(room.votingCards) ? room.votingCards : []) : scoreVotingCards(room);
    if (shouldShow) room.votingCardsShown = true;
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
        const author = revealedCardAuthor(room, card);
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
          generation: Number(card.generation || 0),
          index,
          text: card.text,
          voteCount: votesRevealed ? Number(card.voteCount || 0) : 0,
          isWinner: winnerRevealed && card.isWinner === true,
          isLoser: winnerRevealed && card.isWinner === false && room.votingWinners.length > 0,
          authorsRevealed,
          votesRevealed,
          winnerRevealed,
          resultsShown: room.votingResultsShown === true,
          authorName: author.name,
          authorAvatar: author.avatar,
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
