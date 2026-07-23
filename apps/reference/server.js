const path = require("path");
const { createAdminAuthRuntime } = require("@pop-party/engine/security/admin");
const { createAdminAuditRuntime } = require("@pop-party/engine/security/audit");
const {
  backupJsonFile,
  cleanChoiceOptions,
  cleanFlowText,
  cleanLayoutSelector,
  cleanLayoutText,
  cleanPlayerName,
  cleanSubmittedText,
  contentTypeForFile,
  createActionCompletionRuntime,
  createActionEffectStateRuntime,
  createCountdownRuntime,
  createControllerInputPayloadRuntime,
  createControllerSubmitHandlersRuntime,
  createCraftingTimerRuntime,
  createDecisionActionNormalizationRuntime,
  createDecisionRuntime,
  createFlowNavigationRuntime,
  createFlowActionPublicRuntime,
  createFlowTargetRuntime,
  createGameFlowMergeRuntime,
  createGameFlowNormalizationRuntime,
  createGameConstantsRuntime,
  createHostAudioRuntime,
  createInactivePlayerSweepRuntime,
  createInputStateRuntime,
  createLobbyControlHandlersRuntime,
  createLobbyPayloadRuntime,
  createMomentRouteRuntime,
  createPauseRuntime,
  createPlayerPublicRuntime,
  createPlayerAnswersRuntime,
  createPlayerSessionHandlersRuntime,
  createPlayerStateRuntime,
  createRoomBroadcastRuntime,
  createRoomActionEffectsRuntime,
  createRoomFlowHelpersRuntime,
  createRoomPhaseRuntime,
  createRoomStateRuntime,
  createRoomRuntimeContentRuntime,
  createRouterRuntime,
  createStageActionHandlersRuntime,
  createStageEventsRuntime,
  createStaticFilesRuntime,
  createStartHandlersRuntime,
  createTriviaContentRuntime,
  createVotingRuntime,
  flowStateHasActionType,
  isCraftingStateId,
  isRoundIntroStateId,
  mirrorJsonFile,
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
  normalizeVotingCardFilter,
  readAppVersion,
  readJson,
  readJsonFile,
  resetGameSessionState,
  sendJson,
  writeJsonFile
} = require("@pop-party/engine/server");
const { createWebServiceRuntime } = require("@pop-party/engine/server/web-service");
const {
  createGithubStorageRuntime,
  createLayoutSyncRuntime,
  createLocalDraftRuntime,
  createSaveHandlersRuntime,
  createToolDataReadRuntime,
  createToolGithubSourcesRuntime,
  createToolPersistenceRuntime,
  createToolSourceReadersRuntime,
  createToolSourceStoresRuntime
} = require("@pop-party/engine/tooling");
const { createContentAdminHandlersRuntime } = require("@pop-party/engine/content/admin");
const { createContentStoreEnvironmentRuntime } = require("@pop-party/engine/content/environment");
const { createLocalContentBundleProvider } = require("@pop-party/engine/content/local");
const { createControllerLayoutNormalizationRuntime } = require("./server/controller-layout-normalization-runtime");
const { createControllerLayoutStateRuntime } = require("./server/controller-layout-state-runtime");
const { createArtAssetsRuntime } = require("./server/art-assets-runtime");
const { artRuntimeReferences } = require("./server/art-runtime-dependencies");
const { createLayoutNormalizationRuntime } = require("./server/layout-normalization-runtime");
const { createRoomContentPinRuntime } = require("@pop-party/engine/rooms/content-pin");
const { createRuntimeCapabilityRuntime } = require("@pop-party/engine/security/runtime-capabilities");
const { createStageTestConfigHandlerRuntime } = require("@pop-party/engine/testing");
const { createStageLayoutNormalizationRuntime } = require("./server/stage-layout-normalization-runtime");
const { createStageLayoutStateRuntime } = require("./server/stage-layout-state-runtime");
const GAME_DEFINITION = require("./game.config");
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
} = GAME_DEFINITION.gameData;

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "0.0.0.0";
const ROOT = path.resolve(__dirname, "../..");
const INDEX_FILE = path.join(ROOT, "index.html");
const CLIENT_ROOT = path.join(ROOT, "client");
const BUILD_ASSETS_ROOT = path.join(ROOT, "dist", "client", "assets");
const SHARED_ROOT = path.join(ROOT, "shared");
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
const ART_MANIFEST_GITHUB_PATH = process.env.ART_MANIFEST_GITHUB_PATH || "art-manifest.json";
const ART_ROOT = path.join(ROOT, "art");
const ART_DEFAULT_DIR = path.join(ART_ROOT, "default");
const ART_CUSTOM_DIR = path.join(ART_ROOT, "custom");
const ART_MANIFEST_FILE = path.join(ART_ROOT, "art-manifest.json");
const ADMIN_AUTH_MODE = String(process.env.PARTY_GAME_ADMIN_AUTH_MODE || "legacy-open").toLowerCase();
const RUNTIME_CAPABILITY_MODE = String(process.env.PARTY_GAME_RUNTIME_CAPABILITIES || "legacy").toLowerCase();
const CONTROLLER_TIMEOUT_MS = 10000;
const HEARTBEAT_INTERVAL_MS = 25000;
const START_GO_HOLD_MS = 700;
const rooms = new Map();
const localDraftStore = {
  flow: null,
  constants: null,
  layouts: null,
  controllerLayouts: null,
  hostAudios: null,
  artCompositions: null,
  artOrganization: null,
  artAssetReplacements: null
};

const APP_VERSION = readAppVersion(ROOT);
const adminAudit = createAdminAuditRuntime();
const adminAuth = createAdminAuthRuntime({
  mode: ADMIN_AUTH_MODE,
  isProduction: process.env.NODE_ENV === "production",
  clientId: process.env.PARTY_GAME_GITHUB_OAUTH_CLIENT_ID || "",
  clientSecret: process.env.PARTY_GAME_GITHUB_OAUTH_CLIENT_SECRET || "",
  callbackUrl: process.env.PARTY_GAME_GITHUB_OAUTH_CALLBACK_URL || "",
  allowedUserId: process.env.PARTY_GAME_ADMIN_GITHUB_USER_ID || "",
  secureCookies: process.env.NODE_ENV === "production",
  audit: (req, event) => adminAudit.record(req, event)
});
const contentEnvironment = createContentStoreEnvironmentRuntime({
  env: process.env,
  isProduction: process.env.NODE_ENV === "production",
  adminAuthMode: ADMIN_AUTH_MODE
});
const contentStore = GAME_DEFINITION.content.store || contentEnvironment.contentStore;
const roomContentStore = contentEnvironment.contentStore || createLocalContentBundleProvider({
  root: path.join(__dirname, "content"),
  gameBuild: GAME_DEFINITION.version,
  engineVersion: GAME_DEFINITION.engineCompatibility,
  pluginVersion: GAME_DEFINITION.version
});
const contentAdmin = contentEnvironment.remoteAuthoring === "enabled"
  ? createContentAdminHandlersRuntime({
      contentStore,
      readJson,
      sendJson,
      audit: (req, event) => adminAudit.record(req, event)
    })
  : null;

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

const roomContentPins = createRoomContentPinRuntime({
  contentStore: roomContentStore,
  gameId: GAME_DEFINITION.gameId
});

const runtimeCapabilities = createRuntimeCapabilityRuntime({
  mode: RUNTIME_CAPABILITY_MODE,
  getExistingRoom,
  getRoom,
  normalizePlayerId,
  normalizeStageCode,
  readJson,
  sendJson,
  pinNewRoom: roomContentPins?.pinNewRoom,
  deleteRoom: (stageCode) => rooms.delete(stageCode)
});

const {
  sendRoomRuntimeContent,
  serveRoomArtAsset
} = createRoomRuntimeContentRuntime({
  getExistingRoom,
  normalizeStageCode,
  sendJson
});

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
  clearMicrophoneAccessInput,
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

function broadcastArtAssetsChanged(payload) {
  for (const room of rooms.values()) {
    for (const client of room.stageClients) {
      sendSse(client, "artAssetsChanged", payload);
    }
  }
}

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
let _releasePendingFlowEventsFn;
const releasePendingFlowEventsProxy = (room) => _releasePendingFlowEventsFn?.(room) === true;

const {
  clearActionTimer,
  completeCurrentAction,
  pauseActionTimer,
  resumeActionTimer
} = createActionCompletionRuntime({
  advanceRoomAfterAction: advanceRoomAfterActionProxy,
  applyRoomActionEffects: applyRoomActionEffectsProxy,
  broadcastLobby,
  clearChoiceInput,
  clearMicrophoneAccessInput,
  clearTextInput,
  currentRoomAction: currentRoomActionProxy,
  enterGamePhase: enterGamePhaseProxy,
  releasePendingFlowEvents: releasePendingFlowEventsProxy
});

const {
  clearCountdownTimer,
  enterStartingPhase,
  pauseCountdownTimer,
  resumeCountdownTimer
} = createCountdownRuntime({
  broadcastLobby,
  completeCountdownTrigger: completeCountdownTriggerProxy,
  countdownDurationMs: (room) => Math.round(normalizeDurationSeconds(gameConstants(room).startGameCountdownDuration, 1) * 1000),
  startGoHoldMs: START_GO_HOLD_MS
});

const {
  mergeFlowWithExistingSubActions
} = createGameFlowMergeRuntime({
  readGameFlowSource,
  requiredFlowStates: defaultGameFlow.states.filter((state) => state.id === "lobby" || state.id === "intro")
});

const {
  createLayoutStateForFlowState
} = createStageLayoutStateRuntime({
  flowStateHasActionType,
  isCraftingStateId,
  isRoundIntroStateId,
  normalizeFlowId
});

const {
  createControllerInputLayoutStates
} = createControllerLayoutStateRuntime();

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
  normalizeLayoutNumber,
  semanticRoles: GAME_DEFINITION.semanticRoles
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
  normalizeLayoutState,
  semanticRoles: GAME_DEFINITION.semanticRoles
});

const {
  syncControllerLayoutsWithFlow,
  syncStageLayoutsWithFlow
} = createLayoutSyncRuntime({
  createControllerInputLayoutStates,
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
  githubStorage
});

const {
  handleCleanupArtCompositions,
  handleDeleteArtComposition,
  handleSaveArtOrganization,
  handleSaveArtComposition,
  handleSaveArtCompositions,
  handleReplaceArtAsset,
  normalizeArtAssetReplacementsDraft,
  normalizeArtCompositionsDraft,
  normalizeArtOrganization,
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
  loadArtManifestSource: () => loadArtManifestSource({ refresh: artManifestStore.storageKind === "github" }),
  loadArtDependencySources: async () => {
    const [stageLayouts, controllerLayouts, flow] = await Promise.all([
      loadStageLayoutsSource({ refresh: stageLayoutsStore.storageKind === "github" }),
      loadControllerLayoutsSource({ refresh: controllerLayoutsStore.storageKind === "github" }),
      loadGameFlowSource({ refresh: gameFlowStore.storageKind === "github" })
    ]);
    return {
      stageLayouts: localDraftStore.layouts || stageLayouts,
      controllerLayouts: localDraftStore.controllerLayouts || controllerLayouts,
      flow: localDraftStore.flow || flow,
      runtimeReferences: artRuntimeReferences(GAME_DEFINITION.semanticRoles)
    };
  },
  localDraftStore,
  manifestFile: ART_MANIFEST_FILE,
  onArtAssetsChanged: broadcastArtAssetsChanged,
  readJson,
  sendJson,
  writeArtManifestSource: (manifest) => writeArtManifest(manifest)
});

const {
  serveBuildAsset,
  serveClientFile,
  serveIndex,
  serveSharedFile
} = createStaticFilesRuntime({
  appVersion: APP_VERSION,
  buildAssetsRoot: BUILD_ASSETS_ROOT,
  clientRoot: CLIENT_ROOT,
  contentTypeForFile,
  gameDefinition: GAME_DEFINITION,
  indexFile: INDEX_FILE,
  root: ROOT,
  sendJson,
  sharedRoot: SHARED_ROOT
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
  resolveMomentRouteTarget,
  resolveMomentTargetStateId
} = createMomentRouteRuntime({
  evaluateDecisionAction,
  isNoActionTarget,
  normalizeFlowId,
  runtimeGameFlow
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
  resumeCraftingTimer,
  resetCraftingTimer,
  setCraftingTimerShown,
  startCraftingTimer
} = createCraftingTimerRuntime({
  clearActiveInputFlowEvent,
  clearAnswersSubmittedAdvanceTimer,
  durationMs: (room) => Math.round(normalizeDurationSeconds(gameConstants(room).craftingTimerDuration, 30) * 1000),
  emitInputFlowEvent: emitInputFlowEventProxy
});

// roomPhaseRuntime created here so clearActionTimer + clearCountdownTimer + resetCraftingTimer are available.
// Wire the enterGamePhase proxy after construction.
const {
  advanceRoomFromMomentReturn,
  advanceRoomFromRouteAction,
  endGameMoment,
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
});
_enterGamePhaseFn = enterGamePhase;

const {
  advanceRoomAfterAction,
  completeCountdownTrigger,
  countdownTargetState,
  currentRoomAction,
  emitInputFlowEvent,
  jumpToAction,
  pauseAnswersSubmittedAdvanceTimer,
  releasePendingFlowEvents,
  resumeAnswersSubmittedAdvanceTimer,
  scheduleAnswersSubmittedAdvance,
  scheduleMicrophoneAccessAdvance,
} = createRoomFlowHelpersRuntime({
  activePlayers,
  advanceRoomFromMomentReturn,
  advanceRoomFromRouteAction,
  broadcastLobby,
  clearActionTimer,
  clearActiveInputFlowEvent,
  clearAnswersSubmittedAdvanceTimer,
  clearAppliedActionEffects,
  clearChoiceInput,
  clearCraftingTimerTimeout,
  clearMicrophoneAccessInput,
  clearTextInput,
  clearVotingInput,
  entryActionIndexForPhase,
  enterGamePhase,
  flowActionTarget,
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
_releasePendingFlowEventsFn = releasePendingFlowEvents;

function randomToken() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

const {
  readLocalArtManifestSource,
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
  artManifestFile: ART_MANIFEST_FILE,
  controllerLayoutsFile: CONTROLLER_LAYOUTS_FILE,
  defaultControllerLayoutsFile: DEFAULT_CONTROLLER_LAYOUTS_FILE,
  defaultGameConstantsFile: DEFAULT_GAME_CONSTANTS_FILE,
  defaultGameFlowFile: DEFAULT_GAME_FLOW_FILE,
  defaultHostAudiosFile: DEFAULT_HOST_AUDIOS_FILE,
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
  artManifestStore,
  controllerLayoutsStore,
  gameConstantsStore,
  gameFlowStore,
  hostAudiosStore,
  stageLayoutsStore
} = createToolSourceStoresRuntime({
  readLocalArtManifestSource,
  readLocalControllerLayoutsSource,
  readLocalGameConstantsSource,
  readLocalGameFlowSource,
  readLocalHostAudiosSource,
  readLocalStageLayoutsSource,
  storageKind: GAME_FLOW_STORAGE
});

const {
  loadArtManifestSource,
  loadControllerLayoutsSource,
  loadGameConstantsSource,
  loadGameFlowSource,
  loadHostAudiosSource,
  loadStageLayoutsSource,
  writeControllerLayouts,
  writeGameConstants,
  writeGameFlow,
  writeHostAudios,
  writeArtManifest,
  writeStageLayouts,
} = createToolPersistenceRuntime({
  artManifestFile: ART_MANIFEST_FILE,
  artManifestGithubPath: ART_MANIFEST_GITHUB_PATH,
  artManifestStore,
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
  gameFlowGithubPath: GAME_FLOW_GITHUB_PATH,
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
  readArtManifestSource,
  readControllerLayoutsSource,
  readGameConstantsSource,
  readGameFlowSource,
  readGithubGameFlowSource,
  readGithubJsonSource,
  readLocalArtManifestSource,
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
  normalizeArtAssetReplacementsDraft,
  normalizeControllerLayouts,
  normalizeGameConstants,
  normalizeGameFlow,
  normalizeHostAudios,
  normalizeArtCompositionsDraft,
  normalizeArtOrganization,
  normalizeStageLayouts,
  readGameFlow,
  readJson,
  resetCraftingTimer,
  onArtAssetsChanged: broadcastArtAssetsChanged,
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
  localDraftStore,
  normalizeHostAudios,
  normalizeGameFlow,
  readJson,
  resetCraftingTimer,
  rooms,
  sendJson,
  stageLayoutsStore,
  stageLayoutsPath: STAGE_LAYOUTS_GITHUB_PATH,
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

function readArtManifestSource() {
  const manifest = artManifestStore.source || readLocalArtManifestSource();
  return cloneJson(manifest && typeof manifest === "object" && !Array.isArray(manifest) ? manifest : {});
}

function readGameFlow() {
  return normalizeGameFlow(readGameFlowSource());
}

function readGameConstantsSource() {
  return cloneJson(gameConstantsStore.source || readDefaultGameConstantsSource());
}

function gameConstants(room = null) {
  const pinnedConstants = room?.gameData?.defaultGameConstants;
  return normalizeGameConstants(pinnedConstants || localDraftStore.constants || readGameConstantsSource());
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

function readHostAudios(room = null) {
  const pinnedHostAudios = room?.gameData?.defaultHostAudios;
  return normalizeHostAudios(pinnedHostAudios || localDraftStore.hostAudios || readHostAudiosSource());
}

const {
  applyRoomActionEffects
} = createRoomActionEffectsRuntime({
  activePlayers,
  clearDisplayedCorrectnessForPlayers,
  endGameMoment,
  filteredPlayerIds,
  gameConstants,
  hasAppliedActionEffect,
  markAppliedActionEffect,
  markDisplayedAnswersCorrectness,
  normalizePlayerFilter,
  prepareVotingCards,
  resetGameSessionState,
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
  applyMicrophoneAccessAction,
  applyTextInputAction,
  choiceInputPayload,
  microphoneAccessPayload,
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
  allActivePlayersHaveSubmittedInput,
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
  scheduleMicrophoneAccessAdvance,
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
  runtimeCapabilities,
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
  handlePause,
  roomIsPaused
} = createPauseRuntime({
  broadcastLobby,
  getExistingRoom,
  lobbyPayload,
  normalizeStageCode,
  pauseActionTimer,
  pauseAnswersSubmittedAdvanceTimer,
  pauseCountdownTimer,
  pauseCraftingTimer,
  readJson,
  resumeActionTimer,
  resumeAnswersSubmittedAdvanceTimer,
  resumeCountdownTimer,
  resumeCraftingTimer,
  sendJson
});

const {
  handleActionEffect,
  handleAdvancePresentation,
  handleCompleteAction,
  handleInputEvent
} = createStageActionHandlersRuntime({
  applyRoomActionEffects,
  broadcastLobby,
  completeCurrentAction,
  currentRoomAction,
  emitInputFlowEvent,
  getExistingRoom,
  lobbyPayload,
  normalizeStageCode,
  readJson,
  resolveRoomActionText,
  roomIsPaused,
  sendJson
});

const {
  handleControllerChoice,
  handleControllerMicrophoneAccess,
  handleControllerTextSubmit
} = createControllerSubmitHandlersRuntime({
  allActivePlayersHaveSubmittedInput,
  applyChoiceInputAction,
  applyMicrophoneAccessAction,
  applyTextInputAction,
  broadcastLobby,
  cleanSubmittedText,
  currentRoomAction,
  displayedAnswerCorrectness,
  emitInputFlowEvent,
  forgetDisplayedPlayerAnswer,
  getExistingRoom,
  lobbyPayload,
  normalizePlayerId,
  normalizeStageCode,
  readJson,
  rememberDisplayedPlayerAnswer,
  resolveRoomActionText,
  roomIsPaused,
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
  handleQuitToLobby
} = createLobbyControlHandlersRuntime({
  getExistingRoom,
  getRoom,
  lobbyPayload,
  normalizeStageCode,
  quitRoomToLobby,
  readJson,
  sendJson
});

const {
  router
} = createRouterRuntime({
  adminAuth,
  clonePrompt,
  contentAdmin,
  contentStatus: {
    mode: contentEnvironment.mode,
    remoteAuthoring: contentEnvironment.remoteAuthoring,
    enabled: contentEnvironment.enabled
  },
  gameDefinition: GAME_DEFINITION,
  handleActionEffect,
  handleAdvancePresentation,
  handleCancelStart,
  handleCompleteAction,
  handleControllerChoice,
  handleControllerMicrophoneAccess,
  handleControllerTextSubmit,
  handleHeartbeat,
  handleInputEvent,
  handleJoin,
  handleLeave,
  handleLobby,
  handleLocalDraft,
  handlePause,
  handleQuitToLobby,
  handleCleanupArtCompositions,
  handleDeleteArtComposition,
  handleReplaceArtAsset,
  handleSaveArtOrganization,
  handleSaveArtComposition,
  handleSaveArtCompositions,
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
  runtimeCapabilities,
  sendArtAssetList,
  sendControllerLayouts,
  sendGameConstants,
  sendGameFlow,
  sendHostAudios,
  sendJson,
  sendLocalDraft,
  sendStageLayouts,
  sendRoomRuntimeContent,
  serveArtFile,
  serveBuildAsset,
  serveClientFile,
  serveIndex,
  serveRoomArtAsset,
  serveSharedFile,
});


const {
  sweepInactivePlayers
} = createInactivePlayerSweepRuntime({
  broadcastLobby,
  controllerTimeoutMs: CONTROLLER_TIMEOUT_MS,
  rooms,
  selectVip
});

async function initializeAuthoritativeToolSources() {
  await Promise.all([
    loadGameFlowSource({ refresh: true }),
    loadGameConstantsSource({ refresh: true }),
    loadStageLayoutsSource({ refresh: true }),
    loadControllerLayoutsSource({ refresh: true }),
    loadHostAudiosSource({ refresh: true }),
    loadArtManifestSource({ refresh: true })
  ]);
}

function logToolStorage(label, store) {
  console.log(`${label} storage: ${store.storageKind}`);
}

const webService = createWebServiceRuntime({
  router,
  port: PORT,
  host: HOST,
  initialize: initializeAuthoritativeToolSources,
  sweep: sweepInactivePlayers,
  sweepIntervalMs: 2000,
  onStarted({ localUrl, lanUrls }) {
      console.log(`Party Game Template server running at ${localUrl}`);
      for (const url of lanUrls) console.log(`LAN URL: ${url}`);
      logToolStorage("Game flow", gameFlowStore);
      logToolStorage("Game constants", gameConstantsStore);
      logToolStorage("Stage layouts", stageLayoutsStore);
      logToolStorage("Controller layouts", controllerLayoutsStore);
      logToolStorage("Host audio", hostAudiosStore);
      logToolStorage("Art manifest", artManifestStore);
  }
});

webService.start()
  .catch((error) => {
    if (error.code === "EADDRINUSE") {
      console.error(`Port ${PORT} is already in use. Try PORT=${PORT + 1} npm start`);
      process.exit(1);
    }
    console.error(`Authoritative game content failed to initialize: ${error.message}`);
    process.exit(1);
  });
