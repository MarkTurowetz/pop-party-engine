const http = require("http");
const os = require("os");
const path = require("path");
const { createActionCompletionRuntime } = require("./server/action-completion-runtime");
const { createActionEffectStateRuntime } = require("./server/action-effect-state-runtime");
const { readAppVersion } = require("./server/app-version");
const { createControllerInputPayloadRuntime } = require("./server/controller-input-payload-runtime");
const { createControllerSubmitHandlersRuntime } = require("./server/controller-submit-handlers-runtime");
const { createCountdownRuntime } = require("./server/countdown-runtime");
const { createControllerLayoutNormalizationRuntime } = require("./server/controller-layout-normalization-runtime");
const { createControllerLayoutStateRuntime } = require("./server/controller-layout-state-runtime");
const { createArtAssetsRuntime } = require("./server/art-assets-runtime");
const { createCraftingTimerRuntime } = require("./server/crafting-timer-runtime");
const { createDecisionActionNormalizationRuntime } = require("./server/decision-action-normalization-runtime");
const { createDecisionRuntime } = require("./server/decision-runtime");
const { createFlowActionPublicRuntime } = require("./server/flow-action-public-runtime");
const { createFlowNavigationRuntime } = require("./server/flow-navigation-runtime");
const {
  flowStateHasActionType,
  isCraftingStateId,
  isRoundIntroStateId
} = require("./server/flow-state-kind-runtime");
const { createFlowTargetRuntime } = require("./server/flow-target-runtime");
const { createGameConstantsRuntime } = require("./server/game-constants-runtime");
const { createGameFlowMergeRuntime } = require("./server/game-flow-merge-runtime");
const { createGameFlowNormalizationRuntime } = require("./server/game-flow-normalization-runtime");
const { createGithubStorageRuntime } = require("./server/github-storage-runtime");
const { createHostAudioRuntime } = require("./server/host-audio-runtime");
const { contentTypeForFile, readJson, sendJson } = require("./server/http-utils");
const { createInactivePlayerSweepRuntime } = require("./server/inactive-player-sweep-runtime");
const { createInputStateRuntime } = require("./server/input-state-runtime");
const { createLayoutNormalizationRuntime } = require("./server/layout-normalization-runtime");
const { createLayoutSyncRuntime } = require("./server/layout-sync-runtime");
const { createLobbyControlHandlersRuntime } = require("./server/lobby-control-handlers-runtime");
const { createLobbyPayloadRuntime } = require("./server/lobby-payload-runtime");
const { createLocalDraftRuntime } = require("./server/local-draft-runtime");
const { backupJsonFile, mirrorJsonFile, readJsonFile, writeJsonFile } = require("./server/local-json-store");
const { createNetworkUrlsRuntime } = require("./server/network-urls-runtime");
const { createPlayerAnswersRuntime } = require("./server/player-answers-runtime");
const { createPlayerPublicRuntime } = require("./server/player-public-runtime");
const { createPlayerSessionHandlersRuntime } = require("./server/player-session-handlers-runtime");
const { createPlayerStateRuntime } = require("./server/player-state-runtime");
const { createRoomActionEffectsRuntime } = require("./server/room-action-effects-runtime");
const { createRoomBroadcastRuntime } = require("./server/room-broadcast-runtime");
const { createRoomFlowHelpersRuntime } = require("./server/room-flow-helpers-runtime");
const { createRoomPhaseRuntime } = require("./server/room-phase-runtime");
const { createRoomStateRuntime } = require("./server/room-state-runtime");
const { createSaveHandlersRuntime } = require("./server/save-handlers-runtime");
const { createStageActionHandlersRuntime } = require("./server/stage-action-handlers-runtime");
const { createStageEventsRuntime } = require("./server/stage-events-runtime");
const { createStaticFilesRuntime } = require("./server/static-files-runtime");
const { createStartHandlersRuntime } = require("./server/start-handlers-runtime");
const { createStageTestConfigHandlerRuntime } = require("./server/stage-test-config-handler-runtime");
const { createStageLayoutNormalizationRuntime } = require("./server/stage-layout-normalization-runtime");
const { createStageLayoutStateRuntime } = require("./server/stage-layout-state-runtime");
const { createToolDataReadRuntime } = require("./server/tool-data-read-runtime");
const { createToolGithubSourcesRuntime } = require("./server/tool-github-sources-runtime");
const { createToolPersistenceRuntime } = require("./server/tool-persistence-runtime");
const { createToolSourceReadersRuntime } = require("./server/tool-source-readers-runtime");
const { createToolSourceStoresRuntime } = require("./server/tool-source-stores-runtime");
const { createRouterRuntime } = require("./server/router-runtime");
const { createTriviaContentRuntime } = require("./server/trivia-content-runtime");
const {
  cleanChoiceOptions,
  cleanFlowText,
  cleanLayoutSelector,
  cleanLayoutText,
  cleanPlayerName,
  cleanSubmittedText,
  normalizeCharacterLimit,
  normalizeChoiceInputMode,
  normalizeColor,
  normalizeConstantFloat,
  normalizeConstantInteger,
  normalizeConstantString,
  normalizeDurationSeconds,
  normalizeFlowId,
  normalizeFlowVariableName,
  normalizeLayoutNumber,
  normalizePlayerFilter,
  normalizePlayerId,
  normalizeStageCode,
  normalizeVotingCardFilter
} = require("./server/value-normalizers");
const { createVotingRuntime } = require("./server/voting-runtime");
const {
  acceptedArtTypes,
  defaultArtCompositions,
  artAssets,
  artGroups,
  availableFlowActionTypes,
  availableFlowTransitions,
  avatarShapes,
  defaultControllerLayouts,
  defaultGameConstants,
  defaultGameFlow,
  defaultHostAudios,
  defaultPlayerColors,
  defaultStageLayouts,
  multipleChoicePrompts
} = require("./shared/game-data");

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "0.0.0.0";
const ROOT = __dirname;
const INDEX_FILE = path.join(ROOT, "index.html");
const CLIENT_ROOT = path.join(ROOT, "client");
const DEFAULT_GAME_FLOW_FILE = path.join(ROOT, "game-flow.default.json");
const GAME_FLOW_FILE = path.resolve(ROOT, process.env.GAME_FLOW_FILE || "game-flow.json");
const GAME_FLOW_BACKUP_DIR = path.join(ROOT, "game-flow.backups");
const DEFAULT_GAME_CONSTANTS_FILE = path.join(ROOT, "game-constants.default.json");
const GAME_CONSTANTS_FILE = path.resolve(ROOT, process.env.GAME_CONSTANTS_FILE || "game-constants.json");
const GAME_CONSTANTS_BACKUP_DIR = path.join(ROOT, "game-constants.backups");
const DEFAULT_STAGE_LAYOUTS_FILE = path.join(ROOT, "stage-layouts.default.json");
const STAGE_LAYOUTS_FILE = path.resolve(ROOT, process.env.STAGE_LAYOUTS_FILE || "stage-layouts.json");
const STAGE_LAYOUTS_BACKUP_DIR = path.join(ROOT, "stage-layouts.backups");
const DEFAULT_CONTROLLER_LAYOUTS_FILE = path.join(ROOT, "controller-layouts.default.json");
const CONTROLLER_LAYOUTS_FILE = path.resolve(ROOT, process.env.CONTROLLER_LAYOUTS_FILE || "controller-layouts.json");
const CONTROLLER_LAYOUTS_BACKUP_DIR = path.join(ROOT, "controller-layouts.backups");
const DEFAULT_HOST_AUDIOS_FILE = path.join(ROOT, "host-audios.default.json");
const HOST_AUDIOS_FILE = path.resolve(ROOT, process.env.HOST_AUDIOS_FILE || "host-audios.json");
const HOST_AUDIOS_BACKUP_DIR = path.join(ROOT, "host-audios.backups");
const GAME_FLOW_GITHUB_TOKEN = process.env.GAME_FLOW_GITHUB_TOKEN || process.env.GITHUB_TOKEN || "";
const GAME_FLOW_STORAGE = String(process.env.GAME_FLOW_STORAGE || (GAME_FLOW_GITHUB_TOKEN ? "github" : "local")).toLowerCase();
const GAME_FLOW_GITHUB_REPO = process.env.GAME_FLOW_GITHUB_REPO || process.env.GITHUB_REPOSITORY || "MarkTurowetz/pop-party";
const GAME_FLOW_GITHUB_BRANCH = process.env.GAME_FLOW_GITHUB_BRANCH || "game-data";
const GAME_FLOW_GITHUB_BASE_BRANCH = process.env.GAME_FLOW_GITHUB_BASE_BRANCH || "main";
const GAME_FLOW_GITHUB_PATH = process.env.GAME_FLOW_GITHUB_PATH || "game-flow.json";
const GAME_CONSTANTS_GITHUB_PATH = process.env.GAME_CONSTANTS_GITHUB_PATH || "game-constants.json";
const STAGE_LAYOUTS_GITHUB_PATH = process.env.STAGE_LAYOUTS_GITHUB_PATH || "stage-layouts.json";
const CONTROLLER_LAYOUTS_GITHUB_PATH = process.env.CONTROLLER_LAYOUTS_GITHUB_PATH || "controller-layouts.json";
const HOST_AUDIOS_GITHUB_PATH = process.env.HOST_AUDIOS_GITHUB_PATH || "host-audios.json";
const ART_ROOT = path.join(ROOT, "art");
const ART_DEFAULT_DIR = path.join(ART_ROOT, "default");
const ART_CUSTOM_DIR = path.join(ART_ROOT, "custom");
const ART_MANIFEST_FILE = path.join(ART_ROOT, "art-manifest.json");
const CONTROLLER_TIMEOUT_MS = 10000;
const HEARTBEAT_INTERVAL_MS = 25000;
const START_GO_HOLD_MS = 700;
const rooms = new Map();
const localDraftStore = {
  flow: null,
  constants: null,
  layouts: null,
  controllerLayouts: null,
  hostAudios: null
};

const APP_VERSION = readAppVersion(ROOT);

const {
  normalizeGameConstants
} = createGameConstantsRuntime({
  defaultGameConstants,
  defaultPlayerColors,
  normalizeColor,
  normalizeConstantFloat,
  normalizeConstantInteger,
  normalizeConstantString,
  normalizeDurationSeconds
});

const {
  normalizeHostAudios,
  normalizeHostAudioPlayMode,
  normalizeLineIndex,
  resolveHostAudioAction
} = createHostAudioRuntime({
  normalizeFlowId
});

const {
  getExistingRoom,
  getRoom
} = createRoomStateRuntime({ rooms });

const {
  activePlayers,
  makeRandomAvatar,
  normalizeAvatarShape,
  randomArrayItem,
  selectVip
} = createPlayerStateRuntime({
  avatarShapes,
  gameConstants,
  normalizeColor,
  randomToken
});

const {
  clonePrompt,
  storeRandomTriviaPrompt,
  triviaContentForAction
} = createTriviaContentRuntime({
  multipleChoicePrompts,
  normalizeFlowVariableName
});

const {
  allActivePlayersHaveSubmittedInput,
  clearActiveInputFlowEvent,
  clearAnswersSubmittedAdvanceTimer,
  clearChoiceInput,
  clearTextInput,
  flowEventTargetForAction
} = createInputStateRuntime({ activePlayers });

const {
  flowActionTarget,
  isNoActionTarget,
  isReturnActionTarget
} = createFlowTargetRuntime({ normalizeFlowId });

const {
  normalizeDecisionBranches,
  normalizeDecisionValueType
} = createDecisionActionNormalizationRuntime({
  cleanFlowText,
  flowActionTarget,
  normalizeFlowId
});

const {
  flowActionTypeMeta,
  normalizeGameFlow
} = createGameFlowNormalizationRuntime({
  availableFlowActionTypes,
  availableFlowTransitions,
  cleanChoiceOptions,
  cleanFlowText,
  defaultGameFlow,
  flowActionTarget,
  normalizeCharacterLimit,
  normalizeChoiceInputMode,
  normalizeConstantInteger,
  normalizeDecisionBranches,
  normalizeDecisionValueType,
  normalizeFlowId,
  normalizeFlowVariableName,
  normalizeHostAudioPlayMode,
  normalizeLineIndex,
  normalizePlayerFilter,
  normalizeVotingCardFilter
});

const {
  publicFlowAction,
  resolveRoomActionText
} = createFlowActionPublicRuntime({
  availableFlowTransitions,
  cleanChoiceOptions,
  flowActionTypeMeta,
  normalizeCharacterLimit,
  normalizeChoiceInputMode,
  normalizeConstantInteger,
  normalizeDecisionBranches,
  normalizeDecisionValueType,
  normalizeFlowVariableName,
  normalizeHostAudioPlayMode,
  normalizeLineIndex,
  normalizePlayerFilter,
  readHostAudios,
  resolveHostAudioAction,
  normalizeVotingCardFilter
});

const {
  clearAppliedActionEffects,
  hasAppliedActionEffect,
  markAppliedActionEffect
} = createActionEffectStateRuntime();

const {
  advanceRoomAction,
  entryActionIndexForPhase,
  flowActionIndexById,
  getFlowState,
  getStateActions,
  runtimeGameFlow
} = createFlowNavigationRuntime({
  flowActionTarget,
  isNoActionTarget,
  isReturnActionTarget,
  localDraftStore,
  normalizeFlowId,
  readGameFlow
});

// broadcastLobby is used by early modules; lobbyPayload is wired up later via lazy getter.
const {
  broadcastLobby,
  sendSse
} = createRoomBroadcastRuntime({ getLobbyPayload: () => lobbyPayload });

// Proxies for functions that live in later-constructed runtimes but are needed as deps by earlier ones.
// All are safe: they're only called at request time, after the server is fully initialized.
let _enterGamePhaseFn;
const enterGamePhaseProxy = (room, phase) => _enterGamePhaseFn(room, phase);
let _currentRoomActionFn;
const currentRoomActionProxy = (room) => _currentRoomActionFn(room);
let _advanceRoomAfterActionFn;
const advanceRoomAfterActionProxy = (room, action) => _advanceRoomAfterActionFn(room, action);
let _completeCountdownTriggerFn;
const completeCountdownTriggerProxy = (room) => _completeCountdownTriggerFn(room);
let _emitInputFlowEventFn;
const emitInputFlowEventProxy = (room, eventType) => _emitInputFlowEventFn(room, eventType);
let _applyRoomActionEffectsFn;
const applyRoomActionEffectsProxy = (room, action) => _applyRoomActionEffectsFn?.(room, action);

const {
  clearActionTimer,
  completeCurrentAction
} = createActionCompletionRuntime({
  advanceRoomAfterAction: advanceRoomAfterActionProxy,
  applyRoomActionEffects: applyRoomActionEffectsProxy,
  broadcastLobby,
  clearChoiceInput,
  clearTextInput,
  currentRoomAction: currentRoomActionProxy,
  enterGamePhase: enterGamePhaseProxy
});

const {
  clearCountdownTimer,
  enterStartingPhase
} = createCountdownRuntime({
  broadcastLobby,
  completeCountdownTrigger: completeCountdownTriggerProxy,
  countdownDurationMs: () => Math.round(normalizeDurationSeconds(gameConstants().startGameCountdownDuration, 1) * 1000),
  startGoHoldMs: START_GO_HOLD_MS
});

const {
  mergeFlowWithExistingSubActions
} = createGameFlowMergeRuntime({ readGameFlowSource });

const {
  createLayoutStateForFlowState
} = createStageLayoutStateRuntime({
  flowStateHasActionType,
  isCraftingStateId,
  isRoundIntroStateId,
  normalizeFlowId
});

const {
  createControllerLayoutStateForFlowState
} = createControllerLayoutStateRuntime({
  flowStateHasActionType,
  isCraftingStateId,
  normalizeFlowId
});

const {
  dedupeLayoutElements,
  normalizeLayoutElement,
  normalizeLayoutState
} = createLayoutNormalizationRuntime({
  cleanFlowText,
  cleanLayoutSelector,
  cleanLayoutText,
  defaultCanvas: defaultStageLayouts.canvas,
  normalizeColor,
  normalizeFlowId,
  normalizeLayoutNumber
});

const {
  normalizeStageLayouts
} = createStageLayoutNormalizationRuntime({
  cloneJson,
  defaultStageLayouts,
  normalizeLayoutNumber,
  normalizeLayoutState
});

const {
  normalizeControllerLayouts
} = createControllerLayoutNormalizationRuntime({
  cloneJson,
  defaultControllerLayouts,
  normalizeLayoutNumber,
  normalizeLayoutState
});

const {
  syncControllerLayoutsWithFlow,
  syncStageLayoutsWithFlow
} = createLayoutSyncRuntime({
  createControllerLayoutStateForFlowState,
  createLayoutStateForFlowState,
  dedupeLayoutElements,
  normalizeControllerLayouts,
  normalizeGameFlow,
  normalizeLayoutState,
  normalizeStageLayouts,
  readGameFlow
});

const githubStorage = createGithubStorageRuntime({
  baseBranch: GAME_FLOW_GITHUB_BASE_BRANCH,
  branch: GAME_FLOW_GITHUB_BRANCH,
  repo: GAME_FLOW_GITHUB_REPO,
  token: GAME_FLOW_GITHUB_TOKEN
});

const {
  readGithubGameFlowSource,
  readGithubJsonSource,
  writeGithubGameFlowSource,
  writeGithubJsonSource
} = createToolGithubSourcesRuntime({
  gameFlowPath: GAME_FLOW_GITHUB_PATH,
  githubStorage,
  mergeFlowWithExistingSubActions
});

const {
  handleSaveArtComposition,
  handleReplaceArtAsset,
  sendArtAssetList,
  serveArtFile
} = createArtAssetsRuntime({
  acceptedArtTypes,
  artCompositions: defaultArtCompositions,
  artAssets,
  artGroups,
  artRoot: ART_ROOT,
  contentTypeForFile,
  customDir: ART_CUSTOM_DIR,
  defaultDir: ART_DEFAULT_DIR,
  manifestFile: ART_MANIFEST_FILE,
  onArtAssetsChanged: (payload) => {
    for (const room of rooms.values()) {
      for (const client of room.stageClients) {
        sendSse(client, "artAssetsChanged", payload);
      }
    }
  },
  readJson,
  sendJson
});

const {
  serveClientFile,
  serveIndex
} = createStaticFilesRuntime({
  appVersion: APP_VERSION,
  clientRoot: CLIENT_ROOT,
  contentTypeForFile,
  indexFile: INDEX_FILE,
  sendJson
});

const {
  compareDecisionValues,
  decisionVariableValue,
  evaluateDecisionAction,
  evaluateDecisionBranch,
  evaluateDecisionCode,
  lookupDecisionRootValue,
  propertyPathValue,
  resolveDecisionActionIndex
} = createDecisionRuntime({
  activePlayers,
  flowActionIndexById,
  gameConstants,
  isNoActionTarget,
  normalizeDecisionBranches,
  normalizeDecisionValueType
});

const {
  clearDisplayedCorrectnessForPlayers,
  clearDisplayedPlayerAnswers,
  clearPlayerAnswerData,
  displayedAnswerCorrectness,
  displayedPlayerAnswers,
  filteredPlayerIds,
  forgetDisplayedPlayerAnswer,
  markDisplayedAnswersCorrectness,
  rememberDisplayedPlayerAnswer,
  seedDisplayedPlayerAnswers,
  storedPlayerAnswer,
  updatePlayerAnswerGroups
} = createPlayerAnswersRuntime({
  activePlayers,
  normalizePlayerFilter
});

const {
  answerRecordEntries,
  answerTextFromRecord,
  clearVotingData,
  clearVotingInput,
  prepareVotingCards,
  revealAuthors,
  revealVotes,
  revealWinningAnswer,
  revealVotingResults,
  serializeVotingCards,
  setVotingCardsShown,
  votingCardByOptionIndex
} = createVotingRuntime({
  activePlayers,
  clearAnswersSubmittedAdvanceTimer,
  normalizeVotingCardFilter
});

const {
  clearCraftingTimerTimeout,
  craftingTimerPayload,
  pauseCraftingTimer,
  resetCraftingTimer,
  setCraftingTimerShown,
  startCraftingTimer
} = createCraftingTimerRuntime({
  clearActiveInputFlowEvent,
  clearAnswersSubmittedAdvanceTimer,
  durationMs: () => Math.round(normalizeDurationSeconds(gameConstants().craftingTimerDuration, 30) * 1000),
  emitInputFlowEvent: emitInputFlowEventProxy
});

// roomPhaseRuntime created here so clearActionTimer + clearCountdownTimer + resetCraftingTimer are available.
// Wire the enterGamePhase proxy after construction.
const {
  advanceRoomFromMomentReturn,
  enterGamePhase,
  enterIntroPhase,
  enterLobbyPhase,
  quitRoomToLobby,
} = createRoomPhaseRuntime({
  activePlayers,
  broadcastLobby,
  clearActionTimer,
  clearAppliedActionEffects,
  clearChoiceInput,
  clearCountdownTimer,
  clearDisplayedPlayerAnswers,
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
  runtimeGameFlow,
});
_enterGamePhaseFn = enterGamePhase;

const {
  advanceRoomAfterAction,
  completeCountdownTrigger,
  countdownTargetState,
  currentRoomAction,
  emitInputFlowEvent,
  jumpToAction,
  scheduleAnswersSubmittedAdvance,
} = createRoomFlowHelpersRuntime({
  activePlayers,
  advanceRoomFromMomentReturn,
  broadcastLobby,
  clearActionTimer,
  clearActiveInputFlowEvent,
  clearAnswersSubmittedAdvanceTimer,
  clearAppliedActionEffects,
  clearChoiceInput,
  clearCraftingTimerTimeout,
  clearTextInput,
  clearVotingInput,
  enterGamePhase,
  flowActionIndexById,
  flowEventTargetForAction,
  getFlowState,
  getStateActions,
  isNoActionTarget,
  isReturnActionTarget,
  pauseCraftingTimer,
  publicFlowAction,
  resolveDecisionActionIndex,
  runtimeGameFlow,
});
_currentRoomActionFn = currentRoomAction;
_advanceRoomAfterActionFn = advanceRoomAfterAction;
_completeCountdownTriggerFn = completeCountdownTrigger;
_emitInputFlowEventFn = emitInputFlowEvent;

function randomToken() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

const {
  readDefaultControllerLayoutsSource,
  readDefaultGameConstantsSource,
  readDefaultGameFlowSource,
  readDefaultHostAudiosSource,
  readDefaultStageLayoutsSource,
  readLocalControllerLayoutsSource,
  readLocalGameConstantsSource,
  readLocalGameFlowSource,
  readLocalHostAudiosSource,
  readLocalStageLayoutsSource
} = createToolSourceReadersRuntime({
  cloneJson,
  controllerLayoutsFile: CONTROLLER_LAYOUTS_FILE,
  defaultControllerLayouts,
  defaultControllerLayoutsFile: DEFAULT_CONTROLLER_LAYOUTS_FILE,
  defaultGameConstants,
  defaultGameConstantsFile: DEFAULT_GAME_CONSTANTS_FILE,
  defaultGameFlow,
  defaultGameFlowFile: DEFAULT_GAME_FLOW_FILE,
  defaultHostAudios,
  defaultHostAudiosFile: DEFAULT_HOST_AUDIOS_FILE,
  defaultStageLayouts,
  defaultStageLayoutsFile: DEFAULT_STAGE_LAYOUTS_FILE,
  gameConstantsFile: GAME_CONSTANTS_FILE,
  gameFlowFile: GAME_FLOW_FILE,
  hostAudiosFile: HOST_AUDIOS_FILE,
  normalizeControllerLayouts,
  normalizeGameConstants,
  normalizeHostAudios,
  normalizeStageLayouts,
  readJsonFile,
  stageLayoutsFile: STAGE_LAYOUTS_FILE
});

const {
  controllerLayoutsStore,
  gameConstantsStore,
  gameFlowStore,
  hostAudiosStore,
  stageLayoutsStore
} = createToolSourceStoresRuntime({
  readLocalControllerLayoutsSource,
  readLocalGameConstantsSource,
  readLocalGameFlowSource,
  readLocalHostAudiosSource,
  readLocalStageLayoutsSource,
  storageKind: GAME_FLOW_STORAGE
});

const {
  loadControllerLayoutsSource,
  loadGameConstantsSource,
  loadGameFlowSource,
  loadHostAudiosSource,
  loadStageLayoutsSource,
  writeControllerLayouts,
  writeGameConstants,
  writeGameFlow,
  writeHostAudios,
  writeStageLayouts,
} = createToolPersistenceRuntime({
  backupJsonFile,
  controllerLayoutsBackupDir: CONTROLLER_LAYOUTS_BACKUP_DIR,
  controllerLayoutsFile: CONTROLLER_LAYOUTS_FILE,
  controllerLayoutsGithubPath: CONTROLLER_LAYOUTS_GITHUB_PATH,
  controllerLayoutsStore,
  gameConstantsBackupDir: GAME_CONSTANTS_BACKUP_DIR,
  gameConstantsFile: GAME_CONSTANTS_FILE,
  gameConstantsGithubPath: GAME_CONSTANTS_GITHUB_PATH,
  gameConstantsStore,
  gameFlowBackupDir: GAME_FLOW_BACKUP_DIR,
  gameFlowFile: GAME_FLOW_FILE,
  gameFlowStore,
  githubToken: GAME_FLOW_GITHUB_TOKEN,
  hostAudiosBackupDir: HOST_AUDIOS_BACKUP_DIR,
  hostAudiosFile: HOST_AUDIOS_FILE,
  hostAudiosGithubPath: HOST_AUDIOS_GITHUB_PATH,
  hostAudiosStore,
  mergeFlowWithExistingSubActions,
  mirrorJsonFile,
  normalizeControllerLayouts,
  normalizeGameConstants,
  normalizeGameFlow,
  normalizeHostAudios,
  normalizeStageLayouts,
  readControllerLayoutsSource,
  readGameConstantsSource,
  readGameFlowSource,
  readGithubGameFlowSource,
  readGithubJsonSource,
  readLocalControllerLayoutsSource,
  readLocalGameConstantsSource,
  readLocalGameFlowSource,
  readLocalHostAudiosSource,
  readLocalStageLayoutsSource,
  readHostAudiosSource,
  readStageLayoutsSource,
  stageLayoutsBackupDir: STAGE_LAYOUTS_BACKUP_DIR,
  stageLayoutsFile: STAGE_LAYOUTS_FILE,
  stageLayoutsGithubPath: STAGE_LAYOUTS_GITHUB_PATH,
  stageLayoutsStore,
  syncControllerLayoutsWithFlow,
  syncStageLayoutsWithFlow,
  writeGithubGameFlowSource,
  writeGithubJsonSource,
  writeJsonFile,
});

const {
  handleLocalDraft,
  sendLocalDraft
} = createLocalDraftRuntime({
  broadcastLobby,
  clearActionTimer,
  clearAppliedActionEffects,
  localDraftStore,
  normalizeControllerLayouts,
  normalizeGameConstants,
  normalizeGameFlow,
  normalizeHostAudios,
  normalizeStageLayouts,
  readGameFlow,
  readJson,
  resetCraftingTimer,
  rooms,
  sendJson,
  syncControllerLayoutsWithFlow,
  syncStageLayoutsWithFlow
});

const {
  handleSaveControllerLayouts,
  handleSaveGameConstants,
  handleSaveGameFlow,
  handleSaveHostAudios,
  handleSaveStageLayouts
} = createSaveHandlersRuntime({
  broadcastLobby,
  clearActionTimer,
  clearAppliedActionEffects,
  controllerLayoutsStore,
  gameConstantsStore,
  gameFlowStore,
  hasGithubToken: () => Boolean(GAME_FLOW_GITHUB_TOKEN),
  hostAudiosStore,
  localDraftStore,
  normalizeHostAudios,
  normalizeGameFlow,
  readJson,
  resetCraftingTimer,
  rooms,
  sendJson,
  stageLayoutsStore,
  writeControllerLayouts,
  writeGameConstants,
  writeGameFlow,
  writeHostAudios,
  writeStageLayouts
});

const {
  sendControllerLayouts,
  sendGameConstants,
  sendGameFlow,
  sendHostAudios,
  sendStageLayouts
} = createToolDataReadRuntime({
  availableFlowActionTypes,
  availableFlowTransitions,
  controllerLayoutsPath: CONTROLLER_LAYOUTS_GITHUB_PATH,
  controllerLayoutsStore,
  gameConstantsPath: GAME_CONSTANTS_GITHUB_PATH,
  gameConstantsStore,
  gameFlowPath: GAME_FLOW_GITHUB_PATH,
  gameFlowStore,
  githubBranch: GAME_FLOW_GITHUB_BRANCH,
  githubRepo: GAME_FLOW_GITHUB_REPO,
  hasGithubToken: () => Boolean(GAME_FLOW_GITHUB_TOKEN),
  hostAudiosPath: HOST_AUDIOS_GITHUB_PATH,
  hostAudiosStore,
  loadControllerLayoutsSource,
  loadGameConstantsSource,
  loadGameFlowSource,
  loadHostAudiosSource,
  loadStageLayoutsSource,
  localDraftStore,
  normalizeGameConstants,
  normalizeGameFlow,
  normalizeHostAudios,
  sendJson,
  stageLayoutsPath: STAGE_LAYOUTS_GITHUB_PATH,
  stageLayoutsStore,
  syncControllerLayoutsWithFlow,
  syncStageLayoutsWithFlow
});

function readGameFlowSource() {
  return cloneJson(gameFlowStore.source || readDefaultGameFlowSource());
}

function readGameFlow() {
  return normalizeGameFlow(readGameFlowSource());
}

function readGameConstantsSource() {
  return cloneJson(gameConstantsStore.source || readDefaultGameConstantsSource());
}

function gameConstants() {
  return normalizeGameConstants(localDraftStore.constants || readGameConstantsSource());
}

function readStageLayoutsSource() {
  return cloneJson(stageLayoutsStore.source || readDefaultStageLayoutsSource());
}

function readControllerLayoutsSource() {
  return cloneJson(controllerLayoutsStore.source || readDefaultControllerLayoutsSource());
}

function readHostAudiosSource() {
  return cloneJson(hostAudiosStore.source || readDefaultHostAudiosSource());
}

function readHostAudios() {
  return normalizeHostAudios(localDraftStore.hostAudios || readHostAudiosSource());
}

const {
  applyRoomActionEffects
} = createRoomActionEffectsRuntime({
  activePlayers,
  clearDisplayedCorrectnessForPlayers,
  filteredPlayerIds,
  gameConstants,
  hasAppliedActionEffect,
  markAppliedActionEffect,
  markDisplayedAnswersCorrectness,
  normalizePlayerFilter,
  prepareVotingCards,
  revealAuthors,
  revealVotes,
  revealWinningAnswer,
  revealVotingResults,
  seedDisplayedPlayerAnswers,
  setCraftingTimerShown,
  setVotingCardsShown,
  startCraftingTimer,
  storeRandomTriviaPrompt
});
_applyRoomActionEffectsFn = applyRoomActionEffects;

const {
  applyChoiceInputAction,
  applyTextInputAction,
  choiceInputPayload,
  textInputPayload
} = createControllerInputPayloadRuntime({
  cleanChoiceOptions,
  clearDisplayedPlayerAnswers,
  clearPlayerAnswerData,
  normalizeCharacterLimit,
  normalizeChoiceInputMode,
  triviaContentForAction
});

const {
  publicPlayer
} = createPlayerPublicRuntime({ choiceInputPayload });

const {
  debugActionPayload,
  lobbyPayload
} = createLobbyPayloadRuntime({
  activePlayers,
  applyRoomActionEffects,
  choiceInputPayload,
  craftingTimerPayload,
  currentRoomAction,
  gameConstants,
  normalizePlayerFilter,
  publicPlayer,
  resolveRoomActionText,
  runtimeGameFlow,
  selectVip,
  serializeVotingCards,
  textInputPayload
});

const {
  handleStageEvents,
  removeStageClient
} = createStageEventsRuntime({
  getExistingRoom,
  getRoom,
  heartbeatIntervalMs: HEARTBEAT_INTERVAL_MS,
  lobbyPayload,
  sendJson,
  sendSse
});

const {
  handleHeartbeat,
  handleJoin,
  handleLeave,
  handleSelectAvatar
} = createPlayerSessionHandlersRuntime({
  broadcastLobby,
  cleanPlayerName,
  gameConstants,
  getExistingRoom,
  getRoom,
  lobbyPayload,
  makeRandomAvatar,
  normalizeAvatarShape,
  normalizePlayerId,
  normalizeStageCode,
  publicPlayer,
  randomArrayItem,
  readJson,
  selectVip,
  sendJson
});

const {
  handleCancelStart,
  handleStart
} = createStartHandlersRuntime({
  broadcastLobby,
  enterLobbyPhase,
  enterStartingPhase,
  getExistingRoom,
  lobbyPayload,
  normalizePlayerId,
  normalizeStageCode,
  readJson,
  selectVip,
  sendJson
});

const {
  handleActionEffect,
  handleAdvancePresentation,
  handleCompleteAction
} = createStageActionHandlersRuntime({
  applyRoomActionEffects,
  broadcastLobby,
  completeCurrentAction,
  currentRoomAction,
  getExistingRoom,
  lobbyPayload,
  normalizeStageCode,
  readJson,
  resolveRoomActionText,
  sendJson
});

const {
  handleControllerChoice,
  handleControllerTextSubmit
} = createControllerSubmitHandlersRuntime({
  allActivePlayersHaveSubmittedInput,
  applyChoiceInputAction,
  applyTextInputAction,
  broadcastLobby,
  cleanSubmittedText,
  currentRoomAction,
  displayedAnswerCorrectness,
  forgetDisplayedPlayerAnswer,
  getExistingRoom,
  lobbyPayload,
  normalizePlayerId,
  normalizeStageCode,
  readJson,
  resolveRoomActionText,
  scheduleAnswersSubmittedAdvance,
  sendJson,
  updatePlayerAnswerGroups
});

const {
  handleStageTestConfig
} = createStageTestConfigHandlerRuntime({
  broadcastLobby,
  clearAppliedActionEffects,
  getRoom,
  getStateActions,
  lobbyPayload,
  normalizeGameFlow,
  readJson,
  sendJson
});

const {
  handleLobby,
  handlePresentHi,
  handleQuitToLobby
} = createLobbyControlHandlersRuntime({
  broadcastLobby,
  getExistingRoom,
  getRoom,
  lobbyPayload,
  normalizePlayerId,
  normalizeStageCode,
  quitRoomToLobby,
  readJson,
  selectVip,
  sendJson
});

const {
  router
} = createRouterRuntime({
  clonePrompt,
  handleActionEffect,
  handleAdvancePresentation,
  handleCancelStart,
  handleCompleteAction,
  handleControllerChoice,
  handleControllerTextSubmit,
  handleHeartbeat,
  handleJoin,
  handleLeave,
  handleLobby,
  handleLocalDraft,
  handlePresentHi,
  handleQuitToLobby,
  handleReplaceArtAsset,
  handleSaveArtComposition,
  handleSaveControllerLayouts,
  handleSaveGameConstants,
  handleSaveGameFlow,
  handleSaveHostAudios,
  handleSaveStageLayouts,
  handleSelectAvatar,
  handleStart,
  handleStageEvents,
  handleStageTestConfig,
  multipleChoicePrompts,
  normalizeStageCode,
  rooms,
  sendArtAssetList,
  sendControllerLayouts,
  sendGameConstants,
  sendGameFlow,
  sendHostAudios,
  sendJson,
  sendLocalDraft,
  sendStageLayouts,
  serveArtFile,
  serveClientFile,
  serveIndex,
});


const {
  sweepInactivePlayers
} = createInactivePlayerSweepRuntime({
  broadcastLobby,
  controllerTimeoutMs: CONTROLLER_TIMEOUT_MS,
  rooms,
  selectVip
});

const {
  getLanUrls
} = createNetworkUrlsRuntime({
  networkInterfaces: os.networkInterfaces,
  port: PORT
});

setInterval(sweepInactivePlayers, 2000);

const server = http.createServer(router);

server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.error(`Port ${PORT} is already in use. Try PORT=${PORT + 1} npm start`);
    process.exit(1);
  }
  throw error;
});

server.listen(PORT, HOST, () => {
  console.log(`Party Game Template server running at http://localhost:${PORT}`);
  for (const url of getLanUrls()) {
    console.log(`LAN URL: ${url}`);
  }
  loadGameFlowSource({ refresh: true })
    .then(() => {
      console.log(`Game flow storage: ${gameFlowStore.storageKind}${gameFlowStore.error ? ` (${gameFlowStore.error})` : ""}`);
    })
    .catch((error) => {
      console.error(`Game flow storage failed: ${error.message}`);
    });
  loadGameConstantsSource({ refresh: true })
    .then(() => {
      console.log(`Game constants storage: ${gameConstantsStore.storageKind}${gameConstantsStore.error ? ` (${gameConstantsStore.error})` : ""}`);
    })
    .catch((error) => {
      console.error(`Game constants storage failed: ${error.message}`);
    });
  loadHostAudiosSource({ refresh: true })
    .then(() => {
      console.log(`Host audio storage: ${hostAudiosStore.storageKind}${hostAudiosStore.error ? ` (${hostAudiosStore.error})` : ""}`);
    })
    .catch((error) => {
      console.error(`Host audio storage failed: ${error.message}`);
    });
});
