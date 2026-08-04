"use strict";

const {
  playerControllerIsConnected,
  removePlayerFromRoom
} = require("./player-presence-runtime");

function resetGameSessionState(room) {
  if (room.gamePluginInputTimeoutId) clearTimeout(room.gamePluginInputTimeoutId);
  room.gameSessionId = Math.max(0, Number(room.gameSessionId || 0)) + 1;
  room.runtimeFault = null;
  room.debugLog = null;
  room.debugLogSequence = 0;
  room.sessionOutputs = { sessionId: room.gameSessionId, byVisit: {}, latestByState: {} };
  room.activeInputFlowEventKey = "";
  room.pendingFlowEvents = new Set();
  room.flowVariables = {};
  room.gamePluginState = {};
  room.gamePluginInputActionId = "";
  room.gamePluginInputType = "";
  room.gamePluginInputVisitId = 0;
  room.gamePluginInputGameSessionId = 0;
  room.gamePluginInputRecipientIds = new Set();
  room.gamePluginInputSubmissions = new Map();
  room.gamePluginInputTimeoutId = null;
  room.controllerInputRecipientIds = new Set();
  room.controllerInputUnavailablePlayerIds = new Set();
  room.triviaPromptText = "";
  room.G = {};
  room.localVariables = {};
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
  room.textInputDrafts = new Map();
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
  for (const player of [...(room.players?.values?.() || [])]) {
    player.points = 0;
    player.pendingPoints = 0;
    // A new game session is the explicit durable eviction boundary: connected
    // controllers retain identity, while unavailable roster entries are removed
    // so the short heartbeat lease never becomes an unbounded zombie store.
    if (playerControllerIsConnected(player)) player.gameSessionId = room.gameSessionId;
    else removePlayerFromRoom(room, player.id, { kicked: true });
  }
}

module.exports = { resetGameSessionState };
