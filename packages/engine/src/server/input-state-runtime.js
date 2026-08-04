"use strict";

const { playerControllerIsConnected } = require("./player-presence-runtime");

function setControllerInputRecipients(room, players) {
  room.controllerInputRecipientIds = new Set((players || []).map((player) => String(player.id || "")).filter(Boolean));
  room.controllerInputUnavailablePlayerIds = new Set(
    (players || []).filter((player) => !playerControllerIsConnected(player)).map((player) => String(player.id || ""))
  );
}

function clearControllerInputRecipients(room) {
  room.controllerInputRecipientIds = new Set();
  room.controllerInputUnavailablePlayerIds = new Set();
}

function playerIsControllerInputRecipient(room, playerId) {
  if (!(room.controllerInputRecipientIds instanceof Set)) return true;
  return room.controllerInputRecipientIds.has(String(playerId || ""));
}

function playerIsControllerInputAvailable(room, playerId) {
  const id = String(playerId || "");
  if (!playerIsControllerInputRecipient(room, id)) return false;
  if (room.controllerInputUnavailablePlayerIds?.has?.(id) === true) return false;
  return playerControllerIsConnected(room.players?.get?.(id));
}

function createInputStateRuntime({ joinedPlayers = null, activePlayers = null }) {
  const rosterPlayers = joinedPlayers || activePlayers;
  function clearAnswersSubmittedAdvanceTimer(room) {
    if (room.answersSubmittedAdvanceTimerId) clearTimeout(room.answersSubmittedAdvanceTimerId);
    room.answersSubmittedAdvanceTimerId = null;
    room.answersSubmittedAdvanceStartedAt = 0;
    room.answersSubmittedAdvanceEndsAt = 0;
    room.answersSubmittedAdvanceRemainingMs = 0;
  }

  function clearChoiceInput(room) {
    clearAnswersSubmittedAdvanceTimer(room);
    room.choiceInputActionId = "";
    room.choiceInputVisitId = 0;
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
    clearControllerInputRecipients(room);
  }

  function clearTextInput(room) {
    clearAnswersSubmittedAdvanceTimer(room);
    room.textInputActionId = "";
    room.textInputVisitId = 0;
    room.textInputPrompt = "";
    room.textInputPlaceholder = "";
    room.textInputCharacterLimit = 0;
    room.textInputMode = "textAll";
    if (room.textInputAnswers?.clear) {
      room.textInputAnswers.clear();
    } else {
      room.textInputAnswers = new Map();
    }
    if (room.textInputDrafts?.clear) {
      room.textInputDrafts.clear();
    } else {
      room.textInputDrafts = new Map();
    }
    clearControllerInputRecipients(room);
  }

  function clearMicrophoneAccessInput(room) {
    clearAnswersSubmittedAdvanceTimer(room);
    room.microphoneAccessActionId = "";
    room.microphoneAccessVisitId = 0;
    room.microphoneAccessPrompt = "";
    room.microphoneAccessButtonLabel = "";
    room.microphoneAccessMode = "vip";
    if (room.microphoneAccessAnswers?.clear) {
      room.microphoneAccessAnswers.clear();
    } else {
      room.microphoneAccessAnswers = new Map();
    }
    clearControllerInputRecipients(room);
  }

  function inputRecipientPlayers(room) {
    const ids = room.controllerInputRecipientIds instanceof Set
      ? room.controllerInputRecipientIds
      : new Set((rosterPlayers?.(room) || []).map((player) => player.id));
    return [...ids].map((id) => room.players?.get?.(id)).filter(Boolean);
  }

  function availableInputRecipientPlayers(room) {
    return inputRecipientPlayers(room).filter((player) => playerIsControllerInputAvailable(room, player.id));
  }

  function microphoneAccessPlayers(room, players = availableInputRecipientPlayers(room)) {
    if (room.microphoneAccessMode === "all") return players;
    const vip = players.find((player) => player.id === room.vipPlayerId) || null;
    return vip ? [vip] : [];
  }

  function playerHasMicrophoneAccess(room, playerId) {
    return room.microphoneAccessAnswers?.get(playerId)?.done === true;
  }

  function allInputRecipientsHaveSubmitted(room) {
    const recipients = inputRecipientPlayers(room);
    if (!recipients.length) return false;
    const available = availableInputRecipientPlayers(room);
    if (room.microphoneAccessActionId) {
      const requiredPlayers = microphoneAccessPlayers(room, available);
      return requiredPlayers.every((player) => playerHasMicrophoneAccess(room, player.id));
    }
    if (room.votingInputActionId) {
      return available.every((player) => {
        const eligibleCards = (room.votingCards || []).filter((card) => card && card.authorPlayerId !== player.id);
        return !eligibleCards.length || room.votingAnswers.has(player.id);
      });
    }
    if (room.textInputActionId) {
      if (room.textInputMode === "voiceVip") {
        const vip = available.find((player) => player.id === room.vipPlayerId) || null;
        return !vip || room.textInputAnswers.get(vip.id)?.done === true;
      }
      return available.every((player) => room.textInputAnswers.get(player.id)?.done === true);
    }
    if (room.choiceInputActionId) {
      return available.every((player) => room.choiceInputAnswers.has(player.id));
    }
    return false;
  }

  function playerDisconnected(room, playerId) {
    const id = String(playerId || "");
    if (!playerIsControllerInputRecipient(room, id)) return false;
    if (!(room.controllerInputUnavailablePlayerIds instanceof Set)) room.controllerInputUnavailablePlayerIds = new Set();
    room.controllerInputUnavailablePlayerIds.add(id);
    return allInputRecipientsHaveSubmitted(room);
  }

  function playerReconnected(room, playerId) {
    const id = String(playerId || "");
    if (!playerIsControllerInputRecipient(room, id)) return false;
    room.controllerInputUnavailablePlayerIds?.delete?.(id);
    return true;
  }

  function flowEventTargetForAction(action, eventType) {
    if (!action) return "";
    if (eventType === "timerEnd") return action.timerEndTargetActionId || "";
    if (eventType === "allPlayersSubmitted") return action.answersSubmittedTargetActionId || "";
    if (eventType === "stageClick") return action.stageClickTargetActionId || "";
    if (eventType === "countdownComplete") return action.nextTargetActionId || "";
    if (eventType === "microphoneAccessGranted") return action.microphoneAccessGrantedTargetActionId || "";
    return "";
  }

  function clearActiveInputFlowEvent(room) {
    room.activeInputFlowEventKey = "";
  }

  return {
    allActivePlayersHaveSubmittedInput: allInputRecipientsHaveSubmitted,
    allInputRecipientsHaveSubmitted,
    clearActiveInputFlowEvent,
    clearAnswersSubmittedAdvanceTimer,
    clearChoiceInput,
    clearMicrophoneAccessInput,
    clearTextInput,
    flowEventTargetForAction,
    inputRecipientPlayers,
    playerDisconnected,
    playerReconnected
  };
}

module.exports = {
  clearControllerInputRecipients,
  createInputStateRuntime,
  playerIsControllerInputAvailable,
  playerIsControllerInputRecipient,
  setControllerInputRecipients
};
