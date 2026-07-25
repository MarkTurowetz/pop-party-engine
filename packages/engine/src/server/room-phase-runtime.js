"use strict";

const {
  latestSessionAnswerOutput,
  resolveSessionAnswerOutput,
  storeCurrentMomentAnswers
} = require("./stored-player-answers-runtime");
const { resetGameSessionState } = require("./game-session-reset-runtime");
const { createRuntimeFault } = require("./runtime-fault-runtime");

const VOTING_CARD_ACTION_TYPES = new Set([
  "setVotingCardsShown",
  "voteOnAnswersInput",
  "revealVotingResults",
  "revealAuthors",
  "revealVotes",
  "revealWinningAnswer"
]);

function resolveVotingAnswerSource(room, sourceRef, explicitSourceStateId = "") {
  const output = explicitSourceStateId
    ? latestSessionAnswerOutput(room, explicitSourceStateId)
    : resolveSessionAnswerOutput(room, sourceRef);
  return {
    sourceRef: output
      ? { sessionId: output.sessionId, stateId: output.stateId, visitId: output.visitId }
      : explicitSourceStateId
        ? { sessionId: Number(room.gameSessionId || 0), stateId: explicitSourceStateId, visitId: 0 }
        : { ...sourceRef },
    records: output?.records || {},
    output,
    fallbackUsed: false
  };
}

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
  prepareLobbySession = () => {},
  prepareVotingCards,
  resetCraftingTimer,
  resolveMomentRouteTarget,
  resolveMomentTargetStateId,
  runtimeGameFlow,
}) {
  function advanceRoomFromMomentReturn(room) {
    const state = runtimeGameFlow(room).states.find((item) => item.id === (room.flowStateId || room.phase));
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
    // Each arrival is a new execution, even when a route loops back to the
    // same action node. Keep duplicate callbacks idempotent while that action
    // is active, then allow its effects to run again on the next visit.
    clearAppliedActionEffects(room);
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
    if (room.runtimeFault) return;
    const result = resolveMomentRouteTarget(room, target);
    setRouteTrace(room, target, result);
    if (result?.targetKind === "action") {
      startRouteActionSession(room, target, result);
      return;
    }
    room.routeActionSession = null;
    const targetStateId = result?.stateId || resolveMomentTargetStateId(room, target);
    if (!targetStateId || isNoActionTarget(targetStateId)) {
      clearActionTimer(room);
      createRuntimeFault(room, {
        code: "FLOW_TARGET_INVALID",
        message: `The flow cannot continue from ${room.flowStateId || room.phase} because its next target is missing or invalid.`,
        expected: "A valid authored moment or route node target",
        actual: result?.haltReason || String(target || "No target"),
        sourceRef: { stateId: room.flowStateId || room.phase, target: String(target || "") }
      });
      broadcastLobby(room);
      return;
    }
    if (runtimeGameFlow(room).states.some((item) => item.id === targetStateId)) {
      if (targetStateId === "lobby") {
        enterLobbyPhase(room);
        broadcastLobby(room);
        return;
      }
      enterGamePhase(room, targetStateId);
      return;
    }
    createRuntimeFault(room, {
      code: "FLOW_TARGET_INVALID",
      message: `The flow target ${targetStateId} does not identify an authored moment.`,
      expected: "A valid authored moment",
      actual: targetStateId,
      sourceRef: { stateId: room.flowStateId || room.phase, target: targetStateId }
    });
    broadcastLobby(room);
  }

  function advanceRoomFromRouteAction(room, action) {
    const target = action?.type === "jumpNode"
      ? action?.jumpTargetActionId || action?.nextTargetNodeId || action?.nextTargetActionId || ""
      : action?.nextTargetNodeId || action?.nextTargetActionId || "";
    advanceRoomToMomentGraphTarget(room, target);
  }

  function actionListHasVotingCards(actions = []) {
    return actions.some((action) => (
      VOTING_CARD_ACTION_TYPES.has(action?.type)
      || actionListHasVotingCards(action?.actions || [])
      || actionListHasVotingCards(action?.subActions || [])
    ));
  }

  function isNoActionTarget(target) {
    return !target || target === "none";
  }

  function enterLobbyPhase(room) {
    let sessionContentError = null;
    try {
      prepareLobbySession(room);
    } catch (error) {
      sessionContentError = error;
    }
    clearCountdownTimer(room);
    clearActionTimer(room);
    room.phase = "lobby";
    room.flowStateId = "lobby";
    room.momentVisitId = Number(room.momentVisitId || 0) + 1;
    room.controllerLayoutId = "lobby";
    room.isPaused = false;
    room.pausedAt = 0;
    room.countdownStartedAt = 0;
    room.countdownEndsAt = 0;
    room.countdownRemainingMs = 0;
    room.subroutinePath = [];
    room.subroutineStack = [];
    const entryActionIndex = entryActionIndexForPhase(room, "lobby");
    room.actionIndex = entryActionIndex === -1
      ? getStateActions("lobby", room).length
      : Math.max(0, entryActionIndex);
    room.presentedAction = null;
    room.routeActionSession = null;
    room.lastDecisionTrace = null;
    room.lastRouteDecisionTrace = null;
    room.pendingFlowEvents?.clear?.();
    clearAppliedActionEffects(room);
    room.playersShown = false;
    room.playerAnswersShown = false;
    room.playerAnswersVisibleFilter = "all";
    room.flowVariables = {};
    room.triviaPromptText = "";
    room.G = {};
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
    resetGameSessionState(room);
    room.playerSessionKey = "";
    room.numSequentialGames = 0;
    if (sessionContentError) {
      room.actionIndex = getStateActions("lobby", room).length;
      createRuntimeFault(room, {
        code: String(sessionContentError.code || "AUTHORING_CONTENT_UNAVAILABLE"),
        message: "The new game session could not load the latest saved authoring content.",
        expected: "A complete valid saved authoring snapshot",
        actual: String(sessionContentError.message || sessionContentError)
      });
    }
  }

  function quitRoomToLobby(room) {
    enterLobbyPhase(room);
    room.wipeShown = false;
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

  function endGameMoment(room) {
    room.triviaPromptText = "";
    room.playersShown = false;
    room.playerAnswersShown = false;
    room.playerAnswersVisibleFilter = "all";
    room.pendingPointPopups = [];
    resetCraftingTimer(room);
    clearChoiceInput(room);
    clearMicrophoneAccessInput(room);
    clearTextInput(room);
    clearVotingData(room);
    clearDisplayedPlayerAnswers(room);
  }

  function enterGamePhase(room, phase) {
    if (room.runtimeFault) return false;
    clearCountdownTimer(room);
    clearActionTimer(room);
    const previousPhase = room.phase;
    const previousVisitId = Number(room.momentVisitId || 0);

    // Accepted answers are stored immediately by the submit handler. Retain a
    // final transition snapshot as an idempotent safety net for non-controller
    // answer producers.
    storeCurrentMomentAnswers(room, previousPhase, previousVisitId);

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
    room.flowStateId = phase;
    room.momentVisitId = Number(room.momentVisitId || 0) + 1;
    room.subroutinePath = [];
    room.subroutineStack = [];
    room.controllerLayoutId = phase;
    room.isPaused = false;
    room.pausedAt = 0;
    room.routeActionSession = null;
    room.countdownStartedAt = 0;
    room.countdownEndsAt = 0;
    room.countdownRemainingMs = 0;
    const entryActionIndex = entryActionIndexForPhase(room, phase);
    room.actionIndex = entryActionIndex === -1
      ? getStateActions(phase, room).length
      : Math.max(0, entryActionIndex);
    room.presentedAction = null;
    room.lastDecisionTrace = null;
    room.lastRouteDecisionTrace = null;
    room.pendingFlowEvents?.clear?.();
    clearAppliedActionEffects(room);
    // Legacy flows without an explicit End Moment still get a safe reset here.
    // Authored flows invoke this same idempotent reset from their End Moment
    // action before its stage callback advances to the next state.
    endGameMoment(room);
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
    // Use the explicitly authored source when present; otherwise use the phase
    // immediately before this voting visit. Never fall back to an older moment:
    // a reused voting moment must receive a fresh card set from its current
    // producer instead of silently resurfacing stale answers.
    const enteringState = runtimeGameFlow(room).states.find((s) => s.id === phase);
    const hasVotingCards = actionListHasVotingCards(enteringState?.actions || []);
    const explicitSourceStateId = normalizeFlowId(enteringState?.votingSourceStateId, "");
    if (hasVotingCards) {
      const immediateSourceRef = {
        sessionId: Number(room.gameSessionId || 0),
        stateId: previousPhase,
        visitId: previousVisitId
      };
      const resolvedSource = resolveVotingAnswerSource(room, immediateSourceRef, explicitSourceStateId);
      const sourceRecords = resolvedSource.records || {};
      room.playerAnswerRecords = { ...sourceRecords };
      prepareVotingCards(room);
      room.lastVotingSourceStateId = String(resolvedSource.sourceRef?.stateId || "");
      room.lastVotingSourceRef = resolvedSource.sourceRef;
      room.lastVotingSourceFallbackUsed = false;
      room.playerAnswerRecords = {};
      const cardCount = Array.isArray(room.votingCards) ? room.votingCards.length : 0;
      if (!resolvedSource.output || Object.keys(sourceRecords).length === 0 || cardCount === 0) {
        clearActionTimer(room);
        createRuntimeFault(room, {
          code: "VOTING_SOURCE_INVALID",
          message: `Voting cannot start because ${resolvedSource.sourceRef?.stateId || "the preceding moment"} did not produce any valid answers for this visit.`,
          stateId: phase,
          expected: "At least one valid player answer and one generated voting card",
          actual: `${Object.keys(sourceRecords).length} answer records; ${cardCount} voting cards`,
          sourceRef: resolvedSource.sourceRef
        });
      }
    }

    if (entryActionIndex === -2) {
      advanceRoomFromMomentReturn(room);
      return;
    }
    broadcastLobby(room);
    return !room.runtimeFault;
  }

  return { advanceRoomFromMomentReturn, advanceRoomFromRouteAction, endGameMoment, enterGamePhase, enterIntroPhase, enterLobbyPhase, quitRoomToLobby };
}

module.exports = { createRoomPhaseRuntime, resolveVotingAnswerSource };
