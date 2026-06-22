function createInputStateRuntime({ activePlayers }) {
  function clearAnswersSubmittedAdvanceTimer(room) {
    if (!room.answersSubmittedAdvanceTimerId) return;
    clearTimeout(room.answersSubmittedAdvanceTimerId);
    room.answersSubmittedAdvanceTimerId = null;
  }

  function clearChoiceInput(room) {
    clearAnswersSubmittedAdvanceTimer(room);
    room.choiceInputActionId = "";
    room.choiceInputPrompt = "";
    room.choiceInputOptions = [];
    room.choiceInputOriginalIndexes = [];
    room.choiceInputCorrectAnswerIndex = null;
    room.choiceInputKind = "multipleChoice";
    room.choiceInputContentId = "";
    room.choiceInputMode = "singleSelect";
    room.choiceInputLocked = false;
    if (room.choiceInputAnswers?.clear) {
      room.choiceInputAnswers.clear();
    } else {
      room.choiceInputAnswers = new Map();
    }
  }

  function clearTextInput(room) {
    clearAnswersSubmittedAdvanceTimer(room);
    room.textInputActionId = "";
    room.textInputPrompt = "";
    room.textInputPlaceholder = "";
    room.textInputCharacterLimit = 0;
    if (room.textInputAnswers?.clear) {
      room.textInputAnswers.clear();
    } else {
      room.textInputAnswers = new Map();
    }
  }

  function allActivePlayersHaveSubmittedInput(room) {
    const active = activePlayers(room);
    if (!active.length) return false;
    if (room.votingInputActionId) {
      return active.every((player) => {
        const eligibleCards = (room.votingCards || []).filter((card) => card && card.authorPlayerId !== player.id);
        return !eligibleCards.length || room.votingAnswers.has(player.id);
      });
    }
    if (room.textInputActionId) {
      return active.every((player) => room.textInputAnswers.get(player.id)?.done === true);
    }
    if (room.choiceInputActionId) {
      return active.every((player) => room.choiceInputAnswers.has(player.id));
    }
    return false;
  }

  function flowEventTargetForAction(action, eventType) {
    if (!action) return "";
    // Fall back to nextTargetActionId so flows where only "Next" was wired still work.
    if (eventType === "timerEnd") return action.timerEndTargetActionId || action.nextTargetActionId || "";
    if (eventType === "allPlayersSubmitted") return action.answersSubmittedTargetActionId || action.nextTargetActionId || "";
    if (eventType === "stageClick") return action.stageClickTargetActionId || action.nextTargetActionId || "";
    if (eventType === "countdownComplete") return action.nextTargetActionId || "";
    return "";
  }

  function clearActiveInputFlowEvent(room) {
    room.activeInputFlowEventKey = "";
  }

  return {
    allActivePlayersHaveSubmittedInput,
    clearActiveInputFlowEvent,
    clearAnswersSubmittedAdvanceTimer,
    clearChoiceInput,
    clearTextInput,
    flowEventTargetForAction
  };
}

module.exports = { createInputStateRuntime };
