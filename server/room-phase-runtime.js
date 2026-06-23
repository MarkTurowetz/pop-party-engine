"use strict";

const VOTING_CARD_ACTION_TYPES = new Set([
  "setVotingCardsShown",
  "voteOnAnswersInput",
  "revealVotingResults",
  "revealAuthors",
  "revealVotes",
  "revealWinningAnswer"
]);

function createRoomPhaseRuntime({
  activePlayers,
  broadcastLobby,
  clearActionTimer,
  clearAppliedActionEffects,
  clearChoiceInput,
  clearCountdownTimer,
  clearDisplayedPlayerAnswers,
  clearMicrophoneAccessInput,
  clearPlayerAnswerData,
  clearTextInput,
  clearVotingData,
  clearVotingInput,
  entryActionIndexForPhase,
  getStateActions,
  isRoundIntroStateId,
  normalizeFlowId,
  prepareVotingCards,
  resetCraftingTimer,
  resolveMomentRouteTarget,
  resolveMomentTargetStateId,
  runtimeGameFlow,
}) {
  function advanceRoomFromMomentReturn(room) {
    const state = runtimeGameFlow(room).states.find((item) => item.id === room.phase);
    advanceRoomToMomentGraphTarget(room, state?.nextStateTargetId || "");
  }

  function setRouteTrace(room, selectedTarget, result) {
    if (result?.trace?.some((step) => step.kind === "decision" || step.kind === "action") || result?.haltReason) {
      room.lastRouteDecisionTrace = {
        selectedTarget: selectedTarget || "",
        resolvedStateId: result.stateId || "",
        haltReason: result.haltReason || "",
        trace: result.trace || [],
        evaluatedAt: Date.now()
      };
    }
  }

  function startRouteActionSession(room, target, result) {
    if (!result?.routeNodeId) return false;
    room.routeActionSession = {
      currentNodeId: result.routeNodeId,
      sourcePhase: room.phase,
      selectedTarget: target || "",
      trace: result.trace || [],
      startedAt: Date.now()
    };
    room.presentedAction = null;
    setRouteTrace(room, target, result);
    broadcastLobby(room);
    return true;
  }

  function advanceRoomToMomentGraphTarget(room, target) {
    const result = resolveMomentRouteTarget(room, target);
    setRouteTrace(room, target, result);
    if (result?.targetKind === "action") {
      startRouteActionSession(room, target, result);
      return;
    }
    room.routeActionSession = null;
    const targetStateId = result?.stateId || resolveMomentTargetStateId(room, target);
    if (!targetStateId || isNoActionTarget(targetStateId)) return;
    if (runtimeGameFlow(room).states.some((item) => item.id === targetStateId)) {
      enterGamePhase(room, targetStateId);
    }
  }

  function advanceRoomFromRouteAction(room, action) {
    advanceRoomToMomentGraphTarget(room, action?.nextTargetNodeId || action?.nextTargetActionId || "");
  }

  function actionListHasVotingCards(actions = []) {
    return actions.some((action) => VOTING_CARD_ACTION_TYPES.has(action?.type) || actionListHasVotingCards(action?.subActions || []));
  }

  function storedAnswerRecordsForState(room, round, stateId) {
    if (!stateId) return {};
    return room.storedPlayerAnswers?.[round]?.[stateId] || {};
  }

  function latestStoredAnswerSource(room, round) {
    const roundAnswers = room.storedPlayerAnswers?.[round] || {};
    const entries = Object.entries(roundAnswers).filter(([, records]) => Object.keys(records || {}).length > 0);
    const latest = entries[entries.length - 1] || null;
    return latest ? { stateId: latest[0], records: latest[1] } : null;
  }

  function isNoActionTarget(target) {
    return !target || target === "none";
  }

  function enterLobbyPhase(room) {
    clearCountdownTimer(room);
    clearActionTimer(room);
    room.phase = "lobby";
    room.lobbyFlowActive = false;
    room.countdownStartedAt = 0;
    room.countdownEndsAt = 0;
    room.actionIndex = 0;
    room.presentedAction = null;
    room.routeActionSession = null;
    room.lastDecisionTrace = null;
    room.lastRouteDecisionTrace = null;
    clearAppliedActionEffects(room);
    room.playersShown = true;
    room.playerAnswersShown = true;
    room.playerAnswersVisibleFilter = "all";
    room.flowVariables = {};
    clearPlayerAnswerData(room);
    room.pendingPointPopups = [];
    room.currentRound = 1;
    room.hasEnteredRoundIntro = false;
    resetCraftingTimer(room);
    clearChoiceInput(room);
    clearMicrophoneAccessInput(room);
    clearTextInput(room);
    clearVotingData(room);
    clearDisplayedPlayerAnswers(room);
  }

  function quitRoomToLobby(room) {
    enterLobbyPhase(room);
    for (const player of room.players.values()) {
      player.active = false;
      player.kickedFromGame = true;
      player.lastSeen = Date.now();
    }
    room.vipPlayerId = "";
    room.startToken = "";
    broadcastLobby(room);
  }

  function enterIntroPhase(room) {
    enterGamePhase(room, "intro");
  }

  function enterGamePhase(room, phase) {
    clearCountdownTimer(room);
    clearActionTimer(room);
    const previousPhase = room.phase;

    // Auto-save player answers from the departing moment into the persistent store.
    const answersToSave = room.playerAnswerRecords || {};
    if (previousPhase && previousPhase !== "lobby" && previousPhase !== "starting" && Object.keys(answersToSave).length > 0) {
      room.storedPlayerAnswers = room.storedPlayerAnswers || {};
      const saveRound = room.currentRound || 1;
      room.storedPlayerAnswers[saveRound] = room.storedPlayerAnswers[saveRound] || {};
      room.storedPlayerAnswers[saveRound][previousPhase] = { ...answersToSave };
    }

    if (previousPhase === "lobby" || previousPhase === "starting") {
      const nextSessionKey = activePlayers(room).map((player) => player.id).sort().join("|");
      if (nextSessionKey && nextSessionKey === room.playerSessionKey) {
        room.numSequentialGames = Number(room.numSequentialGames || 0) + 1;
      } else {
        room.playerSessionKey = nextSessionKey;
        room.numSequentialGames = 0;
      }
    }
    room.phase = phase;
    room.routeActionSession = null;
    room.lobbyFlowActive = false;
    room.countdownStartedAt = 0;
    room.countdownEndsAt = 0;
    const entryActionIndex = entryActionIndexForPhase(room, phase);
    room.actionIndex = entryActionIndex === -1
      ? getStateActions(phase, room).length
      : Math.max(0, entryActionIndex);
    room.presentedAction = null;
    room.lastDecisionTrace = null;
    room.lastRouteDecisionTrace = null;
    clearAppliedActionEffects(room);
    room.playersShown = true;
    room.playerAnswersShown = true;
    room.playerAnswersVisibleFilter = "all";
    room.pendingPointPopups = [];
    resetCraftingTimer(room);
    clearChoiceInput(room);
    clearMicrophoneAccessInput(room);
    clearTextInput(room);
    clearVotingData(room);
    clearDisplayedPlayerAnswers(room);
    room.playerAnswerRecords = {};
    room.playerAnswerGroups = { correct: [], wrong: [], all: [] };
    if (isRoundIntroStateId(phase) && previousPhase !== phase) {
      if (room.hasEnteredRoundIntro) {
        room.currentRound += 1;
      } else {
        room.currentRound = 1;
        room.hasEnteredRoundIntro = true;
      }
    }

    // Auto-setup voting cards when entering a phase that displays or uses voting cards.
    // Uses votingSourceStateId if explicitly configured, otherwise falls back to the
    // phase we just left (the common writing-then-voting pattern needs no configuration).
    const enteringState = runtimeGameFlow(room).states.find((s) => s.id === phase);
    const hasVotingCards = actionListHasVotingCards(enteringState?.actions || []);
    const explicitSourceStateId = normalizeFlowId(enteringState?.votingSourceStateId, "");
    const sourceStateId = explicitSourceStateId || (hasVotingCards ? previousPhase : null);
    if (sourceStateId) {
      const loadRound = room.currentRound || 1;
      let resolvedSourceStateId = sourceStateId;
      let sourceRecords = storedAnswerRecordsForState(room, loadRound, resolvedSourceStateId);
      if (!explicitSourceStateId && Object.keys(sourceRecords).length === 0) {
        const latestSource = latestStoredAnswerSource(room, loadRound);
        if (latestSource) {
          resolvedSourceStateId = latestSource.stateId;
          sourceRecords = latestSource.records;
        }
      }
      if (Object.keys(sourceRecords).length > 0) {
        room.playerAnswerRecords = { ...sourceRecords };
        prepareVotingCards(room);
        room.lastVotingSourceStateId = resolvedSourceStateId;
        room.lastVotingSourceFallbackUsed = resolvedSourceStateId !== sourceStateId;
        room.playerAnswerRecords = {};
      }
    }

    if (entryActionIndex === -2) {
      advanceRoomFromMomentReturn(room);
      return;
    }
    broadcastLobby(room);
  }

  return { advanceRoomFromMomentReturn, advanceRoomFromRouteAction, enterGamePhase, enterIntroPhase, enterLobbyPhase, quitRoomToLobby };
}

module.exports = { createRoomPhaseRuntime };
