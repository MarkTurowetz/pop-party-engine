function resetGameSessionState(room) {
  room.gameSessionId = Math.max(0, Number(room.gameSessionId || 0)) + 1;
  room.runtimeFault = null;
  room.sessionOutputs = { sessionId: room.gameSessionId, byVisit: {}, latestByState: {} };
  room.activeInputFlowEventKey = "";
  room.pendingFlowEvents = new Set();
  room.flowVariables = {};
  room.triviaPromptText = "";
  room.G = {};
  room.currentRound = 1;
  room.hasEnteredRoundIntro = false;
  room.pendingPointPopups = [];
  room.playerAnswerRecords = {};
  room.playerAnswerGroups = { correct: [], wrong: [], all: [] };
  room.storedPlayerAnswers = {};
  room.hiddenPlayerAnswerIds = new Set();
  room.displayedPlayerAnswers = new Map();
  room.displayedAnswerCorrectness = new Map();
  room.choiceInputActionId = "";
  room.choiceInputVisitId = 0;
  room.choiceInputPrompt = "";
  room.choiceInputOptions = [];
  room.choiceInputOriginalIndexes = [];
  room.choiceInputCorrectAnswerIndex = null;
  room.choiceInputContentId = "";
  room.choiceInputAnswers = new Map();
  room.textInputActionId = "";
  room.textInputVisitId = 0;
  room.textInputPrompt = "";
  room.textInputPlaceholder = "";
  room.textInputCharacterLimit = 0;
  room.textInputAnswers = new Map();
  room.microphoneAccessActionId = "";
  room.microphoneAccessVisitId = 0;
  room.microphoneAccessPrompt = "";
  room.microphoneAccessButtonLabel = "";
  room.microphoneAccessAnswers = new Map();
  room.votingCards = [];
  room.votingCardsShown = false;
  room.votingResultsShown = false;
  room.votingAuthorsRevealed = false;
  room.votingVotesRevealed = false;
  room.votingWinnerRevealed = false;
  room.votingWinners = [];
  room.votingInputActionId = "";
  room.votingInputPrompt = "";
  room.votingAnswers = new Map();
  room.lastVotingSourceStateId = "";
  room.lastVotingSourceRef = null;
  room.lastVotingSourceFallbackUsed = false;
  room.lastVotingPrepare = null;
  room.microphoneAccessGrantedPlayerIds = new Set();
  for (const player of room.players?.values?.() || []) {
    player.points = 0;
    player.pendingPoints = 0;
    // Connected controllers retain their identity into the new session.
    // Players that were already disconnected keep their old session marker,
    // preventing a stale controller from being resurrected in a later game.
    if (player.active) player.gameSessionId = room.gameSessionId;
  }
}

module.exports = { resetGameSessionState };
