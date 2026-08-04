"use strict";

const { isChoiceInputAction } = require("../shared/choice-input-action-config");
const { isMicrophoneAccessAction } = require("../shared/microphone-access-action-config");
const { isTextAnswerAction } = require("./text-answer-action-runtime");
const { deletePlayerAnswerRecord, storePlayerAnswerRecord } = require("./stored-player-answers-runtime");
const {
  markPlayerControllerConnected,
  playerIsJoined
} = require("./player-presence-runtime");
const {
  playerIsControllerInputAvailable,
  playerIsControllerInputRecipient
} = require("./input-state-runtime");

function controllerInputStaleError(payload, room, inputVisitId, label) {
  if (payload.gameSessionId !== undefined && Number(payload.gameSessionId) !== Number(room.gameSessionId || 0)) {
    return `${label} belongs to an earlier game`;
  }
  if (payload.inputVisitId !== undefined && Number(payload.inputVisitId) !== Number(inputVisitId || 0)) {
    return `${label} is stale`;
  }
  return "";
}

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
    if (room.runtimeFault) {
      sendJson(res, 423, { ok: false, error: room.runtimeFault.message || "Game is halted by a runtime fault" });
      return true;
    }
    if (!roomIsPaused(room)) return false;
    sendJson(res, 423, { ok: false, error: "Game is paused" });
    return true;
  }

  function resolveTextInputContext(payload) {
    const stageCode = normalizeStageCode(payload.stageCode);
    const playerId = normalizePlayerId(payload.playerId);
    const room = getExistingRoom(stageCode);
    const player = room?.players.get(playerId);
    if (!room || !player || !playerIsJoined(player)) {
      return { status: 404, error: "Player is not in this lobby" };
    }
    markPlayerControllerConnected(player);
    room.controllerInputUnavailablePlayerIds?.delete?.(playerId);
    if (roomIsPaused(room)) {
      return { status: 423, error: "Game is paused" };
    }
    if (room.runtimeFault) {
      return { status: 423, error: room.runtimeFault.message || "Game is halted by a runtime fault" };
    }

    const currentAction = resolveRoomActionText(currentRoomAction(room), room);
    if (!isTextAnswerAction(currentAction)) {
      return { status: 409, error: "No active text input" };
    }
    applyTextInputAction(room, currentAction);
    if (!playerIsControllerInputRecipient(room, playerId)) {
      return { status: 403, error: "Player is not a recipient for this text input" };
    }
    if (room.textInputMode === "voiceVip" && player.id !== room.vipPlayerId) {
      return { status: 403, error: "Only the VIP can submit this voice answer" };
    }
    if (payload.actionId && payload.actionId !== room.textInputActionId) {
      return { status: 409, error: "Text input is stale" };
    }
    const staleError = controllerInputStaleError(payload, room, room.textInputVisitId, "Text input");
    if (staleError) return { status: 409, error: staleError };
    return { room, player, playerId };
  }

  function sendTextInputContextError(res, context) {
    sendJson(res, context.status || 400, { ok: false, error: context.error || "Text input is not available" });
  }

  function storeTextAnswer(room, playerId, submittedText) {
    const answeredAt = Date.now();
    const answer = {
      text: submittedText,
      invalid: false,
      done: true,
      nonce: answeredAt
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
      answeredAt
    };
    storePlayerAnswerRecord(room, playerId, room.playerAnswerRecords[playerId]);
    return answer;
  }

  function finalizeTextInputDrafts(room) {
    if (!room?.textInputActionId || room.textInputMode === "voiceVip") return 0;
    const drafts = room.textInputDrafts instanceof Map ? room.textInputDrafts : new Map();
    let finalizedCount = 0;
    for (const [playerId, draft] of drafts.entries()) {
      const player = room.players?.get?.(playerId);
      if (!playerIsControllerInputAvailable(room, playerId) || room.textInputAnswers?.get?.(playerId)?.done === true) continue;
      const submittedText = cleanSubmittedText(draft?.text, room.textInputCharacterLimit || 240);
      if (!submittedText) continue;
      storeTextAnswer(room, playerId, submittedText);
      finalizedCount += 1;
    }
    if (finalizedCount > 0) updatePlayerAnswerGroups(room);
    return finalizedCount;
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
    if (!room || !player || !playerIsJoined(player)) {
      sendJson(res, 404, { ok: false, error: "Player is not in this lobby" });
      return;
    }
    markPlayerControllerConnected(player);
    room.controllerInputUnavailablePlayerIds?.delete?.(playerId);
    if (rejectIfPaused(room, res)) return;

    const currentAction = resolveRoomActionText(currentRoomAction(room), room);
    if (!isChoiceInputAction(currentAction)) {
      sendJson(res, 409, { ok: false, error: "No active choice input" });
      return;
    }
    applyChoiceInputAction(room, currentAction);
    if (!playerIsControllerInputRecipient(room, playerId)) {
      sendJson(res, 403, { ok: false, error: "Player is not a recipient for this choice input" });
      return;
    }
    if (payload.actionId && payload.actionId !== room.choiceInputActionId) {
      sendJson(res, 409, { ok: false, error: "Choice input is stale" });
      return;
    }
    const staleError = controllerInputStaleError(payload, room, room.choiceInputVisitId, "Choice input");
    if (staleError) {
      sendJson(res, 409, { ok: false, error: staleError });
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
        sendJson(res, 200, { ok: true, lobby: lobbyPayload(room, playerId) });
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
      sendJson(res, 200, { ok: true, lobby: lobbyPayload(room, playerId) });
      return;
    }
    if (room.choiceInputMode === "submitOnce" && existingAnswer?.done) {
      sendJson(res, 200, { ok: true, lobby: lobbyPayload(room, playerId) });
      return;
    }
    if (room.choiceInputMode === "singleSelect" && existingAnswer?.optionIndex === optionIndex) {
      if (room.choiceInputLocked) {
        sendJson(res, 200, { ok: true, lobby: lobbyPayload(room, playerId) });
        return;
      }
      room.choiceInputAnswers.delete(playerId);
      delete room.playerAnswerRecords?.[playerId];
      deletePlayerAnswerRecord(room, playerId);
      forgetDisplayedPlayerAnswer(room, playerId);
      broadcastLobby(room);
      sendJson(res, 200, { ok: true, lobby: lobbyPayload(room, playerId) });
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
    storePlayerAnswerRecord(room, playerId, room.playerAnswerRecords[playerId]);
    updatePlayerAnswerGroups(room);

    broadcastLobby(room);
    if (allActivePlayersHaveSubmittedInput(room)) {
      scheduleAnswersSubmittedAdvance(room);
    }
    sendJson(res, 200, { ok: true, lobby: lobbyPayload(room, playerId) });
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
    if (!room || !player || !playerIsJoined(player)) {
      sendJson(res, 404, { ok: false, error: "Player is not in this lobby" });
      return;
    }
    markPlayerControllerConnected(player);
    room.controllerInputUnavailablePlayerIds?.delete?.(playerId);
    if (rejectIfPaused(room, res)) return;

    const currentAction = resolveRoomActionText(currentRoomAction(room), room);
    if (!isMicrophoneAccessAction(currentAction)) {
      sendJson(res, 409, { ok: false, error: "No active microphone access input" });
      return;
    }
    applyMicrophoneAccessAction(room, currentAction);
    if (!playerIsControllerInputRecipient(room, playerId)) {
      sendJson(res, 403, { ok: false, error: "Player is not a recipient for this microphone input" });
      return;
    }
    if (payload.actionId && payload.actionId !== room.microphoneAccessActionId) {
      sendJson(res, 409, { ok: false, error: "Microphone access input is stale" });
      return;
    }
    const staleError = controllerInputStaleError(payload, room, room.microphoneAccessVisitId, "Microphone access input");
    if (staleError) {
      sendJson(res, 409, { ok: false, error: staleError });
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
    sendJson(res, 200, { ok: true, lobby: lobbyPayload(room, playerId) });
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
    if (payload.draft === true) {
      room.textInputDrafts = room.textInputDrafts instanceof Map ? room.textInputDrafts : new Map();
      const requestedSequence = Number(payload.draftSequence || 0);
      const draftSequence = Number.isFinite(requestedSequence) ? Math.max(0, requestedSequence) : 0;
      const existingDraft = room.textInputDrafts.get(playerId);
      if (!existingDraft || draftSequence >= Number(existingDraft.sequence || 0)) {
        room.textInputDrafts.set(playerId, {
          actionId: room.textInputActionId,
          visitId: room.textInputVisitId,
          sequence: draftSequence,
          text: submittedText,
          updatedAt: Date.now()
        });
      }
      sendJson(res, 200, { ok: true, draft: true });
      return;
    }

    room.textInputDrafts?.delete?.(playerId);
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
      sendJson(res, 200, { ok: true, valid: false, lobby: lobbyPayload(room, playerId) });
      return;
    }

    storeTextAnswer(room, playerId, submittedText);
    updatePlayerAnswerGroups(room);
    broadcastLobby(room);
    if (allActivePlayersHaveSubmittedInput(room)) {
      scheduleAnswersSubmittedAdvance(room);
    }
    sendJson(res, 200, { ok: true, valid: true, lobby: lobbyPayload(room, playerId) });
  }

  return {
    finalizeTextInputDrafts,
    handleControllerChoice,
    handleControllerMicrophoneAccess,
    handleControllerTextSubmit
  };
}

module.exports = { controllerInputStaleError, createControllerSubmitHandlersRuntime };
