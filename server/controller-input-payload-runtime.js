function createControllerInputPayloadRuntime({
  cleanChoiceOptions,
  clearDisplayedPlayerAnswers,
  clearPlayerAnswerData,
  normalizeCharacterLimit,
  normalizeChoiceInputMode,
  triviaContentForAction
}) {
  function applyChoiceInputAction(room, action) {
    if (!action || (action.type !== "multipleChoiceInput" && action.type !== "triviaInput" && action.type !== "voteOnAnswersInput")) return;
    if (room.choiceInputActionId === action.id) return;
    if (action.type === "voteOnAnswersInput") {
      room.choiceInputActionId = action.id;
      room.choiceInputPrompt = action.prompt || "Vote for your favorite answer";
      room.choiceInputOptions = [];
      room.choiceInputOriginalIndexes = [];
      room.choiceInputCorrectAnswerIndex = null;
      room.choiceInputKind = "vote";
      room.choiceInputContentId = "";
      room.choiceInputMode = "submitOnce";
      room.choiceInputLocked = true;
      room.choiceInputAnswers = new Map();
      room.votingInputActionId = action.id;
      room.votingInputPrompt = room.choiceInputPrompt;
      room.votingAnswers = new Map();
      return;
    }
    clearDisplayedPlayerAnswers(room);
    clearPlayerAnswerData(room);
    const triviaContent = action.type === "triviaInput" ? triviaContentForAction(room, action) : null;
    room.choiceInputActionId = action.id;
    room.choiceInputPrompt = triviaContent?.prompt || action.prompt || "Answer this question by tapping an answer";
    room.choiceInputOptions = triviaContent?.options || cleanChoiceOptions(action.options);
    room.choiceInputOriginalIndexes = triviaContent?.optionOriginalIndexes || room.choiceInputOptions.map((_, index) => index);
    room.choiceInputCorrectAnswerIndex = Number.isFinite(Number(triviaContent?.correctAnswerIndex)) ? Number(triviaContent.correctAnswerIndex) : null;
    room.choiceInputKind = action.type === "triviaInput" ? "trivia" : "multipleChoice";
    room.choiceInputContentId = triviaContent?.id || "";
    room.choiceInputMode = normalizeChoiceInputMode(action.inputMode);
    room.choiceInputLocked = action.locked === true;
    room.choiceInputAnswers = new Map();
  }

  function choiceInputPayload(room, currentAction, player = null) {
    if (!currentAction || (currentAction.type !== "multipleChoiceInput" && currentAction.type !== "triviaInput" && currentAction.type !== "voteOnAnswersInput")) return null;
    applyChoiceInputAction(room, currentAction);
    if (currentAction.type === "voteOnAnswersInput") {
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
    if (!action || action.type !== "textSubmissionInput") return;
    if (room.textInputActionId === action.id) return;
    clearDisplayedPlayerAnswers(room);
    room.textInputActionId = action.id;
    room.textInputPrompt = action.prompt || "Write your answer";
    room.textInputPlaceholder = action.placeholder || "Answer here";
    room.textInputCharacterLimit = normalizeCharacterLimit(action.characterLimit);
    room.textInputAnswers = new Map();
  }

  function textInputPayload(room, currentAction) {
    if (!currentAction || currentAction.type !== "textSubmissionInput") return null;
    applyTextInputAction(room, currentAction);
    return {
      actionId: room.textInputActionId,
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
