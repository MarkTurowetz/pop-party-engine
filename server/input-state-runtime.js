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
    room.textInputMode = "textAll";
    if (room.textInputAnswers?.clear) {
      room.textInputAnswers.clear();
    } else {
      room.textInputAnswers = new Map();
    }
  }

  function clearMicrophoneAccessInput(room) {
    clearAnswersSubmittedAdvanceTimer(room);
    room.microphoneAccessActionId = "";
    room.microphoneAccessPrompt = "";
    room.microphoneAccessButtonLabel = "";
    room.microphoneAccessMode = "vip";
    if (room.microphoneAccessAnswers?.clear) {
      room.microphoneAccessAnswers.clear();
    } else {
      room.microphoneAccessAnswers = new Map();
    }
  }

  function microphoneAccessPlayers(room, players = activePlayers(room)) {
    if (room.microphoneAccessMode === "all") return players;
    const vip = players.find((player) => player.id === room.vipPlayerId) || null;
    return vip ? [vip] : [];
  }

  function allActivePlayersHaveSubmittedInput(room) {
    const active = activePlayers(room);
    if (!active.length) return false;
    if (room.microphoneAccessActionId) {
      const requiredPlayers = microphoneAccessPlayers(room, active);
      return Boolean(requiredPlayers.length) && requiredPlayers.every((player) => room.microphoneAccessAnswers.get(player.id)?.done === true);
    }
    if (room.votingInputActionId) {
      return active.every((player) => {
        const eligibleCards = (room.votingCards || []).filter((card) => card && card.authorPlayerId !== player.id);
        return !eligibleCards.length || room.votingAnswers.has(player.id);
      });
    }
    if (room.textInputActionId) {
      if (room.textInputMode === "voiceVip") {
        const vip = active.find((player) => player.id === room.vipPlayerId) || null;
        return Boolean(vip) && room.textInputAnswers.get(vip.id)?.done === true;
      }
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
    if (eventType === "microphoneAccessGranted") return action.microphoneAccessGrantedTargetActionId || action.nextTargetActionId || "";
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
    clearMicrophoneAccessInput,
    clearTextInput,
    flowEventTargetForAction
  };
}

module.exports = { createInputStateRuntime };
