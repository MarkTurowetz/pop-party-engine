"use strict";

function createPlayerPublicRuntime({ choiceInputPayload }) {
  function publicPlayer(player, room, currentAction = null) {
    const choiceAnswer = room.choiceInputAnswers?.get(player.id) || null;
    const textAnswer = room.textInputAnswers?.get(player.id) || null;
    const displayedAnswer = room.displayedPlayerAnswers?.get(player.id) || null;
    const currentActionId = String(currentAction?.id || "");
    const hasActiveChoiceInput = Boolean(room.choiceInputActionId) && room.choiceInputActionId === currentActionId;
    const hasActiveTextInput = Boolean(room.textInputActionId) && room.textInputActionId === currentActionId;
    const hasActiveMicrophoneAccess = Boolean(room.microphoneAccessActionId) && room.microphoneAccessActionId === currentActionId;
    const hasActivePluginInput = Boolean(room.gamePluginInputActionId) && room.gamePluginInputActionId === currentActionId;
    const answer = hasActiveChoiceInput ? choiceAnswer : hasActiveTextInput ? textAnswer : null;
    const needsChoiceInput = hasActiveChoiceInput && (
      room.choiceInputMode === "continuous" || !choiceAnswer
    );
    const textInputIsForPlayer = room.textInputMode === "voiceVip"
      ? player.id === room.vipPlayerId
      : true;
    const microphoneAccessIsForPlayer = room.microphoneAccessMode === "all"
      ? true
      : player.id === room.vipPlayerId;
    const needsTextInput = hasActiveTextInput && textInputIsForPlayer && textAnswer?.done !== true;
    const needsMicrophoneAccess = hasActiveMicrophoneAccess
      && microphoneAccessIsForPlayer
      && room.microphoneAccessAnswers?.get(player.id)?.done !== true;
    const needsPluginInput = hasActivePluginInput
      && room.gamePluginInputRecipientIds?.has(player.id) === true
      && !room.gamePluginInputSubmissions?.has(player.id);
    const serializeAnswer = (value) => value ? {
      optionIndex: value.optionIndex,
      originalOptionIndex: value.originalOptionIndex,
      text: value.text,
      done: value.done === true,
      invalid: value.invalid === true,
      correct: value.correct === true ? true : value.correct === false ? false : null,
      hidden: room.hiddenPlayerAnswerIds?.has(player.id) === true,
      nonce: value.nonce || 0
    } : null;
    return {
      id: player.id,
      name: player.name,
      active: player.active,
      joinedAt: player.joinedAt,
      points: Number(player.points || 0),
      pendingPoints: Number(player.pendingPoints || 0),
      isVip: player.id === room.vipPlayerId,
      needsInput: player.active === true && (needsChoiceInput || needsTextInput || needsMicrophoneAccess || needsPluginInput),
      input: choiceInputPayload(room, currentAction, player),
      answer: serializeAnswer(answer),
      displayedAnswer: serializeAnswer(displayedAnswer)
    };
  }

  return { publicPlayer };
}

module.exports = { createPlayerPublicRuntime };
