const { isTextAnswerAction } = require("./text-answer-action-runtime");

function createControllerSubmitHandlersRuntime({
  allActivePlayersHaveSubmittedInput,
  applyChoiceInputAction,
  applyTextInputAction,
  broadcastLobby,
  cleanSubmittedText,
  currentRoomAction,
  displayedAnswerCorrectness,
  forgetDisplayedPlayerAnswer,
  getExistingRoom,
  lobbyPayload,
  normalizePlayerId,
  normalizeStageCode,
  readJson,
  resolveRoomActionText,
  scheduleAnswersSubmittedAdvance,
  sendJson,
  updatePlayerAnswerGroups
}) {
  async function handleControllerChoice(req, res) {
    let payload;
    try {
      payload = await readJson(req);
    } catch (error) {
      sendJson(res, 400, { ok: false, error: "Invalid JSON payload" });
      return;
    }

    const stageCode = normalizeStageCode(payload.stageCode);
    const playerId = normalizePlayerId(payload.playerId);
    const room = getExistingRoom(stageCode);
    const player = room?.players.get(playerId);
    if (!room || !player || !player.active) {
      sendJson(res, 404, { ok: false, error: "Player is not in this lobby" });
      return;
    }

    const currentAction = resolveRoomActionText(currentRoomAction(room), room);
    if (!currentAction || (currentAction.type !== "multipleChoiceInput" && currentAction.type !== "triviaInput" && currentAction.type !== "voteOnAnswersInput")) {
      sendJson(res, 409, { ok: false, error: "No active choice input" });
      return;
    }
    applyChoiceInputAction(room, currentAction);
    if (payload.actionId && payload.actionId !== room.choiceInputActionId) {
      sendJson(res, 409, { ok: false, error: "Choice input is stale" });
      return;
    }

    const optionIndex = Math.floor(Number(payload.optionIndex));
    if (!Number.isFinite(optionIndex) || optionIndex < 0 || optionIndex >= room.choiceInputOptions.length) {
      if (room.choiceInputKind !== "vote") {
        sendJson(res, 400, { ok: false, error: "Choice option is not valid" });
        return;
      }
    }

    const existingAnswer = room.choiceInputAnswers.get(playerId) || null;
    if (room.choiceInputKind === "vote") {
      const eligibleCards = (room.votingCards || []).filter((card) => card && card.authorPlayerId !== playerId);
      const requestedCardId = String(payload.cardId || "");
      const card = eligibleCards.find((item) => item.id === requestedCardId) || eligibleCards[optionIndex] || null;
      if (!card) {
        sendJson(res, 400, { ok: false, error: "Vote option is not valid" });
        return;
      }
      if (existingAnswer?.done) {
        sendJson(res, 200, { ok: true, lobby: lobbyPayload(room) });
        return;
      }
      const answer = {
        optionIndex,
        cardId: card.id,
        text: card.text,
        answeredAt: Date.now(),
        done: true,
        nonce: Date.now()
      };
      room.choiceInputAnswers.set(playerId, answer);
      room.votingAnswers.set(playerId, answer);
      card.voterIds = Array.isArray(card.voterIds) ? card.voterIds.filter((id) => id !== playerId) : [];
      card.voterIds.push(playerId);
      card.voteCount = card.voterIds.length;
      broadcastLobby(room);
      if (allActivePlayersHaveSubmittedInput(room)) {
        scheduleAnswersSubmittedAdvance(room);
      }
      sendJson(res, 200, { ok: true, lobby: lobbyPayload(room) });
      return;
    }
    if (room.choiceInputMode === "submitOnce" && existingAnswer?.done) {
      sendJson(res, 200, { ok: true, lobby: lobbyPayload(room) });
      return;
    }
    if (room.choiceInputMode === "singleSelect" && existingAnswer?.optionIndex === optionIndex) {
      if (room.choiceInputLocked) {
        sendJson(res, 200, { ok: true, lobby: lobbyPayload(room) });
        return;
      }
      room.choiceInputAnswers.delete(playerId);
      forgetDisplayedPlayerAnswer(room, playerId);
      broadcastLobby(room);
      sendJson(res, 200, { ok: true, lobby: lobbyPayload(room) });
      return;
    }

    const originalOptionIndex = Number(room.choiceInputOriginalIndexes?.[optionIndex] ?? optionIndex);
    const isTrivia = room.choiceInputKind === "trivia";
    const correct = isTrivia && Number.isFinite(Number(room.choiceInputCorrectAnswerIndex))
      ? originalOptionIndex === Number(room.choiceInputCorrectAnswerIndex)
      : null;
    const answer = {
      optionIndex,
      originalOptionIndex,
      text: room.choiceInputOptions[optionIndex],
      answeredAt: Date.now(),
      done: room.choiceInputMode === "submitOnce",
      correct,
      nonce: Date.now()
    };
    room.choiceInputAnswers.set(playerId, answer);
    displayedAnswerCorrectness(room).delete(playerId);
    room.playerAnswerRecords = room.playerAnswerRecords || {};
    room.playerAnswerRecords[playerId] = {
      playerId,
      actionId: room.choiceInputActionId,
      contentId: room.choiceInputContentId,
      optionIndex,
      originalOptionIndex,
      text: answer.text,
      correct,
      answeredAt: answer.answeredAt
    };
    updatePlayerAnswerGroups(room);

    broadcastLobby(room);
    if (allActivePlayersHaveSubmittedInput(room)) {
      scheduleAnswersSubmittedAdvance(room);
    }
    sendJson(res, 200, { ok: true, lobby: lobbyPayload(room) });
  }

  async function handleControllerTextSubmit(req, res) {
    let payload;
    try {
      payload = await readJson(req);
    } catch (error) {
      sendJson(res, 400, { ok: false, error: "Invalid JSON payload" });
      return;
    }

    const stageCode = normalizeStageCode(payload.stageCode);
    const playerId = normalizePlayerId(payload.playerId);
    const room = getExistingRoom(stageCode);
    const player = room?.players.get(playerId);
    if (!room || !player || !player.active) {
      sendJson(res, 404, { ok: false, error: "Player is not in this lobby" });
      return;
    }

    const currentAction = resolveRoomActionText(currentRoomAction(room), room);
    if (!isTextAnswerAction(currentAction)) {
      sendJson(res, 409, { ok: false, error: "No active text input" });
      return;
    }
    applyTextInputAction(room, currentAction);
    if (room.textInputMode === "voiceVip" && player.id !== room.vipPlayerId) {
      sendJson(res, 403, { ok: false, error: "Only the VIP can submit this voice answer" });
      return;
    }
    if (payload.actionId && payload.actionId !== room.textInputActionId) {
      sendJson(res, 409, { ok: false, error: "Text input is stale" });
      return;
    }

    const submittedText = cleanSubmittedText(payload.text, room.textInputCharacterLimit || 240);
    const isValid = Boolean(submittedText) && !/\d/.test(submittedText);
    if (!isValid) {
      forgetDisplayedPlayerAnswer(room, playerId);
      room.textInputAnswers.set(playerId, {
        text: "",
        invalid: true,
        done: false,
        nonce: Date.now()
      });
      broadcastLobby(room);
      sendJson(res, 200, { ok: true, valid: false, lobby: lobbyPayload(room) });
      return;
    }

    const answer = {
      text: submittedText,
      invalid: false,
      done: true,
      nonce: Date.now()
    };
    room.textInputAnswers.set(playerId, answer);
    room.playerAnswerRecords = room.playerAnswerRecords || {};
    room.playerAnswerRecords[playerId] = {
      playerId,
      actionId: room.textInputActionId,
      contentId: "",
      optionIndex: null,
      originalOptionIndex: null,
      text: answer.text,
      correct: null,
      answeredAt: answer.nonce
    };
    updatePlayerAnswerGroups(room);
    broadcastLobby(room);
    if (allActivePlayersHaveSubmittedInput(room)) {
      scheduleAnswersSubmittedAdvance(room);
    }
    sendJson(res, 200, { ok: true, valid: true, lobby: lobbyPayload(room) });
  }

  return {
    handleControllerChoice,
    handleControllerTextSubmit
  };
}

module.exports = { createControllerSubmitHandlersRuntime };
