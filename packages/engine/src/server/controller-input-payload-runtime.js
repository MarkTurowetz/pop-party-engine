"use strict";

const {
  choiceInputActionConfig,
  isChoiceInputAction
} = require("../shared/choice-input-action-config");
const {
  isTextAnswerAction,
  textAnswerActionConfig,
  textAnswerPayloadTypeForMode
} = require("./text-answer-action-runtime");
const {
  isMicrophoneAccessAction,
  microphoneAccessActionConfig,
  normalizeMicrophoneAccessMode
} = require("../shared/microphone-access-action-config");
const { playerIsJoined } = require("./player-presence-runtime");
const { setControllerInputRecipients } = require("./input-state-runtime");

function createControllerInputPayloadRuntime({
  cleanChoiceOptions,
  clearDisplayedPlayerAnswers,
  clearPlayerAnswerData,
  joinedPlayers = (room) => Array.from(room.players?.values?.() || []).filter(playerIsJoined),
  normalizeCharacterLimit,
  normalizeChoiceInputMode,
  triviaContentForAction
}) {
  function recipientsForMode(room, mode) {
    const players = joinedPlayers(room);
    if (mode !== "voiceVip" && mode !== "vip") return players;
    return players.filter((player) => player.id === room.vipPlayerId);
  }

  function beginControllerInputVisit(room) {
    room.controllerInputVisitCounter = Math.max(0, Number(room.controllerInputVisitCounter || 0)) + 1;
    return room.controllerInputVisitCounter;
  }

  function applyChoiceInputAction(room, action) {
    const config = choiceInputActionConfig(action);
    if (!config) return;
    if (room.choiceInputActionId === action.id) return;
    if (config.kind === "vote") {
      room.choiceInputActionId = action.id;
      room.choiceInputVisitId = beginControllerInputVisit(room);
      room.choiceInputPrompt = action.prompt || config.prompt;
      room.choiceInputOptions = [];
      room.choiceInputOriginalIndexes = [];
      room.choiceInputCorrectAnswerIndex = null;
      room.choiceInputKind = config.kind;
      room.choiceInputContentId = "";
      room.choiceInputMode = config.inputMode;
      room.choiceInputLocked = config.locked === true;
      room.choiceInputAnswers = new Map();
      room.votingInputActionId = action.id;
      room.votingInputPrompt = room.choiceInputPrompt;
      room.votingAnswers = new Map();
      setControllerInputRecipients(room, recipientsForMode(room, "all"));
      return;
    }
    clearDisplayedPlayerAnswers(room);
    clearPlayerAnswerData(room);
    const triviaContent = config.kind === "trivia" ? triviaContentForAction(room, action) : null;
    room.choiceInputActionId = action.id;
    room.choiceInputVisitId = beginControllerInputVisit(room);
    room.choiceInputPrompt = triviaContent?.prompt || action.prompt || config.prompt;
    room.choiceInputOptions = triviaContent?.options || cleanChoiceOptions(action.options);
    room.choiceInputOriginalIndexes = triviaContent?.optionOriginalIndexes || room.choiceInputOptions.map((_, index) => index);
    room.choiceInputCorrectAnswerIndex = Number.isFinite(Number(triviaContent?.correctAnswerIndex)) ? Number(triviaContent.correctAnswerIndex) : null;
    room.choiceInputKind = config.kind;
    room.choiceInputContentId = triviaContent?.id || "";
    room.choiceInputMode = normalizeChoiceInputMode(action.inputMode);
    room.choiceInputLocked = action.locked === true;
    room.choiceInputAnswers = new Map();
    setControllerInputRecipients(room, recipientsForMode(room, "all"));
  }

  function choiceInputPayload(room, currentAction, player = null) {
    if (!isChoiceInputAction(currentAction)) return null;
    applyChoiceInputAction(room, currentAction);
    if (room.choiceInputKind === "vote") {
      const visibleCards = (room.votingCards || []).filter((card) => card && card.authorPlayerId !== player?.id);
      return {
        actionId: room.choiceInputActionId,
        visitId: Number(room.choiceInputVisitId || 0),
        type: "vote",
        prompt: room.choiceInputPrompt,
        mode: room.choiceInputMode,
        locked: true,
        options: visibleCards.map((card, index) => ({
          index,
          cardId: card.id,
          authorPlayerId: card.authorPlayerId,
          label: card.text,
          text: card.text
        }))
      };
    }
    return {
      actionId: room.choiceInputActionId,
      visitId: Number(room.choiceInputVisitId || 0),
      type: room.choiceInputKind,
      prompt: room.choiceInputPrompt,
      mode: room.choiceInputMode,
      locked: room.choiceInputLocked,
      options: room.choiceInputOptions.map((text, index) => ({
        index,
        label: text,
        text
      }))
    };
  }

  function applyTextInputAction(room, action) {
    if (!isTextAnswerAction(action)) return;
    if (room.textInputActionId === action.id) return;
    const config = textAnswerActionConfig(action);
    clearDisplayedPlayerAnswers(room);
    room.textInputActionId = action.id;
    room.textInputVisitId = beginControllerInputVisit(room);
    room.textInputMode = config.mode;
    room.textInputPrompt = action.prompt || config.prompt;
    room.textInputPlaceholder = action.placeholder || config.placeholder;
    room.textInputCharacterLimit = normalizeCharacterLimit(action.characterLimit);
    room.textInputAnswers = new Map();
    room.textInputDrafts = new Map();
    setControllerInputRecipients(room, recipientsForMode(room, room.textInputMode));
  }

  function applyMicrophoneAccessAction(room, action) {
    if (!isMicrophoneAccessAction(action)) return;
    if (room.microphoneAccessActionId === action.id) return;
    const config = microphoneAccessActionConfig(action);
    room.microphoneAccessActionId = action.id;
    room.microphoneAccessVisitId = beginControllerInputVisit(room);
    room.microphoneAccessPrompt = action.prompt || config.prompt;
    room.microphoneAccessButtonLabel = action.buttonLabel || config.buttonLabel;
    room.microphoneAccessMode = normalizeMicrophoneAccessMode(action.microphoneAccessMode || config.mode);
    room.microphoneAccessAnswers = new Map();
    setControllerInputRecipients(room, recipientsForMode(room, room.microphoneAccessMode));
  }

  function microphoneAccessPayload(room, currentAction) {
    if (!isMicrophoneAccessAction(currentAction)) return null;
    applyMicrophoneAccessAction(room, currentAction);
    const grantedPlayerIds = new Set(room.microphoneAccessAnswers?.keys?.() || []);
    return {
      actionId: room.microphoneAccessActionId,
      visitId: Number(room.microphoneAccessVisitId || 0),
      type: "microphoneAccess",
      mode: room.microphoneAccessMode,
      vipPlayerId: room.microphoneAccessMode === "vip" ? room.vipPlayerId || "" : "",
      prompt: room.microphoneAccessPrompt,
      buttonLabel: room.microphoneAccessButtonLabel,
      grantedPlayerIds: [...grantedPlayerIds]
    };
  }

  function textInputPayload(room, currentAction) {
    if (!isTextAnswerAction(currentAction)) return null;
    applyTextInputAction(room, currentAction);
    return {
      actionId: room.textInputActionId,
      visitId: Number(room.textInputVisitId || 0),
      type: textAnswerPayloadTypeForMode(room.textInputMode),
      mode: room.textInputMode,
      vipPlayerId: room.textInputMode === "voiceVip" ? room.vipPlayerId || "" : "",
      prompt: room.textInputPrompt,
      placeholder: room.textInputPlaceholder,
      characterLimit: room.textInputCharacterLimit
    };
  }

  return {
    applyChoiceInputAction,
    applyMicrophoneAccessAction,
    applyTextInputAction,
    choiceInputPayload,
    microphoneAccessPayload,
    textInputPayload
  };
}

module.exports = { createControllerInputPayloadRuntime };
