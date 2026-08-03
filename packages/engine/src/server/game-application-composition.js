"use strict";

const fs = require("node:fs");
const path = require("node:path");
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
  createBundleGameData,
  selectApplicationContentStores,
  createCraftingTimerRuntime,
  createDecisionActionNormalizationRuntime,
  createDecisionRuntime,
  createDraftPreviewRoomRuntime,
  createFlowNavigationRuntime,
  createFlowActionPublicRuntime,
  createFlowTargetRuntime,
  createGameFlowMergeRuntime,
  createGameFlowNormalizationRuntime,
  createGamePluginInputHandlersRuntime,
  createGameConstantsRuntime,
  createHostAudioRuntime,
  createHostAudioAssetsRuntime,
  createInactivePlayerSweepRuntime,
  createInputStateRuntime,
  createLobbyControlHandlersRuntime,
  createLobbyPayloadRuntime,
  createLivePrototypeHandlersRuntime,
  createLivePrototypeWorkspaceRuntime,
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
  createRevisionedToolAuthoringRuntime,
  createRouterRuntime,
  createStageActionHandlersRuntime,
  createStageEventsRuntime,
  createStaticFilesRuntime,
  createStartHandlersRuntime,
  createSurfaceProjectionRuntime,
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
  readBuildInfo,
  readJson,
  readJsonFile,
  resetGameSessionState,
  sendJson,
  writeJsonFile
} = require("@pop-party/engine/server");
const { createWebServiceRuntime } = require("@pop-party/engine/server/web-service");
const { defineGame } = require("@pop-party/engine/game");
const { createGameReadinessRuntime, createGameReleaseValidator } = require("@pop-party/engine/server/readiness");
const { ENGINE_CONTENT_SCHEMA_VERSION } = require("@pop-party/engine/content/schema");
const { createGithubStorageRuntime } = require("./github-storage-runtime");
const { createLayoutSyncRuntime } = require("./layout-sync-runtime");
const { createLocalDraftRuntime } = require("./local-draft-runtime");
const {
  createLivePrototypeRoomContentRuntime
} = require("./live-prototype-room-content-runtime");
const { createSaveHandlersRuntime } = require("./save-handlers-runtime");
const { createToolDataReadRuntime } = require("./tool-data-read-runtime");
const { createToolGithubSourcesRuntime } = require("./tool-github-sources-runtime");
const { createToolPersistenceRuntime } = require("./tool-persistence-runtime");
const { createToolSourceReadersRuntime } = require("./tool-source-readers-runtime");
const { createToolSourceStoresRuntime } = require("./tool-source-stores-runtime");
const {
  createGameActionExecutor,
  createGameInputRuntime,
  createGameRendererRuntime,
  createPluginInputActionDefinitions,
  createPluginFlowActionDefinitions,
  inputManifest,
  pluginFlowActionTypes
} = require("./game-plugin-abi-runtime");
const { createFlowActionRegistry } = require("../shared/flow-action-registry");
const { createContentAdminHandlersRuntime } = require("@pop-party/engine/content/admin");
const { createContentStoreEnvironmentRuntime } = require("@pop-party/engine/content/environment");
const { createLocalContentBundleProvider } = require("@pop-party/engine/content/local");
const { createAuthoringSessionContentRuntime } = require("./authoring-session-content-runtime");
const { refreshLocalContentBundle } = require("./local-content-bundle-writer");
const { createControllerLayoutNormalizationRuntime } = require("./application/controller-layout-normalization-runtime");
const { createControllerLayoutStateRuntime } = require("./application/controller-layout-state-runtime");
const { createArtAssetsRuntime } = require("./application/art-assets-runtime");
const { artRuntimeReferences } = require("./application/art-runtime-dependencies");
const { createLayoutNormalizationRuntime } = require("./application/layout-normalization-runtime");
const { createRoomContentPinRuntime } = require("@pop-party/engine/rooms/content-pin");
const { createRuntimeCapabilityRuntime } = require("@pop-party/engine/security/runtime-capabilities");
const { createStageTestConfigHandlerRuntime } = require("@pop-party/engine/testing");
const { createStageLayoutNormalizationRuntime } = require("./application/stage-layout-normalization-runtime");
const { createStageLayoutStateRuntime } = require("./application/stage-layout-state-runtime");

async function createGameApplicationComposition(options = {}) {

const GAME_DEFINITION = options.gameDefinition;
if (!GAME_DEFINITION) throw new Error("Game application composition requires a defined game");
const PORT = Number(options.port ?? process.env.PORT ?? 3000);
const HOST = String(options.host || process.env.HOST || "0.0.0.0");
const ROOT = path.resolve(options.workspaceRoot || process.cwd());
const PACKAGE_ROOT = path.resolve(__dirname, "../..");
const WEB_ROOT = path.resolve(options.webRoot || (fs.existsSync(path.join(PACKAGE_ROOT, "web", "index.html"))
  ? path.join(PACKAGE_ROOT, "web")
  : ROOT));
const CONTENT_ROOT = path.resolve(options.contentRoot || path.join(ROOT, "content"));
const AUTHORING_ROOT = path.resolve(options.authoringRoot || CONTENT_ROOT);
const INDEX_FILE = path.join(WEB_ROOT, "index.html");
const CLIENT_ROOT = path.join(WEB_ROOT, "client");
const BUILD_ASSETS_ROOT = path.join(WEB_ROOT, "dist", "client", "assets");
const SHARED_ROOT = path.join(WEB_ROOT, "shared");
const DEFAULT_GAME_FLOW_FILE = path.join(AUTHORING_ROOT, "flow.json");
const GAME_FLOW_FILE = path.resolve(AUTHORING_ROOT, process.env.GAME_FLOW_FILE || "flow.json");
const GAME_FLOW_BACKUP_DIR = path.join(ROOT, ".pop-party", "backups", "flow");
const DEFAULT_GAME_CONSTANTS_FILE = path.join(AUTHORING_ROOT, "constants.json");
const GAME_CONSTANTS_FILE = path.resolve(AUTHORING_ROOT, process.env.GAME_CONSTANTS_FILE || "constants.json");
const GAME_CONSTANTS_BACKUP_DIR = path.join(ROOT, ".pop-party", "backups", "constants");
const DEFAULT_STAGE_LAYOUTS_FILE = path.join(AUTHORING_ROOT, "layouts", "stage.json");
const STAGE_LAYOUTS_FILE = path.resolve(AUTHORING_ROOT, process.env.STAGE_LAYOUTS_FILE || "layouts/stage.json");
const STAGE_LAYOUTS_BACKUP_DIR = path.join(ROOT, ".pop-party", "backups", "stage-layouts");
const DEFAULT_CONTROLLER_LAYOUTS_FILE = path.join(AUTHORING_ROOT, "layouts", "controller.json");
const CONTROLLER_LAYOUTS_FILE = path.resolve(AUTHORING_ROOT, process.env.CONTROLLER_LAYOUTS_FILE || "layouts/controller.json");
const CONTROLLER_LAYOUTS_BACKUP_DIR = path.join(ROOT, ".pop-party", "backups", "controller-layouts");
const DEFAULT_HOST_AUDIOS_FILE = path.join(AUTHORING_ROOT, "audio", "host-audios.json");
const HOST_AUDIOS_FILE = path.resolve(AUTHORING_ROOT, process.env.HOST_AUDIOS_FILE || "audio/host-audios.json");
const HOST_AUDIOS_BACKUP_DIR = path.join(ROOT, ".pop-party", "backups", "host-audios");
const GAME_FLOW_GITHUB_TOKEN = process.env.GAME_FLOW_GITHUB_TOKEN || process.env.GITHUB_TOKEN || "";
const GAME_FLOW_STORAGE = String(process.env.GAME_FLOW_STORAGE || (GAME_FLOW_GITHUB_TOKEN ? "github" : "local")).toLowerCase();
const GAME_FLOW_GITHUB_REPO = process.env.GAME_FLOW_GITHUB_REPO
  || process.env.GITHUB_REPOSITORY
  || options.authoringRepository
  || "";
const GAME_FLOW_GITHUB_BRANCH = process.env.GAME_FLOW_GITHUB_BRANCH || "game-data";
const GAME_FLOW_GITHUB_BASE_BRANCH = process.env.GAME_FLOW_GITHUB_BASE_BRANCH || "main";
const GAME_FLOW_GITHUB_PATH = process.env.GAME_FLOW_GITHUB_PATH || "game-flow.json";
const GAME_CONSTANTS_GITHUB_PATH = process.env.GAME_CONSTANTS_GITHUB_PATH || "game-constants.json";
const STAGE_LAYOUTS_GITHUB_PATH = process.env.STAGE_LAYOUTS_GITHUB_PATH || "stage-layouts.json";
const CONTROLLER_LAYOUTS_GITHUB_PATH = process.env.CONTROLLER_LAYOUTS_GITHUB_PATH || "controller-layouts.json";
const HOST_AUDIOS_GITHUB_PATH = process.env.HOST_AUDIOS_GITHUB_PATH || "host-audios.json";
const ART_MANIFEST_GITHUB_PATH = process.env.ART_MANIFEST_GITHUB_PATH || "art-manifest.json";
const ART_ROOT = AUTHORING_ROOT;
const ART_DEFAULT_DIR = path.join(AUTHORING_ROOT, "blobs");
const ART_CUSTOM_DIR = path.join(AUTHORING_ROOT, "blobs");
const ART_MANIFEST_FILE = path.join(AUTHORING_ROOT, "art", "manifest.json");
const ADMIN_AUTH_MODE = String(process.env.PARTY_GAME_ADMIN_AUTH_MODE || "legacy-open").toLowerCase();
const RUNTIME_CAPABILITY_MODE = String(process.env.PARTY_GAME_RUNTIME_CAPABILITIES || "legacy").toLowerCase();
const SESSION_CONTENT_MODE = String(options.sessionContentMode || "published-release").toLowerCase();
if (!["published-release", "latest-saved-authoring"].includes(SESSION_CONTENT_MODE)) {
  throw new Error(`Unsupported session content mode: ${SESSION_CONTENT_MODE}`);
}
const AUTHORING_MODE = String(
  options.authoringMode || process.env.PARTY_GAME_AUTHORING_MODE || "standard"
).toLowerCase();
if (!["standard", "live-prototype"].includes(AUTHORING_MODE)) {
  throw new Error(`Unsupported authoring mode: ${AUTHORING_MODE}`);
}
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
  artAssetReplacements: null,
  artDeletedCompositionIds: null,
  binaryFiles: {}
};

function writeAuthoringJsonFile(filePath, value) {
  const result = writeJsonFile(filePath, value);
  const relative = path.relative(AUTHORING_ROOT, path.resolve(filePath));
  if (relative && !relative.startsWith("..") && !path.isAbsolute(relative)) {
    refreshLocalContentBundle(AUTHORING_ROOT);
  }
  return result;
}

const BUILD_INFO = readBuildInfo(ROOT);
const APP_VERSION = readAppVersion(ROOT);
const DEPLOYMENT_CHANNEL = String(
  process.env.PARTY_GAME_DEPLOYMENT_CHANNEL
    || (process.env.RENDER ? "production" : "development")
).trim().toLowerCase() || "development";
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
  adminAuthMode: ADMIN_AUTH_MODE,
  validateSnapshot: (snapshot) => {
    try {
      createBundleGameData(snapshot);
      return { ok: true, diagnostics: [] };
    } catch (error) {
      return {
        ok: false,
        diagnostics: [{ code: "CONTENT_GAME_DATA_INVALID", message: String(error?.message || error) }]
      };
    }
  }
});
const fallbackContentStore = contentEnvironment.contentStore || GAME_DEFINITION.content.store
  ? null
  : createLocalContentBundleProvider({
      root: CONTENT_ROOT,
      gameBuild: GAME_DEFINITION.version,
      engineVersion: GAME_DEFINITION.engineCompatibility,
      pluginVersion: GAME_DEFINITION.version
    });
const selectedContentStores = selectApplicationContentStores({
  environmentStore: contentEnvironment.contentStore,
  gameStore: GAME_DEFINITION.content.store,
  fallbackStore: fallbackContentStore
});
const contentStore = selectedContentStores.authoringStore;
const roomContentStore = selectedContentStores.roomStore;
const runtimeGameDefinition = defineGame({
  gameId: GAME_DEFINITION.gameId,
  displayName: GAME_DEFINITION.displayName,
  version: GAME_DEFINITION.version,
  engineCompatibility: GAME_DEFINITION.engineCompatibility,
  content: { mode: "bundle", schemaVersion: 1, store: roomContentStore },
  plugin: GAME_DEFINITION.plugin,
  semanticRoles: GAME_DEFINITION.semanticRoles
});
const runtimeReadiness = createGameReadinessRuntime({
  gameDefinition: runtimeGameDefinition,
  engineVersion: runtimeGameDefinition.engineCompatibility,
  contentSchemaVersion: ENGINE_CONTENT_SCHEMA_VERSION
});
const activeRuntime = await runtimeReadiness.check();
const {
  acceptedArtTypes,
  defaultArtCompositions,
  artAssets,
  artGroups,
  availableFlowActionTypes,
  availableFlowTransitions,
  defaultControllerLayouts,
  defaultGameConstants,
  defaultGameFlow,
  defaultHostAudios,
  defaultPlayerColors,
  defaultStageLayouts,
  multipleChoicePrompts
} = activeRuntime.gameData;
const pluginActionRegistrations = runtimeGameDefinition.registrations.actions || [];
const pluginInputRegistrations = runtimeGameDefinition.registrations.inputs || [];
const pluginInputManifests = pluginInputRegistrations.map(inputManifest);
const pluginActionDefinitions = [
  ...createPluginFlowActionDefinitions(pluginActionRegistrations),
  ...createPluginInputActionDefinitions(pluginInputRegistrations)
];
const pluginRegistrationIds = new Set([
  ...pluginActionRegistrations.map((registration) => registration.id),
  ...pluginInputRegistrations.map((registration) => registration.id)
]);
const runtimeAvailableFlowActionTypes = [
  ...availableFlowActionTypes.filter((item) => !pluginRegistrationIds.has(item.id)),
  ...pluginFlowActionTypes([...pluginActionRegistrations, ...pluginInputRegistrations])
];
const pluginAwareFlowRegistry = createFlowActionRegistry({}, pluginActionDefinitions);
const contentAdmin = contentEnvironment.remoteAuthoring === "enabled"
  ? createContentAdminHandlersRuntime({
      contentStore,
      readJson,
      sendJson,
      audit: (req, event) => adminAudit.record(req, event)
    })
  : null;
const durableToolAuthoring = contentEnvironment.remoteAuthoring === "enabled"
  ? createRevisionedToolAuthoringRuntime({
      contentStore,
      scope: process.env.PARTY_GAME_AUTHORING_SCOPE || "default"
    })
  : null;
const revisionedToolAuthoring = AUTHORING_MODE === "live-prototype"
  ? null
  : durableToolAuthoring;
if (revisionedToolAuthoring && SESSION_CONTENT_MODE === "latest-saved-authoring") {
  throw new Error(
    "Durable remote authoring cannot make public rooms use latest-saved-authoring; create authenticated draft preview rooms instead"
  );
}
const TOOL_STORAGE_KIND = AUTHORING_MODE === "live-prototype"
  ? "live-prototype"
  : revisionedToolAuthoring
    ? "github-app-draft"
    : GAME_FLOW_STORAGE;

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

const roomReleaseValidator = createGameReleaseValidator({
  gameDefinition: runtimeGameDefinition,
  engineVersion: runtimeGameDefinition.engineCompatibility,
  contentSchemaVersion: ENGINE_CONTENT_SCHEMA_VERSION
});
const publishedRoomContentPins = createRoomContentPinRuntime({
  contentStore: roomContentStore,
  gameId: runtimeGameDefinition.gameId,
  materializeGameData: materializeRuntimeGameData,
  validateRelease: roomReleaseValidator
});
const draftPreviewRooms = revisionedToolAuthoring
  ? createDraftPreviewRoomRuntime({
      contentStore,
      scope: process.env.PARTY_GAME_AUTHORING_SCOPE || "default",
      gameId: runtimeGameDefinition.gameId,
      gameBuild: runtimeGameDefinition.version,
      engineVersion: runtimeGameDefinition.engineCompatibility,
      pluginVersion: runtimeGameDefinition.version,
      materializeGameData: materializeRuntimeGameData,
      validateRelease: roomReleaseValidator
    })
  : null;
let authoringSessionContent = null;
let pinNewRoomForSession = (room) => publishedRoomContentPins.pinNewRoom(room);

const runtimeCapabilities = createRuntimeCapabilityRuntime({
  mode: RUNTIME_CAPABILITY_MODE,
  getExistingRoom,
  getRoom,
  normalizePlayerId,
  normalizeStageCode,
  readJson,
  sendJson,
  pinNewRoom: (room) => pinNewRoomForSession(room),
  pinPreviewRoom: draftPreviewRooms
    ? (room) => draftPreviewRooms.pinPreviewRoom(room)
    : null,
  deleteRoom: (stageCode) => rooms.delete(stageCode)
});

const {
  sendRoomRuntimeContent,
  serveRoomArtAsset,
  serveRoomHostAudio
} = createRoomRuntimeContentRuntime({
  getExistingRoom,
  normalizeStageCode,
  sendJson
});

const {
  activePlayers,
  selectVip
} = createPlayerStateRuntime({
  randomToken
});
const gameRendererRuntime = createGameRendererRuntime({
  activePlayers,
  currentAction: (room) => _currentRoomActionFn?.(room) || null,
  stageRenderers: runtimeGameDefinition.registrations.stageRenderers,
  controllerRenderers: runtimeGameDefinition.registrations.controllerRenderers
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
  availableFlowActionTypes: runtimeAvailableFlowActionTypes,
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
  normalizeVotingCardFilter,
  pluginActionDefinitions
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
  normalizeVotingCardFilter,
  pluginActionDefinitions
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

const surfaceProjectionRuntime = createSurfaceProjectionRuntime();

// broadcastLobby is used by early modules; lobbyPayload is wired up later via lazy getter.
const {
  broadcastLobby,
  sendSse
} = createRoomBroadcastRuntime({
  getLobbyPayload: () => lobbyPayload,
  markStagePublished: surfaceProjectionRuntime.markStagePublished,
  shouldPublishStage: surfaceProjectionRuntime.shouldPublishStage
});

async function broadcastArtAssetsChanged(payload) {
  if (authoringSessionContent) {
    try {
      await authoringSessionContent.refresh();
      for (const room of rooms.values()) {
        authoringSessionContent.prepareLobbySession(room);
        broadcastLobby(room);
      }
    } catch (error) {
      // The saved authoring data remains durable. A new session will fail
      // closed with the same diagnostic instead of reusing the older cache.
    }
  }
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
let _finalizeTextInputDraftsFn = () => 0;
const finalizeTextInputDraftsProxy = (room) => _finalizeTextInputDraftsFn(room);
let _applyRoomActionEffectsFn;
const applyRoomActionEffectsProxy = (room, action) => _applyRoomActionEffectsFn?.(room, action);
let _clearScheduledSubActionsFn = () => {};
const clearScheduledSubActionsProxy = (room) => _clearScheduledSubActionsFn(room);
let _clearGamePluginInputFn = () => {};
const clearGamePluginInputProxy = (room) => _clearGamePluginInputFn(room);
let _releasePendingFlowEventsFn;
const releasePendingFlowEventsProxy = (room) => _releasePendingFlowEventsFn?.(room) === true;
let _prepareLobbySessionFn = () => {};
const prepareLobbySessionProxy = (room) => _prepareLobbySessionFn(room);
let _refreshBeforeSessionBoundaryFn = async () => {};
const refreshBeforeSessionBoundaryProxy = (room) => _refreshBeforeSessionBoundaryFn(room);

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
  clearPluginInput: clearGamePluginInputProxy,
  clearTextInput,
  currentRoomAction: currentRoomActionProxy,
  enterGamePhase: enterGamePhaseProxy,
  releasePendingFlowEvents: releasePendingFlowEventsProxy,
  stageCompletionCleanupForActionType: pluginAwareFlowRegistry.stageCompletionCleanupForActionType
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
  semanticRoles: runtimeGameDefinition.semanticRoles
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
  semanticRoles: runtimeGameDefinition.semanticRoles
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

function materializeRuntimeGameData(snapshot) {
  const gameData = createBundleGameData(snapshot);
  return Object.freeze({
    ...gameData,
    defaultControllerLayouts: normalizeControllerLayouts(gameData.defaultControllerLayouts)
  });
}

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
  serveDurableArtAsset,
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
  loadArtManifestSource: () => loadArtManifestSource({
    refresh: ["github", "github-app-draft"].includes(artManifestStore.storageKind)
  }),
  loadArtDependencySources: async () => {
    const [stageLayouts, controllerLayouts, flow] = await Promise.all([
      loadStageLayoutsSource({
        refresh: ["github", "github-app-draft"].includes(stageLayoutsStore.storageKind)
      }),
      loadControllerLayoutsSource({
        refresh: ["github", "github-app-draft"].includes(controllerLayoutsStore.storageKind)
      }),
      loadGameFlowSource({
        refresh: ["github", "github-app-draft"].includes(gameFlowStore.storageKind)
      })
    ]);
    return {
      stageLayouts: localDraftStore.layouts || stageLayouts,
      controllerLayouts: localDraftStore.controllerLayouts || controllerLayouts,
      flow: localDraftStore.flow || flow,
      runtimeReferences: artRuntimeReferences(runtimeGameDefinition.semanticRoles)
    };
  },
  localDraftStore,
  manifestFile: ART_MANIFEST_FILE,
  onArtAssetsChanged: broadcastArtAssetsChanged,
  readJson,
  readAuthoringRevision: revisionedToolAuthoring
    ? () => artManifestStore.revision
    : null,
  readDurableDraft: revisionedToolAuthoring
    ? () => revisionedToolAuthoring.readDraft({ refresh: true })
    : null,
  sendJson,
  writeArtAssetBundle: revisionedToolAuthoring
    ? async ({ manifest, blobPath, bytes, expectedRevision, idempotencyKey }) => {
        const result = await revisionedToolAuthoring.writeFiles({
          [blobPath]: bytes,
          "art/manifest.json": manifest
        }, {
          expectedRevision,
          idempotencyKey,
          operation: "art-asset"
        });
        const savedManifest = result.snapshot.readJson("art/manifest.json");
        artManifestStore.source = savedManifest;
        artManifestStore.revision = result.revision;
        artManifestStore.loadedAt = Date.now();
        artManifestStore.error = "";
        return savedManifest;
      }
    : null,
  writeArtManifestSource: (manifest, metadata) => writeArtManifest(manifest, metadata)
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
  gameDefinition: runtimeGameDefinition,
  gamePluginRenderers: gameRendererRuntime.manifests,
  gamePluginInputs: pluginInputManifests,
  indexFile: INDEX_FILE,
  root: ROOT,
  sendJson,
  sharedRoot: SHARED_ROOT,
  viteManifestRoot: WEB_ROOT
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
  applyRoomActionEffects: applyRoomActionEffectsProxy,
  broadcastLobby,
  clearActionTimer,
  clearAppliedActionEffects,
  clearScheduledSubActions: clearScheduledSubActionsProxy,
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
  prepareLobbySession: prepareLobbySessionProxy,
  prepareVotingCards,
  resetCraftingTimer,
  resolveMomentRouteTarget,
  resolveMomentTargetStateId,
  runtimeGameFlow,
});
_enterGamePhaseFn = enterGamePhase;

let livePrototypeWorkspace = null;
let livePrototypeHandlers = null;
let livePrototypeRoomContent = null;
if (AUTHORING_MODE === "live-prototype") {
  if (!contentStore || typeof contentStore.commitWorkspace !== "function") {
    throw new Error("live-prototype authoring requires a durable revisioned content store");
  }
  livePrototypeRoomContent = createLivePrototypeRoomContentRuntime({
    broadcastLobby,
    enterLobbyPhase,
    materializeGameData: materializeRuntimeGameData,
    release: {
      gameId: runtimeGameDefinition.gameId,
      gameBuild: runtimeGameDefinition.version,
      engineVersion: runtimeGameDefinition.engineCompatibility,
      pluginVersion: runtimeGameDefinition.version
    },
    validateRelease: roomReleaseValidator
  });
  livePrototypeWorkspace = createLivePrototypeWorkspaceRuntime({
    acceptedArtTypes,
    contentStore,
    leaseMs: Number(process.env.PARTY_GAME_AUTHORING_LEASE_MS || 20000),
    localDraftStore,
    release: {
      gameId: runtimeGameDefinition.gameId,
      gameBuild: runtimeGameDefinition.version,
      engineVersion: runtimeGameDefinition.engineCompatibility,
      pluginVersion: runtimeGameDefinition.version
    },
    rooms,
    onSnapshotChanged: (snapshot) => installLivePrototypeToolSources(snapshot),
    validateSnapshot: (snapshot) => materializeRuntimeGameData(snapshot),
    installRoomSnapshot: livePrototypeRoomContent.installRoomSnapshot
  });
  livePrototypeHandlers = createLivePrototypeHandlersRuntime({
    workspace: livePrototypeWorkspace,
    readJson,
    sendJson
  });
  pinNewRoomForSession = (room) => livePrototypeWorkspace.pinNewRoom(room);
  _prepareLobbySessionFn = (room) => livePrototypeRoomContent.prepareLobbySession(room);
}

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
  finalizeTextInputDrafts: finalizeTextInputDraftsProxy,
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
  storageKind: TOOL_STORAGE_KIND
});

function installLivePrototypeToolSources(snapshot) {
  if (!snapshot) return;
  const loadedAt = Date.now();
  const values = [
    [gameFlowStore, normalizeGameFlow(snapshot.readJson("flow.json"))],
    [gameConstantsStore, normalizeGameConstants(snapshot.readJson("constants.json"))],
    [stageLayoutsStore, normalizeStageLayouts(snapshot.readJson("layouts/stage.json"))],
    [controllerLayoutsStore, normalizeControllerLayouts(snapshot.readJson("layouts/controller.json"))],
    [hostAudiosStore, normalizeHostAudios(snapshot.readJson("audio/host-audios.json"))],
    [artManifestStore, cloneJson(snapshot.readJson("art/manifest.json"))]
  ];
  for (const [store, source] of values) {
    store.source = source;
    store.revision = snapshot.revision;
    store.loadedAt = loadedAt;
    store.error = "";
  }
}

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
  revisionedAuthoring: revisionedToolAuthoring,
  stageLayoutsBackupDir: STAGE_LAYOUTS_BACKUP_DIR,
  stageLayoutsFile: STAGE_LAYOUTS_FILE,
  stageLayoutsGithubPath: STAGE_LAYOUTS_GITHUB_PATH,
  stageLayoutsStore,
  syncControllerLayoutsWithFlow,
  syncStageLayoutsWithFlow,
  writeGithubGameFlowSource,
  writeGithubJsonSource,
  writeJsonFile: writeAuthoringJsonFile,
});

const {
  handleUpload: handleUploadHostAudioAsset,
  serveDraftAsset: serveDraftHostAudioAsset
} = createHostAudioAssetsRuntime({
  authoring: revisionedToolAuthoring,
  livePrototype: livePrototypeWorkspace,
  hostAudiosStore,
  normalizeHostAudios,
  readJson,
  sendJson
});

if (SESSION_CONTENT_MODE === "latest-saved-authoring") {
  authoringSessionContent = createAuthoringSessionContentRuntime({
    authoringRoot: AUTHORING_ROOT,
    baseContentStore: roomContentStore,
    gameId: runtimeGameDefinition.gameId,
    gameBuild: runtimeGameDefinition.version,
    engineVersion: runtimeGameDefinition.engineCompatibility,
    pluginVersion: runtimeGameDefinition.version,
    loadArtManifest: loadArtManifestSource,
    loadConstants: loadGameConstantsSource,
    loadControllerLayouts: loadControllerLayoutsSource,
    loadFlow: loadGameFlowSource,
    loadHostAudios: loadHostAudiosSource,
    loadStageLayouts: loadStageLayoutsSource,
    materializeGameData: materializeRuntimeGameData,
    validateRelease: roomReleaseValidator
  });
  await authoringSessionContent.refresh();
  pinNewRoomForSession = (room) => authoringSessionContent.pinNewRoom(room);
  _prepareLobbySessionFn = (room) => {
    livePrototypeRoomContent?.prepareLobbySession(room);
    authoringSessionContent.prepareLobbySession(room);
  };
  _refreshBeforeSessionBoundaryFn = () => authoringSessionContent.refreshBeforeSessionBoundary();
}

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
  onDraftChanged: livePrototypeWorkspace
    ? ({ req }) => livePrototypeWorkspace.applyDraft(
        String(req.headers["x-pop-party-authoring-session"] || "")
      )
    : null,
  readGameFlow,
  readJson,
  resetCraftingTimer,
  onArtAssetsChanged: broadcastArtAssetsChanged,
  preserveActiveRooms: SESSION_CONTENT_MODE === "latest-saved-authoring" || Boolean(livePrototypeWorkspace),
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
  onSaved: async ({ label }) => {
    if (!authoringSessionContent) return;
    try {
      await authoringSessionContent.refresh();
      if (label === "Stage layouts" || label === "Controller layouts") {
        for (const room of rooms.values()) {
          authoringSessionContent.prepareLobbySession(room);
          broadcastLobby(room);
        }
      }
    } catch (error) {
      // Saving remains durable. The next session boundary will report the
      // invalid/unavailable snapshot instead of falling back to old content.
    }
  },
  preserveActiveRooms: SESSION_CONTENT_MODE === "latest-saved-authoring",
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
  availableFlowActionTypes: runtimeAvailableFlowActionTypes,
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
  applyRoomActionEffects,
  clearScheduledSubActions,
  scheduleRoomSubActions
} = createRoomActionEffectsRuntime({
  activePlayers,
  broadcastLobby,
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
  storeRandomTriviaPrompt,
  pluginActionDefinitions,
  executeGameAction: createGameActionExecutor({
    actionRegistrations: pluginActionRegistrations,
    activePlayers,
    broadcastLobby
  }).execute
});
_applyRoomActionEffectsFn = applyRoomActionEffects;
_clearScheduledSubActionsFn = clearScheduledSubActions;

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

const gameInputRuntime = createGameInputRuntime({
  inputRegistrations: pluginInputRegistrations,
  activePlayers,
  currentRoomAction,
  jumpToAction,
  broadcastLobby
});
_clearGamePluginInputFn = gameInputRuntime.clear;

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
  projectLobbyPayload: surfaceProjectionRuntime.project,
  resolveRoomActionText,
  runtimeGameFlow,
  gamePluginViewModels: gameRendererRuntime.viewModels,
  gamePluginInputPayload: gameInputRuntime.payloadForViewer,
  ensureGamePluginInput: gameInputRuntime.ensure,
  scheduleRoomSubActions,
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
  markStagePublished: surfaceProjectionRuntime.markStagePublished,
  sendJson,
  sendSse
});

const {
  handleGamePluginInput
} = createGamePluginInputHandlersRuntime({
  gameInputRuntime,
  getExistingRoom,
  lobbyPayload,
  normalizePlayerId,
  normalizeStageCode,
  readJson,
  sendJson
});

const {
  handleHeartbeat,
  handleJoin,
  handleLeave
} = createPlayerSessionHandlersRuntime({
  broadcastLobby,
  cleanPlayerName,
  getExistingRoom,
  getRoom,
  lobbyPayload,
  normalizePlayerId,
  normalizeStageCode,
  onPlayerDisconnected: gameInputRuntime.playerDisconnected,
  publicPlayer,
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
  controllerViewerPlayerId: (req, room, payload) => {
    const playerId = normalizePlayerId(payload?.playerId);
    return playerId && room.players.has(playerId) && runtimeCapabilities.verifyPlayer(req, room, playerId)
      ? playerId
      : "";
  },
  currentRoomAction,
  emitInputFlowEvent,
  getExistingRoom,
  lobbyPayload,
  normalizeStageCode,
  readJson,
  resolveRoomActionText,
  roomIsPaused,
  sendJson,
  isCompletableStageActionType: pluginAwareFlowRegistry.isCompletableStageActionType
});

const {
  finalizeTextInputDrafts,
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
_finalizeTextInputDraftsFn = finalizeTextInputDrafts;

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
  prepareQuitToLobby: refreshBeforeSessionBoundaryProxy,
  quitRoomToLobby,
  readJson,
  sendJson
});

const {
  router
} = createRouterRuntime({
  activeRelease: () => livePrototypeWorkspace?.state().release || activeRuntime.release,
  adminAuth,
  application: Object.freeze({
    version: APP_VERSION,
    commit: BUILD_INFO.commit,
    branch: BUILD_INFO.branch,
    channel: DEPLOYMENT_CHANNEL
  }),
  clonePrompt,
  contentAdmin,
  contentStatus: {
    mode: contentEnvironment.mode,
    remoteAuthoring: contentEnvironment.remoteAuthoring,
    enabled: contentEnvironment.enabled,
    authoringMode: AUTHORING_MODE
  },
  gameDefinition: runtimeGameDefinition,
  handleActionEffect,
  handleAdvancePresentation,
  handleCancelStart,
  handleCompleteAction,
  handleControllerChoice,
  handleControllerMicrophoneAccess,
  handleControllerTextSubmit,
  handleGamePluginInput,
  handleHeartbeat,
  handleInputEvent,
  handleJoin,
  handleLeave,
  livePrototype: livePrototypeHandlers,
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
  handleUploadHostAudioAsset,
  handleSaveStageLayouts,
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
  serveDurableArtAsset,
  serveBuildAsset,
  serveClientFile,
  serveIndex,
  serveRoomArtAsset,
  serveRoomHostAudio,
  serveDraftHostAudioAsset,
  serveSharedFile,
});


const {
  sweepInactivePlayers
} = createInactivePlayerSweepRuntime({
  broadcastLobby,
  controllerTimeoutMs: CONTROLLER_TIMEOUT_MS,
  onPlayerDisconnected: gameInputRuntime.playerDisconnected,
  rooms,
  selectVip
});

async function initializeAuthoritativeToolSources() {
  if (livePrototypeWorkspace) {
    await livePrototypeWorkspace.initialize();
    return;
  }
  if (revisionedToolAuthoring) await revisionedToolAuthoring.initialize();
  await Promise.all([
    loadGameFlowSource({ refresh: true }),
    loadGameConstantsSource({ refresh: true }),
    loadStageLayoutsSource({ refresh: true }),
    loadControllerLayoutsSource({ refresh: true }),
    loadHostAudiosSource({ refresh: true }),
    loadArtManifestSource({ refresh: true })
  ]);
}

const webService = createWebServiceRuntime({
  router,
  port: PORT,
  host: HOST,
  initialize: initializeAuthoritativeToolSources,
  sweep: () => {
    sweepInactivePlayers();
    if (livePrototypeWorkspace) {
      void livePrototypeWorkspace.sweep().catch(() => {});
    }
  },
  sweepIntervalMs: 2000,
  onStarted: options.onStarted
});

return Object.freeze({
  activeRuntime,
  runtimeGameDefinition,
  webService,
  start: () => webService.start(),
  stop: () => webService.stop(),
  get active() {
    return activeRuntime;
  },
  get lifecycle() {
    return webService.lifecycle;
  },
  get server() {
    return webService.server;
  },
  get startup() {
    return webService.startup;
  },
  get state() {
    return webService.lifecycle;
  }
});
}

module.exports = Object.freeze({ createGameApplicationComposition });
