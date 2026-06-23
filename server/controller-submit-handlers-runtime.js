const { isChoiceInputAction } = require("../shared/choice-input-action-config");
const { isMicrophoneAccessAction } = require("../shared/microphone-access-action-config");
const { isTextAnswerAction } = require("./text-answer-action-runtime");

function createControllerSubmitHandlersRuntime({
  allActivePlayersHaveSubmittedInput,
  applyChoiceInputAction,
  applyMicrophoneAccessAction,
  applyTextInputAction,
  broadcastLobby,
  cleanSubmittedText,
  currentRoomAction,
  displayedAnswerCorrectness,
  emitInputFlowEvent,
  forgetDisplayedPlayerAnswer,
  getExistingRoom,
  lobbyPayload,
  normalizePlayerId,
  normalizeStageCode,
  readJson,
  rememberDisplayedPlayerAnswer,
  resolveRoomActionText,
  roomIsPaused = () => false,
  scheduleAnswersSubmittedAdvance,
  sendJson,
  updatePlayerAnswerGroups
}) {
  function rejectIfPaused(room, res) {
    if (!roomIsPaused(room)) return false;
    sendJson(res, 423, { ok: false, error: "Game is paused" });
    return true;
  }

  function resolveTextInputContext(payload) {
    const stageCode = normalizeStageCode(payload.stageCode);
    const playerId = normalizePlayerId(payload.playerId);
    const room = getExistingRoom(stageCode);
    const player = room?.players.get(playerId);
    if (!room || !player || !player.active) {
      return { status: 404, error: "Player is not in this lobby" };
    }
    if (roomIsPaused(room)) {
      return { status: 423, error: "Game is paused" };
    }

    const currentAction = resolveRoomActionText(currentRoomAction(room), room);
    if (!isTextAnswerAction(currentAction)) {
      return { status: 409, error: "No active text input" };
    }
    applyTextInputAction(room, currentAction);
    if (room.textInputMode === "voiceVip" && player.id !== room.vipPlayerId) {
      return { status: 403, error: "Only the VIP can submit this voice answer" };
    }
    if (payload.actionId && payload.actionId !== room.textInputActionId) {
      return { status: 409, error: "Text input is stale" };
    }
    return { room, player, playerId };
  }

  function sendTextInputContextError(res, context) {
    sendJson(res, context.status || 400, { ok: false, error: context.error || "Text input is not available" });
  }

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
    if (rejectIfPaused(room, res)) return;

    const currentAction = resolveRoomActionText(currentRoomAction(room), room);
    if (!isChoiceInputAction(currentAction)) {
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

  async function handleControllerMicrophoneAccess(req, res) {
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
    if (rejectIfPaused(room, res)) return;

    const currentAction = resolveRoomActionText(currentRoomAction(room), room);
    if (!isMicrophoneAccessAction(currentAction)) {
      sendJson(res, 409, { ok: false, error: "No active microphone access input" });
      return;
    }
    applyMicrophoneAccessAction(room, currentAction);
    if (payload.actionId && payload.actionId !== room.microphoneAccessActionId) {
      sendJson(res, 409, { ok: false, error: "Microphone access input is stale" });
      return;
    }
    if (room.microphoneAccessMode === "vip" && player.id !== room.vipPlayerId) {
      sendJson(res, 403, { ok: false, error: "Only the VIP needs microphone access right now" });
      return;
    }

    room.microphoneAccessAnswers.set(playerId, {
      done: true,
      grantedAt: Date.now(),
      nonce: Date.now()
    });
    if (!room.microphoneAccessGrantedPlayerIds || typeof room.microphoneAccessGrantedPlayerIds.add !== "function") {
      room.microphoneAccessGrantedPlayerIds = new Set();
    }
    room.microphoneAccessGrantedPlayerIds.add(playerId);

    if (allActivePlayersHaveSubmittedInput(room)) {
      emitInputFlowEvent(room, "microphoneAccessGranted");
    } else {
      broadcastLobby(room);
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

    const context = resolveTextInputContext(payload);
    if (!context.room) {
      sendTextInputContextError(res, context);
      return;
    }
    const { room, playerId } = context;

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
    rememberDisplayedPlayerAnswer(room, playerId, answer);
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

  async function handleControllerTextPreview(req, res) {
    let payload;
    try {
      payload = await readJson(req);
    } catch (error) {
      sendJson(res, 400, { ok: false, error: "Invalid JSON payload" });
      return;
    }

    const context = resolveTextInputContext(payload);
    if (!context.room) {
      sendTextInputContextError(res, context);
      return;
    }
    const { room, playerId } = context;
    if (room.textInputAnswers.get(playerId)?.done === true) {
      sendJson(res, 200, { ok: true, lobby: lobbyPayload(room) });
      return;
    }

    const previewText = cleanSubmittedText(payload.text, room.textInputCharacterLimit || 240) || "T";
    const answer = {
      text: previewText,
      invalid: false,
      done: false,
      nonce: Date.now()
    };
    room.textInputAnswers.set(playerId, answer);
    rememberDisplayedPlayerAnswer(room, playerId, answer);
    updatePlayerAnswerGroups(room);
    broadcastLobby(room);
    sendJson(res, 200, { ok: true, preview: true, lobby: lobbyPayload(room) });
  }

  return {
    handleControllerChoice,
    handleControllerMicrophoneAccess,
    handleControllerTextPreview,
    handleControllerTextSubmit
  };
}

module.exports = { createControllerSubmitHandlersRuntime };
