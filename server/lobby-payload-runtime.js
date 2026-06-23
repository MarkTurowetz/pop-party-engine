function createLobbyPayloadRuntime({
  activePlayers,
  applyRoomActionEffects,
  choiceInputPayload,
  craftingTimerPayload,
  currentRoomAction,
  gameConstants,
  microphoneAccessPayload,
  normalizePlayerFilter,
  publicPlayer,
  resolveRoomActionText,
  runtimeGameFlow,
  selectVip,
  serializeVotingCards,
  textInputPayload
}) {
  function lobbyPayload(room) {
    selectVip(room);
    const shouldExposeAction = room.phase !== "lobby" && room.phase !== "starting"
      || room.lobbyFlowActive === true;
    const currentAction = shouldExposeAction ? resolveRoomActionText(currentRoomAction(room), room) : null;
    applyRoomActionEffects(room, currentAction);
    const input = choiceInputPayload(room, currentAction);
    const textInput = textInputPayload(room, currentAction);
    const microphoneAccess = microphoneAccessPayload(room, currentAction);
    return {
      type: "lobby",
      stageCode: room.stageCode,
      revision: room.revision,
      phase: room.phase,
      lobbyFlowActive: room.lobbyFlowActive === true,
      countdownStartedAt: room.countdownStartedAt,
      countdownEndsAt: room.countdownEndsAt,
      action: currentAction,
      debugAction: debugActionPayload(room, currentAction),
      input,
      textInput,
      microphoneAccess,
      craftingTimer: craftingTimerPayload(room),
      lastDecisionTrace: room.lastDecisionTrace,
      currentRound: room.currentRound || 1,
      gameTitle: gameConstants().gameTitle,
      numSequentialGames: room.numSequentialGames || 0,
      serverNow: Date.now(),
      vipPlayerId: room.vipPlayerId,
      startToken: room.startToken,
      playersShown: room.playersShown !== false,
      playerAnswersShown: room.playerAnswersShown !== false,
      playerAnswersVisibleFilter: normalizePlayerFilter(room.playerAnswersVisibleFilter),
      playerAnswerGroups: room.playerAnswerGroups || { correct: [], wrong: [], all: [] },
      pendingPointPopups: Array.isArray(room.pendingPointPopups) ? room.pendingPointPopups : [],
      wipeShown: room.wipeShown === true,
      votingCards: serializeVotingCards(room),
      votingResultsShown: room.votingResultsShown === true,
      players: activePlayers(room).map((player) => publicPlayer(player, room, currentAction))
    };
  }

  function debugActionPayload(room, currentAction) {
    const state = runtimeGameFlow(room).states.find((item) => item.id === room.phase) || null;
    const players = activePlayers(room);
    let submittedInputCount = 0;
    if (room.votingInputActionId) {
      submittedInputCount = players.filter((player) => room.votingAnswers?.has(player.id)).length;
    } else if (room.textInputActionId) {
      const textInputPlayers = room.textInputMode === "voiceVip"
        ? players.filter((player) => player.id === room.vipPlayerId)
        : players;
      submittedInputCount = textInputPlayers.filter((player) => room.textInputAnswers?.get(player.id)?.done === true).length;
    } else if (room.microphoneAccessActionId) {
      const microphoneAccessPlayers = room.microphoneAccessMode === "all"
        ? players
        : players.filter((player) => player.id === room.vipPlayerId);
      submittedInputCount = microphoneAccessPlayers.filter((player) => room.microphoneAccessAnswers?.get(player.id)?.done === true).length;
    } else if (room.choiceInputActionId) {
      submittedInputCount = players.filter((player) => room.choiceInputAnswers?.has(player.id)).length;
    }
    return {
      phaseId: room.phase || "",
      phaseName: state?.name || String(room.phase || "lobby").replace(/[-_]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()),
      actionId: currentAction?.id || "",
      actionName: currentAction?.name || "",
      actionType: currentAction?.type || "",
      actionIndex: Number.isFinite(Number(currentAction?.index)) ? Number(currentAction.index) : room.actionIndex,
      requiredInputCount: requiredInputCount(room, players),
      submittedInputCount,
      playerAnswerRecordCount: Object.keys(room.playerAnswerRecords || {}).length,
      storedAnswerRoundCount: Object.keys(room.storedPlayerAnswers || {}).length,
      storedAnswerCurrentRoundCount: Object.keys((room.storedPlayerAnswers || {})[room.currentRound || 1] || {}).length,
      votingCardCount: Array.isArray(room.votingCards) ? room.votingCards.length : 0,
      visibleVotingCardCount: serializeVotingCards(room).length,
      lastPreparedVotingCardCount: Number(room.lastVotingPrepare?.cardCount || 0),
      lastVotingPrepareSkippedCount: Array.isArray(room.lastVotingPrepare?.skipped) ? room.lastVotingPrepare.skipped.length : 0
    };
  }

  function requiredInputCount(room, players) {
    if (room.textInputMode === "voiceVip" && room.textInputActionId) return Math.min(1, players.length);
    if (room.microphoneAccessActionId && room.microphoneAccessMode === "vip") return Math.min(1, players.length);
    return players.length;
  }

  return {
    debugActionPayload,
    lobbyPayload
  };
}

module.exports = { createLobbyPayloadRuntime };
