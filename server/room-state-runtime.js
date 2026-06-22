function createDefaultRoom(stageCode) {
  return {
    stageCode,
    stageClients: new Set(),
    players: new Map(),
    vipPlayerId: "",
    startToken: "",
    phase: "lobby",
    countdownStartedAt: 0,
    countdownEndsAt: 0,
    countdownTimerId: null,
    actionTimerId: null,
    actionCompletionPendingId: "",
    appliedActionEffectId: "",
    appliedActionEffectIds: new Set(),
    actionIndex: 0,
    presentedAction: null,
    playersShown: true,
    playerAnswersShown: true,
    hiddenPlayerAnswerIds: new Set(),
    currentRound: 1,
    flowVariables: {},
    playerAnswerRecords: {},
    playerAnswerGroups: { correct: [], wrong: [], all: [] },
    storedPlayerAnswers: {},
    pendingPointPopups: [],
    pendingPointPopupNonce: 0,
    wipeShown: false,
    playerSessionKey: "",
    numSequentialGames: 0,
    hasEnteredRoundIntro: false,
    choiceInputActionId: "",
    choiceInputPrompt: "",
    choiceInputOptions: [],
    choiceInputOriginalIndexes: [],
    choiceInputCorrectAnswerIndex: null,
    choiceInputKind: "multipleChoice",
    choiceInputContentId: "",
    choiceInputMode: "singleSelect",
    choiceInputLocked: false,
    choiceInputAnswers: new Map(),
    displayedPlayerAnswers: new Map(),
    displayedAnswerCorrectness: new Map(),
    textInputActionId: "",
    textInputPrompt: "",
    textInputPlaceholder: "",
    textInputCharacterLimit: 0,
    textInputAnswers: new Map(),
    votingCards: [],
    votingCardsShown: false,
    votingResultsShown: false,
    votingAuthorsRevealed: false,
    votingVotesRevealed: false,
    votingWinnerRevealed: false,
    votingInputActionId: "",
    votingInputPrompt: "",
    votingAnswers: new Map(),
    votingWinners: [],
    lastVotingSourceStateId: "",
    lastVotingSourceFallbackUsed: false,
    craftingTimerShown: false,
    craftingTimerRunning: false,
    craftingTimerDurationMs: 0,
    craftingTimerRemainingMs: 0,
    craftingTimerStartedAt: 0,
    craftingTimerEndsAt: 0,
    craftingTimerActionId: "",
    craftingTimerTimerEndTargetActionId: "",
    craftingTimerAnswersSubmittedTargetActionId: "",
    craftingTimerTimeoutId: null,
    craftingTimerEndHandled: false,
    activeInputFlowEventKey: "",
    answersSubmittedAdvanceTimerId: null,
    lastDecisionTrace: null,
    runtimeFlowOverride: null,
    revision: 0
  };
}

function createRoomStateRuntime({ rooms }) {
  function getRoom(stageCode) {
    if (!rooms.has(stageCode)) {
      rooms.set(stageCode, createDefaultRoom(stageCode));
    }
    return rooms.get(stageCode);
  }

  function getExistingRoom(stageCode) {
    return rooms.get(stageCode) || null;
  }

  return {
    getExistingRoom,
    getRoom
  };
}

module.exports = {
  createDefaultRoom,
  createRoomStateRuntime
};
