const http = require("http");
const os = require("os");
const path = require("path");
const { createActionCompletionRuntime } = require("./server/action-completion-runtime");
const { createActionEffectStateRuntime } = require("./server/action-effect-state-runtime");
const { readAppVersion } = require("./server/app-version");
const { createControllerInputPayloadRuntime } = require("./server/controller-input-payload-runtime");
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
const { contentTypeForFile, readJson, sendJson } = require("./server/http-utils");
const { createInputStateRuntime } = require("./server/input-state-runtime");
const { createLayoutNormalizationRuntime } = require("./server/layout-normalization-runtime");
const { createLayoutSyncRuntime } = require("./server/layout-sync-runtime");
const { createLobbyPayloadRuntime } = require("./server/lobby-payload-runtime");
const { createLocalDraftRuntime } = require("./server/local-draft-runtime");
const { backupJsonFile, mirrorJsonFile, readJsonFile, writeJsonFile } = require("./server/local-json-store");
const { createPlayerAnswersRuntime } = require("./server/player-answers-runtime");
const { createPlayerPublicRuntime } = require("./server/player-public-runtime");
const { createPlayerSessionHandlersRuntime } = require("./server/player-session-handlers-runtime");
const { createPlayerStateRuntime } = require("./server/player-state-runtime");
const { createRoomActionEffectsRuntime } = require("./server/room-action-effects-runtime");
const { createRoomStateRuntime } = require("./server/room-state-runtime");
const { createSaveHandlersRuntime } = require("./server/save-handlers-runtime");
const { createStageActionHandlersRuntime } = require("./server/stage-action-handlers-runtime");
const { createStageEventsRuntime } = require("./server/stage-events-runtime");
const { createStaticFilesRuntime } = require("./server/static-files-runtime");
const { createStartHandlersRuntime } = require("./server/start-handlers-runtime");
const { createStageLayoutNormalizationRuntime } = require("./server/stage-layout-normalization-runtime");
const { createStageLayoutStateRuntime } = require("./server/stage-layout-state-runtime");
const { createToolDataReadRuntime } = require("./server/tool-data-read-runtime");
const { createToolGithubSourcesRuntime } = require("./server/tool-github-sources-runtime");
const { createToolSourceReadersRuntime } = require("./server/tool-source-readers-runtime");
const { createToolSourceStoresRuntime } = require("./server/tool-source-stores-runtime");
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
  artAssets,
  artGroups,
  availableFlowActionTypes,
  availableFlowTransitions,
  avatarShapes,
  defaultControllerLayouts,
  defaultGameConstants,
  defaultGameFlow,
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
const GAME_FLOW_GITHUB_TOKEN = process.env.GAME_FLOW_GITHUB_TOKEN || process.env.GITHUB_TOKEN || "";
const GAME_FLOW_STORAGE = String(process.env.GAME_FLOW_STORAGE || (GAME_FLOW_GITHUB_TOKEN ? "github" : "local")).toLowerCase();
const GAME_FLOW_GITHUB_REPO = process.env.GAME_FLOW_GITHUB_REPO || process.env.GITHUB_REPOSITORY || "MarkTurowetz/pop-party";
const GAME_FLOW_GITHUB_BRANCH = process.env.GAME_FLOW_GITHUB_BRANCH || "game-data";
const GAME_FLOW_GITHUB_BASE_BRANCH = process.env.GAME_FLOW_GITHUB_BASE_BRANCH || "main";
const GAME_FLOW_GITHUB_PATH = process.env.GAME_FLOW_GITHUB_PATH || "game-flow.json";
const GAME_CONSTANTS_GITHUB_PATH = process.env.GAME_CONSTANTS_GITHUB_PATH || "game-constants.json";
const STAGE_LAYOUTS_GITHUB_PATH = process.env.STAGE_LAYOUTS_GITHUB_PATH || "stage-layouts.json";
const CONTROLLER_LAYOUTS_GITHUB_PATH = process.env.CONTROLLER_LAYOUTS_GITHUB_PATH || "controller-layouts.json";
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
  controllerLayouts: null
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
  normalizePlayerFilter,
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

const {
  clearActionTimer,
  completeCurrentAction
} = createActionCompletionRuntime({
  advanceRoomAfterAction,
  broadcastLobby,
  clearChoiceInput,
  clearTextInput,
  currentRoomAction,
  enterGamePhase
});

const {
  clearCountdownTimer,
  enterStartingPhase
} = createCountdownRuntime({
  broadcastLobby,
  completeCountdownTrigger,
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
  handleReplaceArtAsset,
  sendArtAssetList,
  serveArtFile
} = createArtAssetsRuntime({
  acceptedArtTypes,
  artAssets,
  artGroups,
  artRoot: ART_ROOT,
  contentTypeForFile,
  customDir: ART_CUSTOM_DIR,
  defaultDir: ART_DEFAULT_DIR,
  manifestFile: ART_MANIFEST_FILE,
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
  emitInputFlowEvent
});

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
  readDefaultStageLayoutsSource,
  readLocalControllerLayoutsSource,
  readLocalGameConstantsSource,
  readLocalGameFlowSource,
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
  defaultStageLayouts,
  defaultStageLayoutsFile: DEFAULT_STAGE_LAYOUTS_FILE,
  gameConstantsFile: GAME_CONSTANTS_FILE,
  gameFlowFile: GAME_FLOW_FILE,
  normalizeControllerLayouts,
  normalizeGameConstants,
  normalizeStageLayouts,
  readJsonFile,
  stageLayoutsFile: STAGE_LAYOUTS_FILE
});

const {
  controllerLayoutsStore,
  gameConstantsStore,
  gameFlowStore,
  stageLayoutsStore
} = createToolSourceStoresRuntime({
  readLocalControllerLayoutsSource,
  readLocalGameConstantsSource,
  readLocalGameFlowSource,
  readLocalStageLayoutsSource,
  storageKind: GAME_FLOW_STORAGE
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
  handleSaveStageLayouts
} = createSaveHandlersRuntime({
  broadcastLobby,
  clearActionTimer,
  clearAppliedActionEffects,
  controllerLayoutsStore,
  gameConstantsStore,
  gameFlowStore,
  hasGithubToken: () => Boolean(GAME_FLOW_GITHUB_TOKEN),
  localDraftStore,
  normalizeGameFlow,
  readJson,
  resetCraftingTimer,
  rooms,
  sendJson,
  stageLayoutsStore,
  writeControllerLayouts,
  writeGameConstants,
  writeGameFlow,
  writeStageLayouts
});

const {
  sendControllerLayouts,
  sendGameConstants,
  sendGameFlow,
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
  loadControllerLayoutsSource,
  loadGameConstantsSource,
  loadGameFlowSource,
  loadStageLayoutsSource,
  localDraftStore,
  normalizeGameConstants,
  normalizeGameFlow,
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

async function loadGameConstantsSource({ refresh = false } = {}) {
  if (gameConstantsStore.storageKind !== "github") {
    gameConstantsStore.source = readLocalGameConstantsSource();
    gameConstantsStore.loadedAt = Date.now();
    gameConstantsStore.error = "";
    return readGameConstantsSource();
  }

  if (!refresh && gameConstantsStore.loadedAt) return readGameConstantsSource();
  if (!GAME_FLOW_GITHUB_TOKEN) {
    gameConstantsStore.error = "GAME_FLOW_GITHUB_TOKEN is not configured; using local fallback.";
    return readGameConstantsSource();
  }

  try {
    const remote = await readGithubJsonSource(GAME_CONSTANTS_GITHUB_PATH);
    if (remote?.data) {
      gameConstantsStore.source = normalizeGameConstants(remote.data);
      gameConstantsStore.remoteSha = remote.sha || "";
    } else {
      const seeded = await writeGithubJsonSource(readGameConstantsSource(), "", GAME_CONSTANTS_GITHUB_PATH, "Save game constants");
      gameConstantsStore.source = normalizeGameConstants(seeded.data);
      gameConstantsStore.remoteSha = seeded.sha || "";
    }
    gameConstantsStore.loadedAt = Date.now();
    gameConstantsStore.error = "";
  } catch (error) {
    gameConstantsStore.error = `GitHub constants storage unavailable: ${error.message}`;
  }

  return readGameConstantsSource();
}

async function writeGameConstants(constants) {
  const normalized = normalizeGameConstants(constants);
  backupJsonFile(GAME_CONSTANTS_FILE, GAME_CONSTANTS_BACKUP_DIR, "game-constants");
  if (gameConstantsStore.storageKind === "github") {
    if (!GAME_FLOW_GITHUB_TOKEN) {
      throw new Error("GAME_FLOW_GITHUB_TOKEN is not configured. Refusing to save to ephemeral local storage.");
    }
    const saved = await writeGithubJsonSource(normalized, gameConstantsStore.remoteSha, GAME_CONSTANTS_GITHUB_PATH, "Save game constants");
    gameConstantsStore.source = normalizeGameConstants(saved.data);
    gameConstantsStore.remoteSha = saved.sha || "";
    gameConstantsStore.loadedAt = Date.now();
    gameConstantsStore.error = "";
    mirrorJsonFile(GAME_CONSTANTS_FILE, gameConstantsStore.source);
    return readGameConstantsSource();
  }
  writeJsonFile(GAME_CONSTANTS_FILE, normalized);
  gameConstantsStore.source = normalized;
  gameConstantsStore.loadedAt = Date.now();
  return readGameConstantsSource();
}

async function loadStageLayoutsSource({ refresh = false } = {}) {
  if (stageLayoutsStore.storageKind !== "github") {
    stageLayoutsStore.source = readLocalStageLayoutsSource();
    stageLayoutsStore.loadedAt = Date.now();
    stageLayoutsStore.error = "";
    return readStageLayoutsSource();
  }

  if (!refresh && stageLayoutsStore.loadedAt) return readStageLayoutsSource();
  if (!GAME_FLOW_GITHUB_TOKEN) {
    stageLayoutsStore.error = "GAME_FLOW_GITHUB_TOKEN is not configured; using local fallback.";
    return readStageLayoutsSource();
  }

  try {
    const remote = await readGithubJsonSource(STAGE_LAYOUTS_GITHUB_PATH);
    if (remote?.data) {
      stageLayoutsStore.source = normalizeStageLayouts(remote.data);
      stageLayoutsStore.remoteSha = remote.sha || "";
    } else {
      const seeded = await writeGithubJsonSource(readStageLayoutsSource(), "", STAGE_LAYOUTS_GITHUB_PATH, "Save stage layouts");
      stageLayoutsStore.source = normalizeStageLayouts(seeded.data);
      stageLayoutsStore.remoteSha = seeded.sha || "";
    }
    stageLayoutsStore.loadedAt = Date.now();
    stageLayoutsStore.error = "";
  } catch (error) {
    stageLayoutsStore.error = `GitHub layout storage unavailable: ${error.message}`;
  }

  return readStageLayoutsSource();
}

async function writeStageLayouts(layouts) {
  const flow = await loadGameFlowSource({ refresh: gameFlowStore.storageKind === "github" });
  const normalized = syncStageLayoutsWithFlow(layouts, flow);
  backupJsonFile(STAGE_LAYOUTS_FILE, STAGE_LAYOUTS_BACKUP_DIR, "stage-layouts");
  if (stageLayoutsStore.storageKind === "github") {
    if (!GAME_FLOW_GITHUB_TOKEN) {
      throw new Error("GAME_FLOW_GITHUB_TOKEN is not configured. Refusing to save to ephemeral local storage.");
    }
    const saved = await writeGithubJsonSource(normalized, stageLayoutsStore.remoteSha, STAGE_LAYOUTS_GITHUB_PATH, "Save stage layouts");
    stageLayoutsStore.source = normalizeStageLayouts(saved.data);
    stageLayoutsStore.remoteSha = saved.sha || "";
    stageLayoutsStore.loadedAt = Date.now();
    stageLayoutsStore.error = "";
    mirrorJsonFile(STAGE_LAYOUTS_FILE, stageLayoutsStore.source);
    return readStageLayoutsSource();
  }
  writeJsonFile(STAGE_LAYOUTS_FILE, normalized);
  stageLayoutsStore.source = normalized;
  stageLayoutsStore.loadedAt = Date.now();
  return readStageLayoutsSource();
}

async function loadControllerLayoutsSource({ refresh = false } = {}) {
  if (controllerLayoutsStore.storageKind !== "github") {
    controllerLayoutsStore.source = readLocalControllerLayoutsSource();
    controllerLayoutsStore.loadedAt = Date.now();
    controllerLayoutsStore.error = "";
    return readControllerLayoutsSource();
  }

  if (!refresh && controllerLayoutsStore.loadedAt) return readControllerLayoutsSource();
  if (!GAME_FLOW_GITHUB_TOKEN) {
    controllerLayoutsStore.error = "GAME_FLOW_GITHUB_TOKEN is not configured; using local fallback.";
    return readControllerLayoutsSource();
  }

  try {
    const remote = await readGithubJsonSource(CONTROLLER_LAYOUTS_GITHUB_PATH);
    if (remote?.data) {
      controllerLayoutsStore.source = normalizeControllerLayouts(remote.data);
      controllerLayoutsStore.remoteSha = remote.sha || "";
    } else {
      const seeded = await writeGithubJsonSource(readControllerLayoutsSource(), "", CONTROLLER_LAYOUTS_GITHUB_PATH, "Save controller layouts");
      controllerLayoutsStore.source = normalizeControllerLayouts(seeded.data);
      controllerLayoutsStore.remoteSha = seeded.sha || "";
    }
    controllerLayoutsStore.loadedAt = Date.now();
    controllerLayoutsStore.error = "";
  } catch (error) {
    controllerLayoutsStore.error = `GitHub controller layout storage unavailable: ${error.message}`;
  }

  return readControllerLayoutsSource();
}

async function writeControllerLayouts(layouts) {
  const flow = await loadGameFlowSource({ refresh: gameFlowStore.storageKind === "github" });
  const normalized = syncControllerLayoutsWithFlow(layouts, flow);
  backupJsonFile(CONTROLLER_LAYOUTS_FILE, CONTROLLER_LAYOUTS_BACKUP_DIR, "controller-layouts");
  if (controllerLayoutsStore.storageKind === "github") {
    if (!GAME_FLOW_GITHUB_TOKEN) {
      throw new Error("GAME_FLOW_GITHUB_TOKEN is not configured. Refusing to save to ephemeral local storage.");
    }
    const saved = await writeGithubJsonSource(normalized, controllerLayoutsStore.remoteSha, CONTROLLER_LAYOUTS_GITHUB_PATH, "Save controller layouts");
    controllerLayoutsStore.source = normalizeControllerLayouts(saved.data);
    controllerLayoutsStore.remoteSha = saved.sha || "";
    controllerLayoutsStore.loadedAt = Date.now();
    controllerLayoutsStore.error = "";
    mirrorJsonFile(CONTROLLER_LAYOUTS_FILE, controllerLayoutsStore.source);
    return readControllerLayoutsSource();
  }
  writeJsonFile(CONTROLLER_LAYOUTS_FILE, normalized);
  controllerLayoutsStore.source = normalized;
  controllerLayoutsStore.loadedAt = Date.now();
  return readControllerLayoutsSource();
}

async function loadGameFlowSource({ refresh = false } = {}) {
  if (gameFlowStore.storageKind !== "github") {
    gameFlowStore.source = readLocalGameFlowSource();
    gameFlowStore.loadedAt = Date.now();
    gameFlowStore.error = "";
    return readGameFlowSource();
  }

  if (!refresh && gameFlowStore.loadedAt) return readGameFlowSource();
  if (!GAME_FLOW_GITHUB_TOKEN) {
    gameFlowStore.error = "GAME_FLOW_GITHUB_TOKEN is not configured; using local fallback.";
    return readGameFlowSource();
  }

  try {
    const remote = await readGithubGameFlowSource();
    if (remote?.flow) {
      gameFlowStore.source = remote.flow;
      gameFlowStore.remoteSha = remote.sha || "";
    } else {
      const seeded = await writeGithubGameFlowSource(readGameFlowSource(), "");
      gameFlowStore.source = seeded.flow;
      gameFlowStore.remoteSha = seeded.sha || "";
    }
    gameFlowStore.loadedAt = Date.now();
    gameFlowStore.error = "";
  } catch (error) {
    gameFlowStore.error = `GitHub flow storage unavailable: ${error.message}`;
  }

  return readGameFlowSource();
}

async function writeGameFlow(flow) {
  const existingFlow = await loadGameFlowSource({ refresh: true });
  const merged = mergeFlowWithExistingSubActions(flow, existingFlow);
  normalizeGameFlow(merged);
  backupJsonFile(GAME_FLOW_FILE, GAME_FLOW_BACKUP_DIR, "game-flow");
  if (gameFlowStore.storageKind === "github") {
    if (!GAME_FLOW_GITHUB_TOKEN) {
      throw new Error("GAME_FLOW_GITHUB_TOKEN is not configured. Refusing to save to ephemeral local storage.");
    }
    const saved = await writeGithubGameFlowSource(merged, gameFlowStore.remoteSha);
    gameFlowStore.source = saved.flow;
    gameFlowStore.remoteSha = saved.sha || "";
    gameFlowStore.loadedAt = Date.now();
    gameFlowStore.error = "";
    mirrorJsonFile(GAME_FLOW_FILE, saved.flow);
    return saved.flow;
  }
  writeJsonFile(GAME_FLOW_FILE, merged);
  gameFlowStore.source = merged;
  gameFlowStore.loadedAt = Date.now();
  return merged;
}

function readDefaultGameFlow() {
  return normalizeGameFlow(readDefaultGameFlowSource());
}

function currentRoomAction(room) {
  if (room.presentedAction) return room.presentedAction;
  const actions = getStateActions(room.phase, room);
  if (room.actionIndex >= actions.length) return null;
  let guard = 0;
  while (actions[room.actionIndex]?.type === "decision" && guard < 20) {
    clearAppliedActionEffects(room);
    const nextActionIndex = resolveDecisionActionIndex(room, actions[room.actionIndex]);
    if (nextActionIndex === null) return null;
    room.actionIndex = Math.max(0, Math.min(actions.length, nextActionIndex));
    guard += 1;
    if (room.actionIndex >= actions.length) return null;
  }
  return publicFlowAction(actions[room.actionIndex], room.actionIndex);
}

function advanceRoomAfterAction(room, action) {
  const target = action?.nextTargetActionId || "";
  if (isNoActionTarget(target)) return;
  if (isReturnActionTarget(target)) {
    advanceRoomFromMomentReturn(room);
    return;
  }
  const targetIndex = flowActionIndexById(room, target);
  if (targetIndex >= 0) {
    room.actionIndex = targetIndex;
    return;
  }
  if (target) return;
  room.lastDecisionTrace = {
    actionId: action?.id || "",
    actionName: action?.name || "",
    selectedTarget: "none",
    haltReason: "No Matching Branch",
    activePlayerCount: activePlayers(room).length,
    evaluatedAt: Date.now()
  };
}

function advanceRoomFromMomentReturn(room) {
  const state = runtimeGameFlow(room).states.find((item) => item.id === room.phase);
  const targetStateId = normalizeFlowId(state?.nextStateTargetId, "");
  if (!targetStateId || isNoActionTarget(targetStateId)) return;
  if (runtimeGameFlow(room).states.some((item) => item.id === targetStateId)) {
    enterGamePhase(room, targetStateId);
  }
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
  revealVotingResults,
  seedDisplayedPlayerAnswers,
  setCraftingTimerShown,
  setVotingCardsShown,
  startCraftingTimer,
  storeRandomTriviaPrompt
});

function countdownTargetState(room) {
  const lobbyState = getFlowState(runtimeGameFlow(room), "lobby");
  const action = lobbyState?.actions.find((item) => item.type === "transitionState" && item.trigger === "onCountdownComplete");
  return action?.targetState || "intro";
}

function completeCountdownTrigger(room) {
  const lobbyState = getFlowState(runtimeGameFlow(room), "lobby");
  const action = lobbyState?.actions.find((item) => item.type === "transitionState" && item.trigger === "onCountdownComplete");
  if (!action) {
    enterGamePhase(room, "intro");
    return;
  }
  if (action.nextTargetActionId) {
    room.phase = lobbyState.id;
    room.actionIndex = Math.max(0, lobbyState.actions.findIndex((item) => item.id === action.id));
    room.currentPresentationActionId = "";
    room.currentDisplayTextActionId = "";
    clearActionTimer(room);
    advanceRoomAfterAction(room, action);
    currentRoomAction(room);
    broadcastLobby(room);
    return;
  }
  enterGamePhase(room, action.targetState || "intro");
}

function jumpToAction(room, actionId, fallbackIndex = room.actionIndex + 1) {
  if (isReturnActionTarget(actionId)) {
    room.presentedAction = null;
    clearActiveInputFlowEvent(room);
    clearAppliedActionEffects(room);
    advanceRoomFromMomentReturn(room);
    return;
  }
  const targetIndex = flowActionIndexById(room, actionId);
  room.presentedAction = null;
  clearActiveInputFlowEvent(room);
  clearAppliedActionEffects(room);
  room.actionIndex = targetIndex >= 0 ? targetIndex : fallbackIndex;
}

function emitInputFlowEvent(room, eventType) {
  clearAnswersSubmittedAdvanceTimer(room);
  const fallbackIndex = room.actionIndex + 1;
  const currentAction = currentRoomAction(room);
  const target = flowEventTargetForAction(currentAction, eventType);
  const eventKey = `${currentAction?.id || "none"}:${eventType}`;
  if (!currentAction || room.activeInputFlowEventKey === eventKey || isNoActionTarget(target)) {
    return false;
  }
  room.activeInputFlowEventKey = eventKey;
  if (room.craftingTimerRunning) {
    pauseCraftingTimer(room);
  } else {
    clearCraftingTimerTimeout(room);
  }
  if (eventType === "timerEnd") {
    room.craftingTimerRemainingMs = 0;
    room.craftingTimerEndHandled = true;
  }
  clearChoiceInput(room);
  clearTextInput(room);
  clearVotingInput(room);
  jumpToAction(room, target, fallbackIndex);
  broadcastLobby(room);
  return true;
}

function scheduleAnswersSubmittedAdvance(room) {
  if (room.answersSubmittedAdvanceTimerId) return;
  const currentAction = currentRoomAction(room);
  const target = flowEventTargetForAction(currentAction, "allPlayersSubmitted");
  if (isNoActionTarget(target)) return;
  room.answersSubmittedAdvanceTimerId = setTimeout(() => {
    room.answersSubmittedAdvanceTimerId = null;
    emitInputFlowEvent(room, "allPlayersSubmitted");
  }, 500);
}

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

function sendSse(client, event, data) {
  client.write(`event: ${event}\n`);
  client.write(`data: ${JSON.stringify(data)}\n\n`);
}

function broadcastLobby(room) {
  room.revision += 1;
  const payload = lobbyPayload(room);
  for (const client of room.stageClients) {
    sendSse(client, "lobby", payload);
  }
}

function enterLobbyPhase(room) {
  clearCountdownTimer(room);
  clearActionTimer(room);
  room.phase = "lobby";
  room.countdownStartedAt = 0;
  room.countdownEndsAt = 0;
  room.actionIndex = 0;
  room.presentedAction = null;
  room.lastDecisionTrace = null;
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
  room.countdownStartedAt = 0;
  room.countdownEndsAt = 0;
  const entryActionIndex = entryActionIndexForPhase(room, phase);
  room.actionIndex = entryActionIndex === -1
    ? getStateActions(phase, room).length
    : Math.max(0, entryActionIndex);
  room.presentedAction = null;
  room.lastDecisionTrace = null;
  clearAppliedActionEffects(room);
  room.playersShown = true;
  room.playerAnswersShown = true;
  room.playerAnswersVisibleFilter = "all";
  room.pendingPointPopups = [];
  resetCraftingTimer(room);
  clearChoiceInput(room);
  clearTextInput(room);
  clearVotingInput(room);
  clearDisplayedPlayerAnswers(room);
  if (isRoundIntroStateId(phase) && previousPhase !== phase) {
    if (room.hasEnteredRoundIntro) {
      room.currentRound += 1;
    } else {
      room.currentRound = 1;
      room.hasEnteredRoundIntro = true;
    }
  }
  if (entryActionIndex === -2) {
    advanceRoomFromMomentReturn(room);
    return;
  }
  broadcastLobby(room);
}

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

async function handleControllerChoice(req, res) {
  let payload;
  try {
    payload = await readJson(req);
  } catch (error) {
    sendJson(res, 400, { ok: false, error: "Invalid JSON payload" });
    return;
  }

  const stageCode = normalizeStageCode(payload.stageCode);
  const playerId = normalizePlayerId(payload.playerId);
  const room = getExistingRoom(stageCode);
  const player = room?.players.get(playerId);
  if (!room || !player || !player.active) {
    sendJson(res, 404, { ok: false, error: "Player is not in this lobby" });
    return;
  }

  const currentAction = resolveRoomActionText(currentRoomAction(room), room);
  if (!currentAction || (currentAction.type !== "multipleChoiceInput" && currentAction.type !== "triviaInput" && currentAction.type !== "voteOnAnswersInput")) {
    sendJson(res, 409, { ok: false, error: "No active choice input" });
    return;
  }
  applyChoiceInputAction(room, currentAction);
  if (payload.actionId && payload.actionId !== room.choiceInputActionId) {
    sendJson(res, 409, { ok: false, error: "Choice input is stale" });
    return;
  }

  const optionIndex = Math.floor(Number(payload.optionIndex));
  if (!Number.isFinite(optionIndex) || optionIndex < 0 || optionIndex >= room.choiceInputOptions.length) {
    if (room.choiceInputKind !== "vote") {
      sendJson(res, 400, { ok: false, error: "Choice option is not valid" });
      return;
    }
  }

  const existingAnswer = room.choiceInputAnswers.get(playerId) || null;
  if (room.choiceInputKind === "vote") {
    const eligibleCards = (room.votingCards || []).filter((card) => card && card.authorPlayerId !== playerId);
    const requestedCardId = String(payload.cardId || "");
    const card = eligibleCards.find((item) => item.id === requestedCardId) || eligibleCards[optionIndex] || null;
    if (!card) {
      sendJson(res, 400, { ok: false, error: "Vote option is not valid" });
      return;
    }
    if (existingAnswer?.done) {
      sendJson(res, 200, { ok: true, lobby: lobbyPayload(room) });
      return;
    }
    const answer = {
      optionIndex,
      cardId: card.id,
      text: card.text,
      answeredAt: Date.now(),
      done: true,
      nonce: Date.now()
    };
    room.choiceInputAnswers.set(playerId, answer);
    room.votingAnswers.set(playerId, answer);
    card.voterIds = Array.isArray(card.voterIds) ? card.voterIds.filter((id) => id !== playerId) : [];
    card.voterIds.push(playerId);
    card.voteCount = card.voterIds.length;
    broadcastLobby(room);
    if (allActivePlayersHaveSubmittedInput(room)) {
      scheduleAnswersSubmittedAdvance(room);
    }
    sendJson(res, 200, { ok: true, lobby: lobbyPayload(room) });
    return;
  }
  if (room.choiceInputMode === "submitOnce" && existingAnswer?.done) {
    sendJson(res, 200, { ok: true, lobby: lobbyPayload(room) });
    return;
  }
  if (room.choiceInputMode === "singleSelect" && existingAnswer?.optionIndex === optionIndex) {
    if (room.choiceInputLocked) {
      sendJson(res, 200, { ok: true, lobby: lobbyPayload(room) });
      return;
    }
    room.choiceInputAnswers.delete(playerId);
    forgetDisplayedPlayerAnswer(room, playerId);
    broadcastLobby(room);
    sendJson(res, 200, { ok: true, lobby: lobbyPayload(room) });
    return;
  }

  const originalOptionIndex = Number(room.choiceInputOriginalIndexes?.[optionIndex] ?? optionIndex);
  const isTrivia = room.choiceInputKind === "trivia";
  const correct = isTrivia && Number.isFinite(Number(room.choiceInputCorrectAnswerIndex))
    ? originalOptionIndex === Number(room.choiceInputCorrectAnswerIndex)
    : null;
  const answer = {
    optionIndex,
    originalOptionIndex,
    text: room.choiceInputOptions[optionIndex],
    answeredAt: Date.now(),
    done: room.choiceInputMode === "submitOnce",
    correct,
    nonce: Date.now()
  };
  room.choiceInputAnswers.set(playerId, answer);
  displayedAnswerCorrectness(room).delete(playerId);
  room.playerAnswerRecords = room.playerAnswerRecords || {};
  room.playerAnswerRecords[playerId] = {
    playerId,
    actionId: room.choiceInputActionId,
    contentId: room.choiceInputContentId,
    optionIndex,
    originalOptionIndex,
    text: answer.text,
    correct,
    answeredAt: answer.answeredAt
  };
  updatePlayerAnswerGroups(room);

  broadcastLobby(room);
  if (allActivePlayersHaveSubmittedInput(room)) {
    scheduleAnswersSubmittedAdvance(room);
  }
  sendJson(res, 200, { ok: true, lobby: lobbyPayload(room) });
}

async function handleControllerTextSubmit(req, res) {
  let payload;
  try {
    payload = await readJson(req);
  } catch (error) {
    sendJson(res, 400, { ok: false, error: "Invalid JSON payload" });
    return;
  }

  const stageCode = normalizeStageCode(payload.stageCode);
  const playerId = normalizePlayerId(payload.playerId);
  const room = getExistingRoom(stageCode);
  const player = room?.players.get(playerId);
  if (!room || !player || !player.active) {
    sendJson(res, 404, { ok: false, error: "Player is not in this lobby" });
    return;
  }

  const currentAction = resolveRoomActionText(currentRoomAction(room), room);
  if (!currentAction || currentAction.type !== "textSubmissionInput") {
    sendJson(res, 409, { ok: false, error: "No active text input" });
    return;
  }
  applyTextInputAction(room, currentAction);
  if (payload.actionId && payload.actionId !== room.textInputActionId) {
    sendJson(res, 409, { ok: false, error: "Text input is stale" });
    return;
  }

  const submittedText = cleanSubmittedText(payload.text, room.textInputCharacterLimit || 240);
  const isValid = Boolean(submittedText) && !/\d/.test(submittedText);
  if (!isValid) {
    forgetDisplayedPlayerAnswer(room, playerId);
    room.textInputAnswers.set(playerId, {
      text: "",
      invalid: true,
      done: false,
      nonce: Date.now()
    });
    broadcastLobby(room);
    sendJson(res, 200, { ok: true, valid: false, lobby: lobbyPayload(room) });
    return;
  }

  const answer = {
    text: submittedText,
    invalid: false,
    done: true,
    nonce: Date.now()
  };
  room.textInputAnswers.set(playerId, answer);
  room.playerAnswerRecords = room.playerAnswerRecords || {};
  room.playerAnswerRecords[playerId] = {
    playerId,
    actionId: room.textInputActionId,
    contentId: "",
    optionIndex: null,
    originalOptionIndex: null,
    text: answer.text,
    correct: null,
    answeredAt: answer.nonce
  };
  updatePlayerAnswerGroups(room);
  broadcastLobby(room);
  if (allActivePlayersHaveSubmittedInput(room)) {
    scheduleAnswersSubmittedAdvance(room);
  }
  sendJson(res, 200, { ok: true, valid: true, lobby: lobbyPayload(room) });
}

async function handleQuitToLobby(req, res) {
  let payload;
  try {
    payload = await readJson(req);
  } catch (error) {
    sendJson(res, 400, { ok: false, error: "Invalid JSON payload" });
    return;
  }

  const stageCode = normalizeStageCode(payload.stageCode);
  const room = getExistingRoom(stageCode);
  if (!room) {
    sendJson(res, 404, { ok: false, error: "Room not found" });
    return;
  }

  quitRoomToLobby(room);
  sendJson(res, 200, { ok: true, lobby: lobbyPayload(room) });
}

async function handleStageTestConfig(req, res, stageCode) {
  let payload;
  try {
    payload = await readJson(req);
  } catch (error) {
    sendJson(res, 400, { ok: false, error: "Invalid JSON payload" });
    return;
  }

  const room = getRoom(stageCode);
  if (payload.clearFlow) {
    room.runtimeFlowOverride = null;
  } else if (payload.flow) {
    try {
      room.runtimeFlowOverride = normalizeGameFlow(payload.flow);
    } catch (error) {
      sendJson(res, 400, { ok: false, error: `Test flow is invalid: ${error.message}` });
      return;
    }
  }

  room.actionCompletionPendingId = "";
  clearAppliedActionEffects(room);
  room.presentedAction = null;
  if (room.actionIndex >= getStateActions(room.phase, room).length) {
    room.actionIndex = 0;
  }
  broadcastLobby(room);
  sendJson(res, 200, { ok: true, lobby: lobbyPayload(room), hasTestFlow: Boolean(room.runtimeFlowOverride) });
}

async function handlePresentHi(req, res) {
  let payload;
  try {
    payload = await readJson(req);
  } catch (error) {
    sendJson(res, 400, { ok: false, error: "Invalid JSON payload" });
    return;
  }

  const stageCode = normalizeStageCode(payload.stageCode);
  const playerId = normalizePlayerId(payload.playerId);
  const room = getExistingRoom(stageCode);
  const player = room?.players.get(playerId);
  selectVip(room || { players: new Map(), vipPlayerId: "" });

  if (!room || !player || !player.active) {
    sendJson(res, 404, { ok: false, error: "Player is not in this lobby" });
    return;
  }
  if (room.vipPlayerId !== playerId) {
    sendJson(res, 403, { ok: false, error: "Only the VIP can present text" });
    return;
  }
  if (!payload.startToken || payload.startToken !== room.startToken) {
    sendJson(res, 403, { ok: false, error: "Present request is stale" });
    return;
  }
  if (room.phase !== "intro") {
    sendJson(res, 409, { ok: false, error: "Text can only be presented during the game intro" });
    return;
  }

  room.presentedAction = { type: "present", text: "HI THERE" };
  broadcastLobby(room);
  sendJson(res, 200, { ok: true, lobby: lobbyPayload(room) });
}

function handleLobby(req, res, stageCode) {
  const room = getRoom(stageCode);
  sendJson(res, 200, { ok: true, lobby: lobbyPayload(room) });
}

function router(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);

  if (req.method === "OPTIONS" && url.pathname.startsWith("/api/")) {
    sendJson(res, 200, { ok: true });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/health") {
    sendJson(res, 200, { ok: true, rooms: rooms.size });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/art-assets") {
    sendArtAssetList(res);
    return;
  }

  if (req.method === "GET" && (url.pathname === "/api/local-draft" || url.pathname === "/api/tool-drafts")) {
    sendLocalDraft(res);
    return;
  }

  if (req.method === "POST" && (url.pathname === "/api/local-draft" || url.pathname === "/api/tool-drafts")) {
    handleLocalDraft(req, res);
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/game-flow") {
    sendGameFlow(res).catch((error) => {
      sendJson(res, 500, { ok: false, error: error.message });
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/game-flow") {
    handleSaveGameFlow(req, res);
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/game-constants") {
    sendGameConstants(res).catch((error) => {
      sendJson(res, 500, { ok: false, error: error.message });
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/game-constants") {
    handleSaveGameConstants(req, res);
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/multiple-choice-prompts") {
    sendJson(res, 200, { ok: true, prompts: multipleChoicePrompts.map(clonePrompt) });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/stage-layouts") {
    sendStageLayouts(res).catch((error) => {
      sendJson(res, 500, { ok: false, error: error.message });
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/stage-layouts") {
    handleSaveStageLayouts(req, res);
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/controller-layouts") {
    sendControllerLayouts(res).catch((error) => {
      sendJson(res, 500, { ok: false, error: error.message });
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/controller-layouts") {
    handleSaveControllerLayouts(req, res);
    return;
  }

  const artAssetMatch = url.pathname.match(/^\/api\/art-assets\/([a-z0-9-]+)$/i);
  if (req.method === "POST" && artAssetMatch) {
    handleReplaceArtAsset(req, res, artAssetMatch[1]);
    return;
  }

  const artFileMatch = url.pathname.match(/^\/art\/(default|custom)\/([^/]+)$/i);
  if (req.method === "GET" && artFileMatch) {
    serveArtFile(res, artFileMatch[1], artFileMatch[2]);
    return;
  }

  const clientFileMatch = url.pathname.match(/^\/client\/(.+)$/i);
  if (req.method === "GET" && clientFileMatch) {
    serveClientFile(res, clientFileMatch[1]);
    return;
  }

  const eventMatch = url.pathname.match(/^\/api\/stage\/([A-Z0-9]{1,6})\/events$/i);
  if (req.method === "GET" && eventMatch) {
    handleStageEvents(req, res, normalizeStageCode(eventMatch[1]));
    return;
  }

  const lobbyMatch = url.pathname.match(/^\/api\/stage\/([A-Z0-9]{1,6})\/lobby$/i);
  if (req.method === "GET" && lobbyMatch) {
    handleLobby(req, res, normalizeStageCode(lobbyMatch[1]));
    return;
  }

  const stageTestConfigMatch = url.pathname.match(/^\/api\/stage\/([A-Z0-9]{1,6})\/test-config$/i);
  if (req.method === "POST" && stageTestConfigMatch) {
    handleStageTestConfig(req, res, normalizeStageCode(stageTestConfigMatch[1]));
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/join") {
    handleJoin(req, res);
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/heartbeat") {
    handleHeartbeat(req, res);
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/avatar") {
    handleSelectAvatar(req, res);
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/leave") {
    handleLeave(req, res);
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/start") {
    handleStart(req, res);
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/cancel-start") {
    handleCancelStart(req, res);
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/advance-presentation") {
    handleAdvancePresentation(req, res);
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/complete-action") {
    handleCompleteAction(req, res);
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/action-effect") {
    handleActionEffect(req, res);
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/controller-choice") {
    handleControllerChoice(req, res);
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/controller-text-submit") {
    handleControllerTextSubmit(req, res);
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/quit-to-lobby") {
    handleQuitToLobby(req, res);
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/present-hi") {
    handlePresentHi(req, res);
    return;
  }

  if (req.method === "GET" || req.method === "HEAD") {
    serveIndex(res);
    return;
  }

  sendJson(res, 405, { ok: false, error: "Method not allowed" });
}

function sweepInactivePlayers() {
  const now = Date.now();
  for (const room of rooms.values()) {
    let changed = false;
    for (const player of room.players.values()) {
      if (player.active && now - player.lastSeen > CONTROLLER_TIMEOUT_MS) {
        player.active = false;
        changed = true;
      }
    }
    if (changed) {
      selectVip(room);
      broadcastLobby(room);
    }
  }
}

function getLanUrls() {
  const urls = [];
  for (const network of Object.values(os.networkInterfaces())) {
    for (const details of network || []) {
      if (details.family === "IPv4" && !details.internal) {
        urls.push(`http://${details.address}:${PORT}`);
      }
    }
  }
  return urls;
}

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
});
