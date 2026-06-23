const {
  choiceInputActionConfig,
  isChoiceInputAction
} = require("../shared/choice-input-action-config");
const {
  isTextAnswerAction,
  textAnswerActionConfig,
  textAnswerPayloadTypeForMode
} = require("./text-answer-action-runtime");

function createControllerInputPayloadRuntime({
  cleanChoiceOptions,
  clearDisplayedPlayerAnswers,
  clearPlayerAnswerData,
  normalizeCharacterLimit,
  normalizeChoiceInputMode,
  triviaContentForAction
}) {
  function applyChoiceInputAction(room, action) {
    const config = choiceInputActionConfig(action);
    if (!config) return;
    if (room.choiceInputActionId === action.id) return;
    if (config.kind === "vote") {
      room.choiceInputActionId = action.id;
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
      return;
    }
    clearDisplayedPlayerAnswers(room);
    clearPlayerAnswerData(room);
    const triviaContent = config.kind === "trivia" ? triviaContentForAction(room, action) : null;
    room.choiceInputActionId = action.id;
    room.choiceInputPrompt = triviaContent?.prompt || action.prompt || config.prompt;
    room.choiceInputOptions = triviaContent?.options || cleanChoiceOptions(action.options);
    room.choiceInputOriginalIndexes = triviaContent?.optionOriginalIndexes || room.choiceInputOptions.map((_, index) => index);
    room.choiceInputCorrectAnswerIndex = Number.isFinite(Number(triviaContent?.correctAnswerIndex)) ? Number(triviaContent.correctAnswerIndex) : null;
    room.choiceInputKind = config.kind;
    room.choiceInputContentId = triviaContent?.id || "";
    room.choiceInputMode = normalizeChoiceInputMode(action.inputMode);
    room.choiceInputLocked = action.locked === true;
    room.choiceInputAnswers = new Map();
  }

  function choiceInputPayload(room, currentAction, player = null) {
    if (!isChoiceInputAction(currentAction)) return null;
    applyChoiceInputAction(room, currentAction);
    if (room.choiceInputKind === "vote") {
      const visibleCards = (room.votingCards || []).filter((card) => card && card.authorPlayerId !== player?.id);
      return {
        actionId: room.choiceInputActionId,
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
    room.textInputMode = config.mode;
    room.textInputPrompt = action.prompt || config.prompt;
    room.textInputPlaceholder = action.placeholder || config.placeholder;
    room.textInputCharacterLimit = normalizeCharacterLimit(action.characterLimit);
    room.textInputAnswers = new Map();
  }

  function textInputPayload(room, currentAction) {
    if (!isTextAnswerAction(currentAction)) return null;
    applyTextInputAction(room, currentAction);
    return {
      actionId: room.textInputActionId,
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
    applyTextInputAction,
    choiceInputPayload,
    textInputPayload
  };
}

module.exports = { createControllerInputPayloadRuntime };
