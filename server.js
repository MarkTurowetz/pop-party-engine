const http = require("http");
const os = require("os");
const path = require("path");
const { readAppVersion } = require("./server/app-version");
const { createArtAssetsRuntime } = require("./server/art-assets-runtime");
const { createCraftingTimerRuntime } = require("./server/crafting-timer-runtime");
const { createDecisionRuntime } = require("./server/decision-runtime");
const { createGithubStorageRuntime } = require("./server/github-storage-runtime");
const { contentTypeForFile, readJson, sendJson } = require("./server/http-utils");
const { createInputStateRuntime } = require("./server/input-state-runtime");
const { createLocalDraftRuntime } = require("./server/local-draft-runtime");
const { backupJsonFile, mirrorJsonFile, readJsonFile, writeJsonFile } = require("./server/local-json-store");
const { createPlayerAnswersRuntime } = require("./server/player-answers-runtime");
const { createPlayerStateRuntime } = require("./server/player-state-runtime");
const { createRoomStateRuntime } = require("./server/room-state-runtime");
const { createSaveHandlersRuntime } = require("./server/save-handlers-runtime");
const { createStaticFilesRuntime } = require("./server/static-files-runtime");
const { createToolDataReadRuntime } = require("./server/tool-data-read-runtime");
const { createTriviaContentRuntime } = require("./server/trivia-content-runtime");
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

const APP_VERSION = readAppVersion(ROOT);

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

const githubStorage = createGithubStorageRuntime({
  baseBranch: GAME_FLOW_GITHUB_BASE_BRANCH,
  branch: GAME_FLOW_GITHUB_BRANCH,
  repo: GAME_FLOW_GITHUB_REPO,
  token: GAME_FLOW_GITHUB_TOKEN
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

function normalizeStageCode(value) {
  return String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
}

function normalizePlayerId(value) {
  return String(value || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 32);
}

function cleanPlayerName(value) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, 24);
}

function normalizeFlowId(value, fallback) {
  const cleaned = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return cleaned || fallback;
}

function cleanFlowText(value, fallback = "") {
  const cleaned = String(value || "").trim().replace(/\s+/g, " ").slice(0, 240);
  return cleaned || fallback;
}

function cleanChoiceOptions(value) {
  const incoming = Array.isArray(value) ? value : String(value || "").split(/\r?\n/);
  const options = incoming
    .map((item) => String(item || "").trim().replace(/\s+/g, " ").slice(0, 80))
    .filter(Boolean)
    .slice(0, 12);
  return options.length ? options : ["A", "B", "C", "D"];
}

function normalizeFlowVariableName(value, fallback = "multipleChoicePrompt") {
  const cleaned = String(value || "")
    .trim()
    .replace(/[^a-zA-Z0-9_.$-]+/g, "")
    .slice(0, 80);
  return cleaned || fallback;
}

function normalizePlayerFilter(value) {
  const cleaned = String(value || "").trim();
  return ["all", "correct", "wrong", "votingWinner", "votingLosers"].includes(cleaned) ? cleaned : "all";
}

function normalizeVotingCardFilter(value) {
  const cleaned = String(value || "").trim();
  return ["all", "winners", "losers"].includes(cleaned) ? cleaned : "all";
}

function normalizeChoiceInputMode(value) {
  const mode = String(value || "").trim();
  return ["singleSelect", "submitOnce", "continuous"].includes(mode) ? mode : "singleSelect";
}

function cleanSubmittedText(value, limit = 240) {
  const maxLength = Math.max(1, Math.min(1000, Math.floor(Number(limit) || 240)));
  return String(value || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim().slice(0, maxLength);
}

function normalizeCharacterLimit(value) {
  const limit = Math.floor(Number(value || 0));
  if (!Number.isFinite(limit) || limit <= 0) return 0;
  return Math.max(1, Math.min(1000, limit));
}

function normalizeColor(value) {
  const color = String(value || "").trim();
  return /^#[0-9a-fA-F]{6}$/.test(color) ? color.toLowerCase() : "";
}

function normalizeDurationSeconds(value, fallback = 30) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Number(Math.max(1, Math.min(3600, number)).toFixed(2));
}

function normalizeConstantString(value, fallback, maxLength = 80) {
  const cleaned = String(value || "").trim().replace(/\s+/g, " ").slice(0, maxLength);
  return cleaned || fallback;
}

function normalizeConstantInteger(value, fallback, min = 0, max = 9999) {
  const number = Math.floor(Number(value));
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}

function normalizeConstantFloat(value, fallback, min = -999999, max = 999999) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Number(number.toFixed(4))));
}

function normalizeGameConstants(constants) {
  const colors = Array.isArray(constants?.playerColors) ? constants.playerColors : defaultPlayerColors;
  const playerColors = [...new Set(colors.map(normalizeColor).filter(Boolean))];
  const craftingTimerDuration = normalizeDurationSeconds(constants?.craftingTimerDuration, defaultGameConstants.craftingTimerDuration);
  const startGameCountdownDuration = normalizeDurationSeconds(constants?.startGameCountdownDuration, defaultGameConstants.startGameCountdownDuration);
  const pointsForCorrectAnswer = normalizeConstantInteger(constants?.pointsForCorrectAnswer, defaultGameConstants.pointsForCorrectAnswer || 200, 0, 999999);
  return {
    playerColors: playerColors.length ? playerColors : [...defaultPlayerColors],
    craftingTimerDuration,
    startGameCountdownDuration,
    pointsForCorrectAnswer,
    gameTitle: normalizeConstantString(constants?.gameTitle, defaultGameConstants.gameTitle),
    numberOfRounds: normalizeConstantInteger(constants?.numberOfRounds, defaultGameConstants.numberOfRounds, 1, 99),
    randomChanceTest: normalizeConstantFloat(constants?.randomChanceTest, defaultGameConstants.randomChanceTest, 0, 1),
    overrideFirstGameOfSession: constants?.overrideFirstGameOfSession === true
  };
}

function normalizeStageLayouts(layouts) {
  const incomingCanvas = layouts?.canvas || defaultStageLayouts.canvas;
  const canvas = {
    width: normalizeLayoutNumber(incomingCanvas.width, defaultStageLayouts.canvas.width, 640, 10000),
    height: normalizeLayoutNumber(incomingCanvas.height, defaultStageLayouts.canvas.height, 360, 10000)
  };
  const incomingStates = Array.isArray(layouts?.states) ? layouts.states : defaultStageLayouts.states;
  const normalizedDefaultGlobal = normalizeLayoutState(defaultStageLayouts.global, -1);
  const normalizedDefaultStates = defaultStageLayouts.states.map((state, index) => normalizeLayoutState(state, index)).filter(Boolean);
  const defaultStatesById = new Map(normalizedDefaultStates.map((state) => [state.id, state]));
  const normalizedIncomingStates = incomingStates.map((state, stateIndex) => normalizeLayoutState(state, stateIndex)).filter(Boolean);
  const hasIncomingGlobal = layouts && Object.prototype.hasOwnProperty.call(layouts, "global");
  const incomingGlobal = normalizeLayoutState(hasIncomingGlobal ? layouts.global : defaultStageLayouts.global, -1);
  const migrated = migrateStageLayoutStates(normalizedIncomingStates, incomingGlobal, normalizedDefaultGlobal, Boolean(incomingGlobal));
  const migratedStates = migrated.states;
  const normalizedStates = [...migratedStates];
  for (const defaultState of normalizedDefaultStates) {
    if (!normalizedStates.some((state) => state.id === defaultState.id)) {
      normalizedStates.push(cloneJson(defaultState));
    }
  }
  const globalElements = [...(migrated.global?.elements || [])];
  return {
    canvas,
    global: {
      ...normalizedDefaultGlobal,
      ...(migrated.global || {}),
      id: "global",
      name: migrated.global?.name || normalizedDefaultGlobal.name,
      elements: globalElements
    },
    states: normalizedStates.map((state) => {
      const defaultState = defaultStatesById.get(state.id);
      if (!defaultState) return state;
      const hiddenGlobals = Array.isArray(state.hiddenGlobals) ? state.hiddenGlobals : defaultState.hiddenGlobals || [];
      return { ...state, hiddenGlobals };
    })
  };
}

function normalizeControllerLayouts(layouts) {
  const incomingCanvas = layouts?.canvas || defaultControllerLayouts.canvas;
  const canvas = {
    width: normalizeLayoutNumber(incomingCanvas.width, defaultControllerLayouts.canvas.width, 240, 2000),
    height: normalizeLayoutNumber(incomingCanvas.height, defaultControllerLayouts.canvas.height, 320, 3000)
  };
  const incomingStates = Array.isArray(layouts?.states) ? layouts.states : defaultControllerLayouts.states;
  const normalizedDefaultGlobal = normalizeLayoutState(defaultControllerLayouts.global, -1);
  const normalizedDefaultStates = defaultControllerLayouts.states.map((state, index) => normalizeLayoutState(state, index)).filter(Boolean);
  const defaultStatesById = new Map(normalizedDefaultStates.map((state) => [state.id, state]));
  const normalizedStates = incomingStates.map((state, stateIndex) => normalizeLayoutState(state, stateIndex)).filter(Boolean);
  for (const defaultState of normalizedDefaultStates) {
    if (!normalizedStates.some((state) => state.id === defaultState.id)) {
      normalizedStates.push(cloneJson(defaultState));
    }
  }
  const hasIncomingGlobal = layouts && Object.prototype.hasOwnProperty.call(layouts, "global");
  const incomingGlobal = normalizeLayoutState(hasIncomingGlobal ? layouts.global : defaultControllerLayouts.global, -1);
  const globalElements = [...(incomingGlobal?.elements || [])];
  return {
    canvas,
    global: {
      ...normalizedDefaultGlobal,
      ...(incomingGlobal || {}),
      id: "global",
      name: incomingGlobal?.name || normalizedDefaultGlobal.name,
      elements: globalElements
    },
    states: normalizedStates.map((state) => {
      const defaultState = defaultStatesById.get(state.id);
      if (!defaultState) return state;
      const hiddenGlobals = Array.isArray(state.hiddenGlobals) ? state.hiddenGlobals : defaultState.hiddenGlobals || [];
      return { ...state, hiddenGlobals };
    })
  };
}

function migrateStageLayoutStates(states, global, defaultGlobal, hasExplicitGlobal = false) {
  const migratedGlobal = global ? cloneJson(global) : cloneJson(defaultGlobal);
  migratedGlobal.id = "global";
  migratedGlobal.name = migratedGlobal.name || "Global Layout";
  migratedGlobal.elements = Array.isArray(migratedGlobal.elements) ? migratedGlobal.elements : [];
  const lobby = states.find((state) => state.id === "lobby");
  const starting = states.find((state) => state.id === "starting");
  const countdown = starting?.elements?.find((element) => element.id === "startpopup");
  if (lobby && countdown && !lobby.elements.some((element) => element.id === "startpopup")) {
    lobby.elements.unshift({
      ...countdown,
      id: "startpopup",
      name: countdown.name || "Countdown Popup",
      selector: countdown.selector || "#startPopup"
    });
  }
  const globalElementIds = new Set((defaultGlobal.elements || []).map((element) => element.id));
  for (const state of states) {
    state.elements = (state.elements || []).filter((element) => {
      if (!globalElementIds.has(element.id)) return true;
      const existingIndex = migratedGlobal.elements.findIndex((item) => item.id === element.id);
      if (existingIndex === -1) {
        migratedGlobal.elements.push(cloneJson(element));
      } else if (!hasExplicitGlobal) {
        migratedGlobal.elements[existingIndex] = cloneJson(element);
      }
      return false;
    });
  }
  return { states, global: migratedGlobal };
}

function normalizeLayoutState(state, stateIndex) {
  if (!state || typeof state !== "object") return null;
  const fallbackId = stateIndex === 0 ? "lobby" : `layout-state-${stateIndex + 1}`;
  return {
    id: normalizeFlowId(state.id || state.name, fallbackId),
    name: cleanFlowText(state.name, state.id || fallbackId),
    hiddenGlobals: Array.isArray(state.hiddenGlobals)
      ? [...new Set(state.hiddenGlobals.map((id) => normalizeFlowId(id, "")).filter(Boolean))]
      : null,
    elements: Array.isArray(state.elements)
      ? state.elements.map((element, elementIndex) => normalizeLayoutElement(element, elementIndex)).filter(Boolean)
      : []
  };
}

function normalizeLayoutElement(element, elementIndex) {
  if (!element || typeof element !== "object") return null;
  const fallbackId = `layout-element-${elementIndex + 1}`;
  const width = normalizeLayoutNumber(element.width, 240, 24, 4000);
  const height = normalizeLayoutNumber(element.height, 100, 24, 4000);
  const selector = cleanLayoutSelector(element.selector);
  const kind = normalizeLayoutElementKind(element.kind, selector);
  return {
    id: normalizeFlowId(element.id || element.name, fallbackId),
    name: cleanFlowText(element.name, element.id || fallbackId),
    selector,
    kind,
    x: normalizeLayoutNumber(element.x, defaultStageLayouts.canvas.width / 2, -5000, 15000),
    y: normalizeLayoutNumber(element.y, defaultStageLayouts.canvas.height / 2, -5000, 15000),
    width,
    height,
    scale: normalizeLayoutNumber(element.scale, 1, 0.05, 10),
    defaultText: kind === "text" ? cleanLayoutText(element.defaultText) : "",
    fontSize: kind === "text" ? normalizeLayoutNumber(element.fontSize, 58, 6, 260) : 58,
    autoFitText: kind === "text" ? element.autoFitText === true : false,
    fontColor: kind === "text" ? normalizeColor(element.fontColor) || "#ffffff" : "#ffffff"
  };
}

function normalizeLayoutElementKind(kind, selector) {
  const cleanKind = String(kind || "").trim().toLowerCase();
  if (cleanKind === "text") return "text";
  return /waitingstatus|joinprompt|stage(?:presentation|prompt)|roundintro.*text/i.test(String(selector || "")) ? "text" : "art";
}

function syncStageLayoutsWithFlow(layouts, flow) {
  const normalizedLayouts = normalizeStageLayouts(layouts);
  const normalizedFlow = normalizeGameFlow(flow || readGameFlow());
  const stateIds = new Set(normalizedFlow.states.map((state) => state.id));
  normalizedLayouts.global.elements = dedupeLayoutElements(normalizedLayouts.global.elements || []);
  normalizedLayouts.states = (normalizedLayouts.states || [])
    .filter((state) => stateIds.has(state.id))
    .map((state) => ({ ...state, elements: dedupeLayoutElements(state.elements || []) }));
  for (const flowState of normalizedFlow.states) {
    if (flowState.id === "lobby") continue;
    const seededState = normalizeLayoutState(createLayoutStateForFlowState(flowState), -1);
    const existingState = normalizedLayouts.states.find((state) => state.id === flowState.id);
    if (!existingState) {
      normalizedLayouts.states.push(seededState);
      continue;
    }
    existingState.name = flowState.name || existingState.name;
  }
  return normalizedLayouts;
}

function syncControllerLayoutsWithFlow(layouts, flow) {
  const normalizedLayouts = normalizeControllerLayouts(layouts);
  const normalizedFlow = normalizeGameFlow(flow || readGameFlow());
  const stateIds = new Set(["join", ...normalizedFlow.states.map((state) => state.id)]);
  normalizedLayouts.global.elements = dedupeLayoutElements(normalizedLayouts.global.elements || []);
  normalizedLayouts.states = (normalizedLayouts.states || [])
    .filter((state) => stateIds.has(state.id))
    .map((state) => ({ ...state, elements: dedupeLayoutElements(state.elements || []) }));
  for (const flowState of normalizedFlow.states) {
    const existingState = normalizedLayouts.states.find((state) => state.id === flowState.id);
    if (existingState) {
      existingState.name = flowState.id === "lobby" ? existingState.name : flowState.name || existingState.name;
      existingState.elements = dedupeLayoutElements(existingState.elements || []);
      continue;
    }
    normalizedLayouts.states.push(normalizeLayoutState(createControllerLayoutStateForFlowState(flowState), -1));
  }
  return normalizedLayouts;
}

function dedupeLayoutElements(elements) {
  const seen = new Set();
  const deduped = [];
  for (const element of elements || []) {
    const normalizedElement = normalizeLayoutElement(element, deduped.length);
    if (!normalizedElement) continue;
    const key = normalizedElement.id || normalizedElement.selector;
    const selectorKey = normalizedElement.selector ? `selector:${normalizedElement.selector}` : "";
    if (seen.has(key) || (selectorKey && seen.has(selectorKey))) continue;
    seen.add(key);
    if (selectorKey) seen.add(selectorKey);
    deduped.push(normalizedElement);
  }
  return deduped;
}

function createControllerLayoutStateForFlowState(flowState) {
  const shouldSeedChoiceInput = isCraftingStateId(flowState.id) || flowStateHasActionType(flowState, "multipleChoiceInput");
  const shouldSeedTextInput = isCraftingStateId(flowState.id) || flowStateHasActionType(flowState, "textSubmissionInput");
  if (shouldSeedChoiceInput || shouldSeedTextInput) {
    const elements = [];
    if (shouldSeedChoiceInput) {
      elements.push(
        {
          id: "controllerChoicePrompt",
          name: "Choice Prompt",
          selector: "#controllerChoicePrompt",
          kind: "text",
          x: 195,
          y: 180,
          width: 330,
          height: 120,
          scale: 1,
          defaultText: "Answer this question by tapping an answer",
          fontSize: 32,
          autoFitText: true,
          fontColor: "#17131f"
        },
        {
          id: "controllerChoiceGrid",
          name: "Choice Buttons",
          selector: "#controllerChoiceGrid",
          kind: "art",
          x: 195,
          y: 485,
          width: 330,
          height: 420,
          scale: 1
        },
        {
          id: "controllerChoiceDone",
          name: "Choice Done Text",
          selector: "#controllerChoiceDone",
          kind: "text",
          x: 195,
          y: 420,
          width: 330,
          height: 150,
          scale: 1,
          defaultText: "You chose:",
          fontSize: 34,
          autoFitText: true,
          fontColor: "#17131f"
        }
      );
    }
    if (shouldSeedTextInput) {
      elements.push(
        {
          id: "controllerTextPrompt",
          name: "Text Input Prompt",
          selector: "#controllerTextPrompt",
          kind: "text",
          x: 195,
          y: 170,
          width: 330,
          height: 92,
          scale: 1,
          defaultText: "Write your answer",
          fontSize: 32,
          autoFitText: true,
          fontColor: "#17131f"
        },
        {
          id: "controllerInvalidBanner",
          name: "Invalid Submission Banner",
          selector: "#controllerInvalidBanner",
          kind: "art",
          x: 195,
          y: 245,
          width: 330,
          height: 64,
          scale: 1
        },
        {
          id: "controllerTextInput",
          name: "Text Input Field",
          selector: "#controllerTextInput",
          kind: "art",
          x: 195,
          y: 360,
          width: 330,
          height: 128,
          scale: 1
        },
        {
          id: "controllerTextSubmitButton",
          name: "Text Submit Button",
          selector: "#controllerTextSubmitButton",
          kind: "art",
          x: 195,
          y: 475,
          width: 300,
          height: 70,
          scale: 1
        },
        {
          id: "controllerTextDone",
          name: "Text Done Message",
          selector: "#controllerTextDone",
          kind: "text",
          x: 195,
          y: 410,
          width: 330,
          height: 150,
          scale: 1,
          defaultText: "You wrote:",
          fontSize: 34,
          autoFitText: true,
          fontColor: "#17131f"
        }
      );
    }
    return {
      id: flowState.id,
      name: flowState.name || "Crafting",
      elements
    };
  }
  const textElementId = normalizeFlowId(`${flowState.id}-controller-text`, `${flowState.id}-controller-text`);
  return {
    id: flowState.id,
    name: flowState.name || flowState.id,
    elements: [
      {
        id: textElementId,
        name: `${flowState.name || "Controller"} Text Field`,
        selector: `#${textElementId}`,
        kind: "text",
        x: 195,
        y: 250,
        width: 330,
        height: 140,
        scale: 1,
        defaultText: flowState.name || "Controller View",
        fontSize: 42,
        autoFitText: true,
        fontColor: "#17131f"
      }
    ]
  };
}

function createLayoutStateForFlowState(flowState) {
  if (isRoundIntroStateId(flowState.id)) {
    return {
      id: flowState.id,
      name: flowState.name || "Round Intro",
      elements: [
        { id: "roundIntroText", name: "Round Intro Text Field", selector: "#roundIntroText", kind: "text", x: 960, y: 430, width: 1100, height: 180, scale: 1 },
        { id: "roundIntroInfoText", name: "Round Intro Info Text Field", selector: "#roundIntroInfoText", kind: "text", x: 960, y: 610, width: 980, height: 105, scale: 1 }
      ]
    };
  }
  const textElementId = normalizeFlowId(`${flowState.id}-moment-text`, `${flowState.id}-moment-text`);
  const elements = [
    {
      id: textElementId,
      name: `${flowState.name || "Moment"} Text Field`,
      selector: `#${textElementId}`,
      kind: "text",
      x: 960,
      y: 460,
      width: 980,
      height: 240,
      scale: 1
    }
  ];
  if (isCraftingStateId(flowState.id) || flowStateHasActionType(flowState, "setTimerShown") || flowStateHasActionType(flowState, "startCraftingTimer")) {
    elements.push({
      id: "craftingTimer",
      name: "Crafting Timer",
      selector: "#craftingTimer",
      kind: "art",
      x: 1660,
      y: 185,
      width: 190,
      height: 190,
      scale: 1
    });
  }
  return {
    id: flowState.id,
    name: flowState.name || flowState.id,
    elements
  };
}

function isRoundIntroStateId(stateId) {
  return String(stateId || "").includes("round-intro");
}

function isCraftingStateId(stateId) {
  return String(stateId || "").includes("crafting");
}

function flowStateHasActionType(flowState, type) {
  const stack = [...(flowState?.actions || [])];
  while (stack.length) {
    const action = stack.pop();
    if (action?.type === type) return true;
    stack.push(...(action?.subActions || []));
  }
  return false;
}

function flowActionTarget(action) {
  const target = normalizeFlowId(action, "");
  if (isNoActionTarget(target)) return "none";
  if (isReturnActionTarget(target)) return "return";
  return target || "";
}

function normalizeDecisionOperator(value) {
  return ["<", "<=", "==", "!=", ">=", ">"].includes(value) ? value : "<";
}

function normalizeDecisionValueType(value) {
  return ["int", "float", "string", "bool"].includes(value) ? value : "int";
}

function normalizeDecisionBranchType(value) {
  return ["hit", "code", "noMatch"].includes(value) ? value : "hit";
}

function normalizeDecisionBranch(branch, index) {
  const type = normalizeDecisionBranchType(branch?.type);
  const fallbackId = type === "noMatch" ? "no-match" : `branch-${index + 1}`;
  return {
    id: normalizeFlowId(branch?.id, fallbackId),
    type,
    value: cleanFlowText(branch?.value, type === "hit" ? "0" : ""),
    code: cleanFlowText(branch?.code, type === "code" ? "x < 3" : ""),
    targetActionId: flowActionTarget(branch?.targetActionId)
  };
}

function normalizeDecisionBranches(action) {
  const sourceBranches = Array.isArray(action?.branches) && action.branches.length
    ? action.branches
    : [
        {
          id: "legacy-hit",
          type: "code",
          code: `x ${normalizeDecisionOperator(action?.operator)} ${cleanFlowText(action?.compareValue, "3")}`,
          value: cleanFlowText(action?.compareValue, "3"),
          targetActionId: action?.trueTargetActionId
        },
        {
          id: "no-match",
          type: "noMatch",
          targetActionId: action?.falseTargetActionId
        }
      ];
  const branches = sourceBranches.map(normalizeDecisionBranch).filter(Boolean);
  const regularBranches = branches.filter((branch) => branch.type !== "noMatch");
  const noMatch = branches.find((branch) => branch.type === "noMatch")
    || normalizeDecisionBranch({ id: "no-match", type: "noMatch", targetActionId: action?.falseTargetActionId }, regularBranches.length);
  return [...regularBranches, noMatch];
}

function isNoActionTarget(value) {
  return String(value || "").toLowerCase() === "none";
}

function isReturnActionTarget(value) {
  return String(value || "").toLowerCase() === "return";
}

function normalizeLayoutNumber(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Number(Math.max(min, Math.min(max, number)).toFixed(3));
}

function cleanLayoutSelector(value) {
  return String(value || "").trim().replace(/[\n\r]/g, "").slice(0, 120);
}

function cleanLayoutText(value) {
  return String(value || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").slice(0, 500);
}

function normalizeGameFlow(flow) {
  const incomingStates = Array.isArray(flow?.states) ? flow.states : defaultGameFlow.states;
  const states = incomingStates.map((state, stateIndex) => {
    const fallbackStateId = stateIndex === 0 ? "lobby" : `state-${stateIndex + 1}`;
    const id = normalizeFlowId(state.id || state.name, fallbackStateId);
    const actions = Array.isArray(state.actions) ? state.actions : [];
    return {
      id,
      name: cleanFlowText(state.name, id),
      nodePosition: normalizeNodePosition(state.nodePosition, stateIndex),
      startNodePosition: normalizeNodePosition(state.startNodePosition, 0),
      returnNodePosition: normalizeNodePosition(state.returnNodePosition, 0),
      entryTargetActionId: flowActionTarget(state.entryTargetActionId),
      nextStateTargetId: normalizeFlowId(state.nextStateTargetId, ""),
      actions: actions.map((action, actionIndex) => normalizeFlowAction(action, actionIndex, id)).filter(Boolean)
    };
  });
  if (!states.some((state) => state.id === "lobby")) {
    states.unshift(defaultGameFlow.states[0]);
  }
  return { states };
}

function normalizeNodePosition(position, index = 0) {
  if (!position || typeof position !== "object") return null;
  const x = Number(position.x);
  const y = Number(position.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return {
    x: Math.round(Math.max(-5000, Math.min(15000, x))),
    y: Math.round(Math.max(-5000, Math.min(15000, y)))
  };
}

function flowActionTypeMeta(type) {
  return availableFlowActionTypes.find((item) => item.id === type) || availableFlowActionTypes[0];
}

function normalizeFlowAction(action, actionIndex, stateId, isSubAction = false) {
  const requestedType = action?.type === "text" ? "displayText" : action?.type;
  const type = availableFlowActionTypes.some((item) => item.id === requestedType) ? requestedType : "presentText";
  const category = flowActionTypeMeta(type).category;
  const fallbackId = `${stateId}-${isSubAction ? "sub-action" : "action"}-${actionIndex + 1}`;
  const base = {
    id: normalizeFlowId(action?.id || action?.name, fallbackId),
    name: cleanFlowText(action?.name, `Action ${actionIndex + 1}`),
    type,
    category,
    timing: normalizeActionTiming(action?.timing, category !== "input", isSubAction),
    nextTargetActionId: flowActionTarget(action?.nextTargetActionId),
    nodePosition: normalizeNodePosition(action?.nodePosition, actionIndex),
    subActions: normalizeSubActions(action?.subActions, stateId)
  };
  if (type === "presentText") {
    return {
      ...base,
      text: cleanFlowText(action?.text, "Presented text"),
      textTarget: normalizeTextTarget(action?.textTarget),
      isShown: action?.isShown !== false,
      instant: action?.instant === true
    };
  }
  if (type === "multipleChoiceInput") {
    return {
      ...base,
      prompt: cleanFlowText(action?.prompt, "Answer this question by tapping an answer"),
      options: cleanChoiceOptions(action?.options),
      inputMode: normalizeChoiceInputMode(action?.inputMode),
      locked: action?.locked === true,
      timerEndTargetActionId: flowActionTarget(action?.timerEndTargetActionId),
      answersSubmittedTargetActionId: flowActionTarget(action?.answersSubmittedTargetActionId)
    };
  }
  if (type === "triviaInput") {
    return {
      ...base,
      contentVariable: normalizeFlowVariableName(action?.contentVariable),
      inputMode: normalizeChoiceInputMode(action?.inputMode),
      locked: action?.locked === true,
      randomizeOptions: action?.randomizeOptions === true,
      timerEndTargetActionId: flowActionTarget(action?.timerEndTargetActionId),
      answersSubmittedTargetActionId: flowActionTarget(action?.answersSubmittedTargetActionId)
    };
  }
  if (type === "textSubmissionInput") {
    const characterLimit = normalizeCharacterLimit(action?.characterLimit);
    return {
      ...base,
      prompt: cleanFlowText(action?.prompt, "Write your answer"),
      placeholder: cleanFlowText(action?.placeholder, "Answer here"),
      characterLimit,
      timerEndTargetActionId: flowActionTarget(action?.timerEndTargetActionId),
      answersSubmittedTargetActionId: flowActionTarget(action?.answersSubmittedTargetActionId)
    };
  }
  if (type === "doNothing") {
    return { ...base };
  }
  if (type === "playAudio") {
    return {
      ...base,
      audioUrl: cleanFlowText(action?.audioUrl, "")
    };
  }
  if (type === "getRandomMultipleChoiceContent") {
    return {
      ...base,
      variableName: normalizeFlowVariableName(action?.variableName)
    };
  }
  if (type === "prepareVotingCards") {
    return { ...base };
  }
  if (type === "setVotingCardsShown") {
    return { ...base, isShown: action?.isShown !== false, instant: action?.instant === true, cardFilter: normalizeVotingCardFilter(action?.cardFilter) };
  }
  if (type === "voteOnAnswersInput") {
    return {
      ...base,
      prompt: cleanFlowText(action?.prompt, "Vote for your favorite answer"),
      inputMode: "submitOnce",
      timerEndTargetActionId: flowActionTarget(action?.timerEndTargetActionId),
      answersSubmittedTargetActionId: flowActionTarget(action?.answersSubmittedTargetActionId)
    };
  }
  if (type === "revealVotingResults") {
    return { ...base };
  }
  if (type === "displayText") {
    return {
      ...base,
      text: cleanFlowText(action?.text, "Displayed text"),
      textTarget: normalizeTextTarget(action?.textTarget),
      isShown: action?.isShown !== false,
      instant: action?.instant === true
    };
  }
  if (type === "setPlayersShown") {
    return { ...base, isShown: action?.isShown !== false, instant: action?.instant === true };
  }
  if (type === "setPlayerAnswersShown") {
    return { ...base, isShown: action?.isShown !== false, instant: action?.instant === true, playerFilter: normalizePlayerFilter(action?.playerFilter) };
  }
  if (type === "revealPlayerAnswerCorrectness") {
    return { ...base };
  }
  if (type === "showPoints") {
    return { ...base, playerFilter: normalizePlayerFilter(action?.playerFilter || "correct"), points: normalizeConstantInteger(action?.points, 0, 0, 999999) };
  }
  if (type === "givePendingPoints") {
    return { ...base };
  }
  if (type === "setTimerShown") {
    return { ...base, isShown: action?.isShown !== false, instant: action?.instant === true };
  }
  if (type === "startCraftingTimer") {
    return { ...base };
  }
  if (type === "decision") {
    return {
      ...base,
      variable: cleanFlowText(action?.variable, "activePlayerCount"),
      valueType: normalizeDecisionValueType(action?.valueType),
      branches: normalizeDecisionBranches(action)
    };
  }
  if (type === "transition") {
    const transition = availableFlowTransitions.some((item) => item.id === action?.transition) ? action.transition : "horizontalWipe";
    return { ...base, transition };
  }
  if (type === "transitionState") {
    return {
      ...base,
      trigger: action?.trigger === "onCountdownComplete" ? "onCountdownComplete" : "",
      targetState: normalizeFlowId(action?.targetState, "intro")
    };
  }
  return {
    ...base,
    text: cleanFlowText(action?.text, "Text"),
    textTarget: normalizeTextTarget(action?.textTarget),
    isShown: action?.isShown !== false,
    instant: action?.instant === true
  };
}

function normalizeTextTarget(value) {
  const target = normalizeFlowId(value || "presentation", "presentation");
  return target || "presentation";
}

function normalizeSubActions(subActions, stateId) {
  if (!Array.isArray(subActions)) return [];
  return subActions.map((subAction, subActionIndex) => normalizeFlowAction(subAction, subActionIndex, stateId, true)).filter(Boolean);
}

function normalizeActionTiming(timing, allowStartTiming = true, preferStartTiming = false) {
  const mode = preferStartTiming || (allowStartTiming && timing?.mode === "S+") ? "S+" : "E+";
  const rawSeconds = Number(timing?.seconds || 0);
  const seconds = Number(Math.max(0, Math.min(999, Number.isFinite(rawSeconds) ? rawSeconds : 0)).toFixed(2));
  return { mode, seconds };
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function readDefaultGameFlowSource() {
  try {
    return readJsonFile(DEFAULT_GAME_FLOW_FILE);
  } catch (error) {
    return cloneJson(defaultGameFlow);
  }
}

function readDefaultGameConstantsSource() {
  try {
    return normalizeGameConstants(readJsonFile(DEFAULT_GAME_CONSTANTS_FILE));
  } catch (error) {
    return cloneJson(defaultGameConstants);
  }
}

function readDefaultStageLayoutsSource() {
  try {
    return normalizeStageLayouts(readJsonFile(DEFAULT_STAGE_LAYOUTS_FILE));
  } catch (error) {
    return normalizeStageLayouts(defaultStageLayouts);
  }
}

function readDefaultControllerLayoutsSource() {
  try {
    return normalizeControllerLayouts(readJsonFile(DEFAULT_CONTROLLER_LAYOUTS_FILE));
  } catch (error) {
    return normalizeControllerLayouts(defaultControllerLayouts);
  }
}

function readLocalGameFlowSource() {
  try {
    return readJsonFile(GAME_FLOW_FILE);
  } catch (error) {
    return readDefaultGameFlowSource();
  }
}

function readLocalGameConstantsSource() {
  try {
    return normalizeGameConstants(readJsonFile(GAME_CONSTANTS_FILE));
  } catch (error) {
    return readDefaultGameConstantsSource();
  }
}

function readLocalStageLayoutsSource() {
  try {
    return normalizeStageLayouts(readJsonFile(STAGE_LAYOUTS_FILE));
  } catch (error) {
    return readDefaultStageLayoutsSource();
  }
}

function readLocalControllerLayoutsSource() {
  try {
    return normalizeControllerLayouts(readJsonFile(CONTROLLER_LAYOUTS_FILE));
  } catch (error) {
    return readDefaultControllerLayoutsSource();
  }
}

const gameFlowStore = {
  source: readLocalGameFlowSource(),
  remoteSha: "",
  storageKind: GAME_FLOW_STORAGE === "github" ? "github" : "local",
  loadedAt: 0,
  error: "",
  ready: null
};

const gameConstantsStore = {
  source: readLocalGameConstantsSource(),
  remoteSha: "",
  storageKind: GAME_FLOW_STORAGE === "github" ? "github" : "local",
  loadedAt: 0,
  error: ""
};

const stageLayoutsStore = {
  source: readLocalStageLayoutsSource(),
  remoteSha: "",
  storageKind: GAME_FLOW_STORAGE === "github" ? "github" : "local",
  loadedAt: 0,
  error: ""
};

const controllerLayoutsStore = {
  source: readLocalControllerLayoutsSource(),
  remoteSha: "",
  storageKind: GAME_FLOW_STORAGE === "github" ? "github" : "local",
  loadedAt: 0,
  error: ""
};

const localDraftStore = {
  flow: null,
  constants: null,
  layouts: null,
  controllerLayouts: null
};

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

async function readGithubGameFlowSource() {
  const result = await readGithubJsonSource(GAME_FLOW_GITHUB_PATH);
  return result ? { flow: result.data, sha: result.sha } : null;
}

async function writeGithubGameFlowSource(flow, sha = "") {
  try {
    const result = await writeGithubJsonSource(flow, sha, GAME_FLOW_GITHUB_PATH, "Save game flow", false);
    return { flow: result.data, sha: result.sha };
  } catch (error) {
    if (error.status !== 409 || !sha) throw error;
    const latest = await readGithubGameFlowSource();
    const merged = mergeFlowWithExistingSubActions(flow, latest?.flow || {});
    return writeGithubGameFlowSource(merged, latest?.sha || "");
  }
}

async function readGithubJsonSource(filePath) {
  return githubStorage.readJson(filePath);
}

async function writeGithubJsonSource(data, sha = "", filePath = GAME_FLOW_GITHUB_PATH, messagePrefix = "Save JSON", retryConflict = true) {
  return githubStorage.writeJson(data, { filePath, messagePrefix, retryConflict, sha });
}

function mergeFlowWithExistingSubActions(incomingFlow, existingFlow = null) {
  const incomingStates = Array.isArray(incomingFlow?.states) ? incomingFlow.states : [];
  if (incomingStates.length === 0) return incomingFlow;
  const existing = existingFlow || readGameFlowSource();

  const existingActionsById = new Map();
  for (const state of existing?.states || []) {
    for (const action of state.actions || []) {
      indexActionTree(action, existingActionsById);
    }
  }

  return {
    ...incomingFlow,
    states: incomingStates.map((state) => ({
      ...state,
      actions: Array.isArray(state.actions)
        ? state.actions.map((action) => mergeActionSubActions(action, existingActionsById))
        : state.actions
    }))
  };
}

function indexActionTree(action, actionsById) {
  if (!action?.id) return;
  actionsById.set(action.id, action);
  for (const subAction of action.subActions || []) {
    indexActionTree(subAction, actionsById);
  }
}

function mergeActionSubActions(action, existingActionsById) {
  if (!action || typeof action !== "object") return action;
  const existingAction = existingActionsById.get(action.id);
  const hasIncomingSubActions = Array.isArray(action.subActions);
  const subActions = hasIncomingSubActions ? action.subActions : existingAction?.subActions;
  return {
    ...action,
    subActions: Array.isArray(subActions)
      ? subActions.map((subAction) => mergeActionSubActions(subAction, existingActionsById))
      : subActions
  };
}

function readDefaultGameFlow() {
  return normalizeGameFlow(readDefaultGameFlowSource());
}

function getFlowState(flow, stateId) {
  return flow.states.find((state) => state.id === stateId) || null;
}

function runtimeGameFlow(room) {
  return room?.runtimeFlowOverride || localDraftStore.flow || readGameFlow();
}

function getStateActions(stateId, room = null) {
  return getFlowState(runtimeGameFlow(room), stateId)?.actions || [];
}

function publicFlowAction(action, index) {
  if (!action) return null;
  const timing = action.timing || { mode: "E+", seconds: 0 };
  const base = {
    index,
    id: action.id,
    name: action.name,
    actionType: action.type,
    category: action.category || flowActionTypeMeta(action.type).category,
    timing,
    nextTargetActionId: action.nextTargetActionId || "",
    subActions: (action.subActions || []).map((subAction, subActionIndex) => publicFlowAction(subAction, subActionIndex)).filter(Boolean)
  };
  if (action.type === "presentText") {
    return { ...base, type: "present", text: action.text, textTarget: action.textTarget || "presentation", isShown: action.isShown !== false, instant: action.instant === true };
  }
  if (action.type === "multipleChoiceInput") {
    return {
      ...base,
      type: "multipleChoiceInput",
      prompt: action.prompt || "Answer this question by tapping an answer",
      options: cleanChoiceOptions(action.options),
      inputMode: normalizeChoiceInputMode(action.inputMode),
      locked: action.locked === true,
      timerEndTargetActionId: action.timerEndTargetActionId || "",
      answersSubmittedTargetActionId: action.answersSubmittedTargetActionId || ""
    };
  }
  if (action.type === "triviaInput") {
    return {
      ...base,
      type: "triviaInput",
      contentVariable: normalizeFlowVariableName(action.contentVariable),
      inputMode: normalizeChoiceInputMode(action.inputMode),
      locked: action.locked === true,
      randomizeOptions: action.randomizeOptions === true,
      timerEndTargetActionId: action.timerEndTargetActionId || "",
      answersSubmittedTargetActionId: action.answersSubmittedTargetActionId || ""
    };
  }
  if (action.type === "textSubmissionInput") {
    return {
      ...base,
      type: "textSubmissionInput",
      prompt: action.prompt || "Write your answer",
      placeholder: action.placeholder || "Answer here",
      characterLimit: normalizeCharacterLimit(action.characterLimit),
      timerEndTargetActionId: action.timerEndTargetActionId || "",
      answersSubmittedTargetActionId: action.answersSubmittedTargetActionId || ""
    };
  }
  if (action.type === "doNothing") {
    return { ...base, type: "doNothing" };
  }
  if (action.type === "playAudio") {
    return { ...base, type: "playAudio", audioUrl: action.audioUrl || "" };
  }
  if (action.type === "getRandomMultipleChoiceContent") {
    return { ...base, type: "getRandomMultipleChoiceContent", variableName: normalizeFlowVariableName(action.variableName) };
  }
  if (action.type === "prepareVotingCards") {
    return { ...base, type: "prepareVotingCards" };
  }
  if (action.type === "setVotingCardsShown") {
    return { ...base, type: "setVotingCardsShown", isShown: action.isShown !== false, instant: action.instant === true, cardFilter: normalizeVotingCardFilter(action.cardFilter) };
  }
  if (action.type === "voteOnAnswersInput") {
    return {
      ...base,
      type: "voteOnAnswersInput",
      prompt: action.prompt || "Vote for your favorite answer",
      inputMode: "submitOnce",
      timerEndTargetActionId: action.timerEndTargetActionId || "",
      answersSubmittedTargetActionId: action.answersSubmittedTargetActionId || ""
    };
  }
  if (action.type === "revealVotingResults") {
    return { ...base, type: "revealVotingResults" };
  }
  if (action.type === "displayText" || action.type === "text") {
    return { ...base, type: "displayText", text: action.text, textTarget: action.textTarget || "presentation", isShown: action.isShown !== false, instant: action.instant === true };
  }
  if (action.type === "setPlayersShown") {
    return { ...base, type: "setPlayersShown", isShown: action.isShown !== false, instant: action.instant === true };
  }
  if (action.type === "setPlayerAnswersShown") {
    return { ...base, type: "setPlayerAnswersShown", isShown: action.isShown !== false, instant: action.instant === true, playerFilter: normalizePlayerFilter(action.playerFilter) };
  }
  if (action.type === "revealPlayerAnswerCorrectness") {
    return { ...base, type: "revealPlayerAnswerCorrectness" };
  }
  if (action.type === "showPoints") {
    return { ...base, type: "showPoints", playerFilter: normalizePlayerFilter(action.playerFilter || "correct"), points: normalizeConstantInteger(action.points, 0, 0, 999999) };
  }
  if (action.type === "givePendingPoints") {
    return { ...base, type: "givePendingPoints" };
  }
  if (action.type === "setTimerShown") {
    return { ...base, type: "setTimerShown", isShown: action.isShown !== false, instant: action.instant === true };
  }
  if (action.type === "startCraftingTimer") {
    return {
      ...base,
      type: "startCraftingTimer"
    };
  }
  if (action.type === "decision") {
    return {
      ...base,
      type: "decision",
      variable: action.variable || "activePlayerCount",
      valueType: normalizeDecisionValueType(action.valueType),
      branches: normalizeDecisionBranches(action)
    };
  }
  if (action.type === "transition") {
    const transition = availableFlowTransitions.find((item) => item.id === action.transition) || availableFlowTransitions[0];
    return { ...base, type: "transition", transition: transition.id, transitionName: transition.name };
  }
  if (action.type === "transitionState") {
    return { ...base, type: "transitionState", targetState: action.targetState, trigger: action.trigger || "" };
  }
  return { ...base, type: "displayText", text: action.text, textTarget: action.textTarget || "presentation", isShown: action.isShown !== false, instant: action.instant === true };
}

function resolveRoomActionText(action, room) {
  if (!action) return null;
  return {
    ...action,
    text: typeof action.text === "string" ? action.text.replaceAll("<ROUND_NUMBER>", roundNumberWord(room.currentRound || 1)) : action.text,
    prompt: typeof action.prompt === "string" ? action.prompt.replaceAll("<ROUND_NUMBER>", roundNumberWord(room.currentRound || 1)) : action.prompt,
    options: Array.isArray(action.options) ? action.options.map((option) => String(option).replaceAll("<ROUND_NUMBER>", roundNumberWord(room.currentRound || 1))) : action.options,
    subActions: (action.subActions || []).map((subAction) => resolveRoomActionText(subAction, room)).filter(Boolean)
  };
}

function roundNumberWord(value) {
  const number = Math.max(1, Math.floor(Number(value) || 1));
  const words = ["Zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve"];
  if (number < words.length) return words[number];
  return String(number);
}

function flowActionIndexById(room, actionId) {
  const target = String(actionId || "");
  if (!target) return -1;
  const normalizedTarget = normalizeFlowId(target, "");
  const actions = getStateActions(room.phase, room);
  return actions.findIndex((action) => {
    if (action.id === target) return true;
    if (normalizeFlowId(action.id, "") === normalizedTarget) return true;
    if (normalizeFlowId(action.name, "") === normalizedTarget) return true;
    return false;
  });
}

function entryActionIndexForPhase(room, phase) {
  const state = runtimeGameFlow(room).states.find((item) => item.id === phase);
  const actions = getStateActions(phase, room);
  const target = flowActionTarget(state?.entryTargetActionId);
  if (isReturnActionTarget(target)) return -2;
  if (isNoActionTarget(target)) return -1;
  if (target) {
    const previousPhase = room.phase;
    room.phase = phase;
    const targetIndex = flowActionIndexById(room, target);
    room.phase = previousPhase;
    if (targetIndex >= 0) return targetIndex;
  }
  return actions.length ? 0 : -1;
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

function advanceRoomAction(room) {
  const actions = getStateActions(room.phase, room);
  if (actions.length === 0) return;
  room.actionIndex = Math.min(room.actionIndex + 1, actions.length);
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

function clearActionTimer(room) {
  if (room.actionTimerId) {
    clearTimeout(room.actionTimerId);
    room.actionTimerId = null;
  }
  room.actionCompletionPendingId = "";
}

function completeCurrentAction(room, expectedActionId = "", source = "callback") {
  const currentAction = currentRoomAction(room);
  if (!currentAction) return false;
  if (expectedActionId && currentAction.id !== expectedActionId) return false;
  if (room.actionCompletionPendingId === currentAction.id) return false;

  const timing = currentAction.timing || { mode: "E+", seconds: 0 };
  if (timing.mode === "S+" && source !== "startTimer") return false;
  if (timing.mode === "E+" && source === "startTimer") return false;

  if (currentAction.type === "transitionState") {
    clearActionTimer(room);
    const delayMs = timing.mode === "E+" ? Math.max(0, Number(timing.seconds || 0) * 1000) : 0;
    const useNodeExit = Boolean(currentAction.nextTargetActionId);
    const completeTransitionState = () => {
      if (useNodeExit) {
        advanceRoomAfterAction(room, currentAction);
        currentRoomAction(room);
        broadcastLobby(room);
        return;
      }
      enterGamePhase(room, currentAction.targetState || "intro");
    };
    if (delayMs > 0) {
      room.actionCompletionPendingId = currentAction.id;
      room.actionTimerId = setTimeout(() => {
        room.actionTimerId = null;
        room.actionCompletionPendingId = "";
        completeTransitionState();
      }, delayMs);
      return true;
    }
    completeTransitionState();
    return true;
  }

  clearActionTimer(room);
  const delayMs = timing.mode === "E+" ? Math.max(0, Number(timing.seconds || 0) * 1000) : 0;
  if (delayMs > 0) {
    room.actionCompletionPendingId = currentAction.id;
    room.actionTimerId = setTimeout(() => {
      room.actionTimerId = null;
      room.actionCompletionPendingId = "";
      if (currentAction.type === "multipleChoiceInput" || currentAction.type === "triviaInput") clearChoiceInput(room);
      if (currentAction.type === "textSubmissionInput") clearTextInput(room);
      advanceRoomAfterAction(room, currentAction);
      currentRoomAction(room);
      broadcastLobby(room);
    }, delayMs);
    return true;
  }

  if (currentAction.type === "multipleChoiceInput" || currentAction.type === "triviaInput") clearChoiceInput(room);
  if (currentAction.type === "textSubmissionInput") clearTextInput(room);
  advanceRoomAfterAction(room, currentAction);
  currentRoomAction(room);
  broadcastLobby(room);
  return true;
}

function clearAppliedActionEffects(room) {
  room.appliedActionEffectId = "";
  room.appliedActionEffectIds = new Set();
}

function hasAppliedActionEffect(room, actionId) {
  if (!room.appliedActionEffectIds) {
    room.appliedActionEffectIds = new Set(room.appliedActionEffectId ? [room.appliedActionEffectId] : []);
  }
  return room.appliedActionEffectIds.has(actionId);
}

function markAppliedActionEffect(room, actionId) {
  if (!room.appliedActionEffectIds) {
    room.appliedActionEffectIds = new Set();
  }
  room.appliedActionEffectIds.add(actionId);
  room.appliedActionEffectId = actionId;
}

function applyRoomActionEffects(room, action) {
  if (!action || hasAppliedActionEffect(room, action.id)) return;
  markAppliedActionEffect(room, action.id);
  if (action.type === "getRandomMultipleChoiceContent") {
    storeRandomTriviaPrompt(room, action.variableName);
  }
  if (action.type === "prepareVotingCards") {
    prepareVotingCards(room);
  }
  if (action.type === "setVotingCardsShown") {
    setVotingCardsShown(room, action);
  }
  if (action.type === "revealVotingResults") {
    revealVotingResults(room);
  }
  if (action.type === "setPlayersShown") {
    room.playersShown = action.isShown !== false;
  }
  if (action.type === "setPlayerAnswersShown") {
    const shouldShow = action.isShown !== false;
    const filter = normalizePlayerFilter(action.playerFilter);
    const targetPlayerIds = shouldShow && filter === "all"
      ? activePlayers(room).map((player) => player.id)
      : filteredPlayerIds(room, filter);
    if (shouldShow) seedDisplayedPlayerAnswers(room, targetPlayerIds);
    room.playerAnswersVisibleFilter = filter;
    room.hiddenPlayerAnswerIds = room.hiddenPlayerAnswerIds instanceof Set ? room.hiddenPlayerAnswerIds : new Set();
    if (filter === "all") {
      room.playerAnswersShown = shouldShow;
      if (shouldShow) room.hiddenPlayerAnswerIds.clear();
      else {
        clearDisplayedCorrectnessForPlayers(room, targetPlayerIds);
        for (const playerId of targetPlayerIds) room.hiddenPlayerAnswerIds.add(playerId);
      }
    } else {
      room.playerAnswersShown = true;
      if (!shouldShow) clearDisplayedCorrectnessForPlayers(room, targetPlayerIds);
      for (const playerId of targetPlayerIds) {
        if (shouldShow) room.hiddenPlayerAnswerIds.delete(playerId);
        else room.hiddenPlayerAnswerIds.add(playerId);
      }
    }
  }
  if (action.type === "revealPlayerAnswerCorrectness") {
    markDisplayedAnswersCorrectness(room);
  }
  if (action.type === "showPoints") {
    const playerIds = filteredPlayerIds(room, action.playerFilter);
    const points = Number(action.points || 0) > 0 ? Number(action.points) : gameConstants().pointsForCorrectAnswer;
    room.pendingPointPopupNonce = Number(room.pendingPointPopupNonce || 0) + 1;
    const nonce = room.pendingPointPopupNonce;
    room.pendingPointPopups = playerIds.map((playerId, index) => {
      const player = room.players.get(playerId);
      if (player) player.pendingPoints = Number(player.pendingPoints || 0) + points;
      return { id: `${nonce}-${playerId}`, nonce, playerId, points, index, createdAt: Date.now() };
    });
  }
  if (action.type === "givePendingPoints") {
    for (const player of room.players.values()) {
      const pending = Number(player.pendingPoints || 0);
      if (pending > 0) {
        player.points = Number(player.points || 0) + pending;
        player.pendingPoints = 0;
      }
    }
  }
  if (action.type === "setTimerShown") {
    setCraftingTimerShown(room, action.isShown !== false);
  }
  if (action.type === "startCraftingTimer") {
    startCraftingTimer(room, action);
  }
}

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

function publicPlayer(player, room, currentAction = null) {
  const choiceAnswer = room.choiceInputAnswers?.get(player.id) || null;
  const textAnswer = room.textInputAnswers?.get(player.id) || null;
  const displayedAnswer = room.displayedPlayerAnswers?.get(player.id) || null;
  const answer = choiceAnswer || textAnswer || null;
  const needsChoiceInput = Boolean(room.choiceInputActionId) && (
    room.choiceInputMode === "continuous" || !choiceAnswer
  );
  const needsTextInput = Boolean(room.textInputActionId) && textAnswer?.done !== true;
  const serializeAnswer = (value) => value ? {
    optionIndex: value.optionIndex,
    originalOptionIndex: value.originalOptionIndex,
    text: value.text,
    done: value.done === true,
    invalid: value.invalid === true,
    correct: value.correct === true ? true : value.correct === false ? false : null,
    hidden: room.hiddenPlayerAnswerIds?.has(player.id) === true,
    nonce: value.nonce || 0
  } : null;
  return {
    id: player.id,
    name: player.name,
    avatar: player.avatar,
    active: player.active,
    joinedAt: player.joinedAt,
    points: Number(player.points || 0),
    pendingPoints: Number(player.pendingPoints || 0),
    isVip: player.id === room.vipPlayerId,
    needsInput: player.active === true && (needsChoiceInput || needsTextInput),
    input: choiceInputPayload(room, currentAction, player),
    answer: serializeAnswer(answer),
    displayedAnswer: serializeAnswer(displayedAnswer)
  };
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

function applyChoiceInputAction(room, action) {
  if (!action || (action.type !== "multipleChoiceInput" && action.type !== "triviaInput" && action.type !== "voteOnAnswersInput")) return;
  if (room.choiceInputActionId === action.id) return;
  if (action.type === "voteOnAnswersInput") {
    room.choiceInputActionId = action.id;
    room.choiceInputPrompt = action.prompt || "Vote for your favorite answer";
    room.choiceInputOptions = [];
    room.choiceInputOriginalIndexes = [];
    room.choiceInputCorrectAnswerIndex = null;
    room.choiceInputKind = "vote";
    room.choiceInputContentId = "";
    room.choiceInputMode = "submitOnce";
    room.choiceInputLocked = true;
    room.choiceInputAnswers = new Map();
    room.votingInputActionId = action.id;
    room.votingInputPrompt = room.choiceInputPrompt;
    room.votingAnswers = new Map();
    return;
  }
  clearDisplayedPlayerAnswers(room);
  clearPlayerAnswerData(room);
  const triviaContent = action.type === "triviaInput" ? triviaContentForAction(room, action) : null;
  room.choiceInputActionId = action.id;
  room.choiceInputPrompt = triviaContent?.prompt || action.prompt || "Answer this question by tapping an answer";
  room.choiceInputOptions = triviaContent?.options || cleanChoiceOptions(action.options);
  room.choiceInputOriginalIndexes = triviaContent?.optionOriginalIndexes || room.choiceInputOptions.map((_, index) => index);
  room.choiceInputCorrectAnswerIndex = Number.isFinite(Number(triviaContent?.correctAnswerIndex)) ? Number(triviaContent.correctAnswerIndex) : null;
  room.choiceInputKind = action.type === "triviaInput" ? "trivia" : "multipleChoice";
  room.choiceInputContentId = triviaContent?.id || "";
  room.choiceInputMode = normalizeChoiceInputMode(action.inputMode);
  room.choiceInputLocked = action.locked === true;
  room.choiceInputAnswers = new Map();
}

function choiceInputPayload(room, currentAction, player = null) {
  if (!currentAction || (currentAction.type !== "multipleChoiceInput" && currentAction.type !== "triviaInput" && currentAction.type !== "voteOnAnswersInput")) return null;
  applyChoiceInputAction(room, currentAction);
  if (currentAction.type === "voteOnAnswersInput") {
    const visibleCards = (room.votingCards || []).filter((card) => card && card.authorPlayerId !== player?.id);
    return {
      actionId: room.choiceInputActionId,
      type: "vote",
      prompt: room.choiceInputPrompt,
      mode: room.choiceInputMode,
      locked: true,
      options: visibleCards.map((card, index) => ({
        index,
        cardId: card.id,
        authorPlayerId: card.authorPlayerId,
        label: card.text,
        text: card.text
      }))
    };
  }
  return {
    actionId: room.choiceInputActionId,
    type: room.choiceInputKind,
    prompt: room.choiceInputPrompt,
    mode: room.choiceInputMode,
    locked: room.choiceInputLocked,
    options: room.choiceInputOptions.map((text, index) => ({
      index,
      label: text,
      text
    }))
  };
}

function applyTextInputAction(room, action) {
  if (!action || action.type !== "textSubmissionInput") return;
  if (room.textInputActionId === action.id) return;
  clearDisplayedPlayerAnswers(room);
  room.textInputActionId = action.id;
  room.textInputPrompt = action.prompt || "Write your answer";
  room.textInputPlaceholder = action.placeholder || "Answer here";
  room.textInputCharacterLimit = normalizeCharacterLimit(action.characterLimit);
  room.textInputAnswers = new Map();
}

function textInputPayload(room, currentAction) {
  if (!currentAction || currentAction.type !== "textSubmissionInput") return null;
  applyTextInputAction(room, currentAction);
  return {
    actionId: room.textInputActionId,
    prompt: room.textInputPrompt,
    placeholder: room.textInputPlaceholder,
    characterLimit: room.textInputCharacterLimit
  };
}

function lobbyPayload(room) {
  selectVip(room);
  const currentAction = room.phase !== "lobby" && room.phase !== "starting" ? resolveRoomActionText(currentRoomAction(room), room) : null;
  applyRoomActionEffects(room, currentAction);
  const input = choiceInputPayload(room, currentAction);
  const textInput = textInputPayload(room, currentAction);
  return {
    type: "lobby",
    stageCode: room.stageCode,
    revision: room.revision,
    phase: room.phase,
    countdownStartedAt: room.countdownStartedAt,
    countdownEndsAt: room.countdownEndsAt,
    action: currentAction,
    debugAction: debugActionPayload(room, currentAction),
    input,
    textInput,
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
    submittedInputCount = players.filter((player) => room.textInputAnswers?.get(player.id)?.done === true).length;
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
    requiredInputCount: players.length,
    submittedInputCount,
    playerAnswerRecordCount: Object.keys(room.playerAnswerRecords || {}).length,
    votingCardCount: Array.isArray(room.votingCards) ? room.votingCards.length : 0,
    visibleVotingCardCount: serializeVotingCards(room).length,
    lastPreparedVotingCardCount: Number(room.lastVotingPrepare?.cardCount || 0),
    lastVotingPrepareSkippedCount: Array.isArray(room.lastVotingPrepare?.skipped) ? room.lastVotingPrepare.skipped.length : 0
  };
}

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

function clearCountdownTimer(room) {
  if (!room.countdownTimerId) return;
  clearTimeout(room.countdownTimerId);
  room.countdownTimerId = null;
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

function enterStartingPhase(room) {
  const now = Date.now();
  const startCountdownMs = Math.round(normalizeDurationSeconds(gameConstants().startGameCountdownDuration, 1) * 1000);
  clearCountdownTimer(room);
  room.phase = "starting";
  room.countdownStartedAt = now;
  room.countdownEndsAt = now + startCountdownMs;
  room.countdownTimerId = setTimeout(() => {
    completeCountdownTrigger(room);
  }, startCountdownMs + START_GO_HOLD_MS);
  broadcastLobby(room);
}

function removeStageClient(stageCode, client) {
  const room = getExistingRoom(stageCode);
  if (!room) return;
  room.stageClients.delete(client);
  if (room.stageClients.size === 0) {
    room.runtimeFlowOverride = null;
  }
}

function handleStageEvents(req, res, stageCode) {
  if (!stageCode) {
    sendJson(res, 400, { ok: false, error: "Missing stage code" });
    return;
  }

  const room = getRoom(stageCode);
  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "Access-Control-Allow-Origin": "*"
  });
  res.write(": connected\n\n");

  room.stageClients.add(res);
  sendSse(res, "ready", { stageCode });
  sendSse(res, "lobby", lobbyPayload(room));

  const heartbeat = setInterval(() => {
    sendSse(res, "ping", { sentAt: Date.now() });
  }, HEARTBEAT_INTERVAL_MS);

  req.on("close", () => {
    clearInterval(heartbeat);
    removeStageClient(stageCode, res);
  });
}

async function handleJoin(req, res) {
  let payload;
  try {
    payload = await readJson(req);
  } catch (error) {
    sendJson(res, 400, { ok: false, error: "Invalid JSON payload" });
    return;
  }

  const stageCode = normalizeStageCode(payload.stageCode);
  const playerName = cleanPlayerName(payload.playerName);
  let playerId = normalizePlayerId(payload.playerId) || `p-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  if (!stageCode || !playerName) {
    sendJson(res, 400, { ok: false, error: "Stage code and player name are required" });
    return;
  }

  const room = getRoom(stageCode);
  let player = room.players.get(playerId);
  if (player && player.active && player.name !== playerName) {
    playerId = `p-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    player = null;
  }

  if (!player) {
    player = {
      id: playerId,
      name: playerName,
      avatar: makeRandomAvatar(room, playerId),
      active: true,
      kickedFromGame: false,
      points: 0,
      pendingPoints: 0,
      joinedAt: Date.now(),
      lastSeen: Date.now()
    };
    room.players.set(playerId, player);
  } else {
    player.name = playerName;
    player.active = true;
    player.kickedFromGame = false;
    player.lastSeen = Date.now();
  }

  selectVip(room);
  broadcastLobby(room);
  sendJson(res, 200, { ok: true, player: publicPlayer(player, room), lobby: lobbyPayload(room) });
}

async function handleHeartbeat(req, res) {
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
  if (!room || !player) {
    sendJson(res, 404, { ok: false, error: "Player is not in this lobby" });
    return;
  }
  if (player.kickedFromGame) {
    sendJson(res, 409, { ok: false, errorCode: "KICKED_TO_LOBBY", error: "Player was returned to the join screen" });
    return;
  }

  const wasInactive = !player.active;
  player.active = true;
  player.lastSeen = Date.now();
  selectVip(room);
  if (wasInactive) broadcastLobby(room);
  sendJson(res, 200, { ok: true, player: publicPlayer(player, room), lobby: lobbyPayload(room) });
}

async function handleSelectAvatar(req, res) {
  let payload;
  try {
    payload = await readJson(req);
  } catch (error) {
    sendJson(res, 400, { ok: false, error: "Invalid JSON payload" });
    return;
  }

  const stageCode = normalizeStageCode(payload.stageCode);
  const playerId = normalizePlayerId(payload.playerId);
  const shape = normalizeAvatarShape(payload.shape);
  const room = getExistingRoom(stageCode);
  const player = room?.players.get(playerId);
  if (!room || !player) {
    sendJson(res, 404, { ok: false, error: "Player is not in this lobby" });
    return;
  }
  if (!shape) {
    sendJson(res, 400, { ok: false, error: "Choose a valid avatar" });
    return;
  }
  if (player.kickedFromGame) {
    sendJson(res, 409, { ok: false, errorCode: "KICKED_TO_LOBBY", error: "Player was returned to the join screen" });
    return;
  }

  player.avatar = {
    color: player.avatar?.color || randomArrayItem(gameConstants().playerColors),
    shape
  };
  player.active = true;
  player.lastSeen = Date.now();
  broadcastLobby(room);
  sendJson(res, 200, { ok: true, player: publicPlayer(player, room), lobby: lobbyPayload(room) });
}

async function handleLeave(req, res) {
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
  if (!room || !player) {
    sendJson(res, 200, { ok: true });
    return;
  }

  if (player.active) {
    player.active = false;
    player.lastSeen = Date.now();
    selectVip(room);
    broadcastLobby(room);
  }
  sendJson(res, 200, { ok: true });
}

async function handleStart(req, res) {
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
    sendJson(res, 403, { ok: false, error: "Only the VIP can start the game" });
    return;
  }
  if (!payload.startToken || payload.startToken !== room.startToken) {
    sendJson(res, 403, { ok: false, error: "Start request is stale" });
    return;
  }
  if (room.phase === "intro") {
    sendJson(res, 200, { ok: true, lobby: lobbyPayload(room) });
    return;
  }
  if (room.phase === "starting") {
    sendJson(res, 200, { ok: true, lobby: lobbyPayload(room) });
    return;
  }

  enterStartingPhase(room);
  sendJson(res, 200, { ok: true, lobby: lobbyPayload(room) });
}

async function handleCancelStart(req, res) {
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
    sendJson(res, 403, { ok: false, error: "Only the VIP can cancel the start" });
    return;
  }
  if (!payload.startToken || payload.startToken !== room.startToken) {
    sendJson(res, 403, { ok: false, error: "Cancel request is stale" });
    return;
  }
  if (room.phase !== "starting") {
    sendJson(res, 200, { ok: true, lobby: lobbyPayload(room) });
    return;
  }
  if (Date.now() >= room.countdownEndsAt) {
    sendJson(res, 200, { ok: true, lobby: lobbyPayload(room) });
    return;
  }

  enterLobbyPhase(room);
  broadcastLobby(room);
  sendJson(res, 200, { ok: true, lobby: lobbyPayload(room) });
}

async function handleAdvancePresentation(req, res) {
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

  if (room.presentedAction?.type === "present") {
    room.presentedAction = null;
    broadcastLobby(room);
    sendJson(res, 200, { ok: true, lobby: lobbyPayload(room) });
    return;
  }

  const currentAction = currentRoomAction(room);
  if (!currentAction || currentAction.type !== "present") {
    sendJson(res, 200, { ok: true, lobby: lobbyPayload(room) });
    return;
  }

  completeCurrentAction(room, payload.actionId, payload.source || "callback");
  sendJson(res, 200, { ok: true, lobby: lobbyPayload(room) });
}

async function handleCompleteAction(req, res) {
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

  const currentAction = currentRoomAction(room);
  if (currentAction?.type === "transition" || currentAction?.type === "transitionState" || currentAction?.type === "displayText" || currentAction?.type === "present" || currentAction?.type === "setPlayersShown" || currentAction?.type === "setPlayerAnswersShown" || currentAction?.type === "revealPlayerAnswerCorrectness" || currentAction?.type === "showPoints" || currentAction?.type === "givePendingPoints" || currentAction?.type === "setTimerShown" || currentAction?.type === "startCraftingTimer" || currentAction?.type === "getRandomMultipleChoiceContent" || currentAction?.type === "prepareVotingCards" || currentAction?.type === "setVotingCardsShown" || currentAction?.type === "voteOnAnswersInput" || currentAction?.type === "revealVotingResults" || currentAction?.type === "multipleChoiceInput" || currentAction?.type === "triviaInput" || currentAction?.type === "textSubmissionInput" || currentAction?.type === "doNothing" || currentAction?.type === "playAudio") {
    completeCurrentAction(room, payload.actionId, payload.source || "callback");
  }
  sendJson(res, 200, { ok: true, lobby: lobbyPayload(room) });
}

async function handleActionEffect(req, res) {
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

  const actionId = String(payload.actionId || "");
  const currentAction = resolveRoomActionText(currentRoomAction(room), room);
  const subAction = (currentAction?.subActions || []).find((action) => action.id === actionId);
  if (!subAction) {
    sendJson(res, 409, { ok: false, error: "Sub-action is not active" });
    return;
  }

  applyRoomActionEffects(room, subAction);
  broadcastLobby(room);
  sendJson(res, 200, { ok: true, lobby: lobbyPayload(room) });
}

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
