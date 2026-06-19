const http = require("http");
const childProcess = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "0.0.0.0";
const ROOT = __dirname;
const INDEX_FILE = path.join(ROOT, "index.html");
const PACKAGE_FILE = path.join(ROOT, "package.json");
const BUILD_INFO_FILE = path.join(ROOT, "build-info.json");
const DEFAULT_GAME_FLOW_FILE = path.join(ROOT, "game-flow.default.json");
const GAME_FLOW_FILE = path.resolve(ROOT, process.env.GAME_FLOW_FILE || "game-flow.json");
const GAME_FLOW_BACKUP_DIR = path.join(ROOT, "game-flow.backups");
const DEFAULT_GAME_CONSTANTS_FILE = path.join(ROOT, "game-constants.default.json");
const GAME_CONSTANTS_FILE = path.resolve(ROOT, process.env.GAME_CONSTANTS_FILE || "game-constants.json");
const GAME_CONSTANTS_BACKUP_DIR = path.join(ROOT, "game-constants.backups");
const DEFAULT_STAGE_LAYOUTS_FILE = path.join(ROOT, "stage-layouts.default.json");
const STAGE_LAYOUTS_FILE = path.resolve(ROOT, process.env.STAGE_LAYOUTS_FILE || "stage-layouts.json");
const STAGE_LAYOUTS_BACKUP_DIR = path.join(ROOT, "stage-layouts.backups");
const GAME_FLOW_GITHUB_TOKEN = process.env.GAME_FLOW_GITHUB_TOKEN || process.env.GITHUB_TOKEN || "";
const GAME_FLOW_STORAGE = String(process.env.GAME_FLOW_STORAGE || (GAME_FLOW_GITHUB_TOKEN ? "github" : "local")).toLowerCase();
const GAME_FLOW_GITHUB_REPO = process.env.GAME_FLOW_GITHUB_REPO || process.env.GITHUB_REPOSITORY || "MarkTurowetz/pop-party";
const GAME_FLOW_GITHUB_BRANCH = process.env.GAME_FLOW_GITHUB_BRANCH || "game-data";
const GAME_FLOW_GITHUB_BASE_BRANCH = process.env.GAME_FLOW_GITHUB_BASE_BRANCH || "main";
const GAME_FLOW_GITHUB_PATH = process.env.GAME_FLOW_GITHUB_PATH || "game-flow.json";
const GAME_CONSTANTS_GITHUB_PATH = process.env.GAME_CONSTANTS_GITHUB_PATH || "game-constants.json";
const STAGE_LAYOUTS_GITHUB_PATH = process.env.STAGE_LAYOUTS_GITHUB_PATH || "stage-layouts.json";
const ART_ROOT = path.join(ROOT, "art");
const ART_DEFAULT_DIR = path.join(ART_ROOT, "default");
const ART_CUSTOM_DIR = path.join(ART_ROOT, "custom");
const ART_MANIFEST_FILE = path.join(ART_ROOT, "art-manifest.json");
const CONTROLLER_TIMEOUT_MS = 10000;
const HEARTBEAT_INTERVAL_MS = 25000;
const START_COUNTDOWN_MS = 3000;
const START_GO_HOLD_MS = 700;
const availableFlowTransitions = [
  { id: "horizontalWipe", name: "Horizontal Wipe" }
];
const availableFlowActionTypes = [
  { id: "presentText", name: "Present Text", category: "input" },
  { id: "displayText", name: "Display Text", category: "standard" },
  { id: "setPlayersShown", name: "Set Players Shown", category: "standard" },
  { id: "transition", name: "Do Transition", category: "standard" },
  { id: "transitionState", name: "Transition To State", category: "standard" },
  { id: "text", name: "Show Text", category: "standard" }
];
const defaultGameFlow = {
  states: [
    {
      id: "lobby",
      name: "Lobby Game State",
      actions: [
        {
          id: "lobby-countdown-complete",
          name: "On Countdown Complete",
          type: "transitionState",
          timing: { mode: "E+", seconds: 0 },
          trigger: "onCountdownComplete",
          targetState: "intro"
        }
      ]
    },
    {
      id: "intro",
      name: "Game Intro Game State",
      actions: [
        {
          id: "intro-present-1",
          name: "Present Intro Text",
          type: "presentText",
          timing: { mode: "E+", seconds: 0 },
          textTarget: "presentation",
          instant: false,
          text: "I'm using this tool to dictate game actions"
        },
        {
          id: "intro-present-2",
          name: "Present Second Text",
          type: "presentText",
          timing: { mode: "E+", seconds: 0 },
          textTarget: "presentation",
          instant: false,
          text: "This is the second action"
        },
        {
          id: "intro-wipe",
          name: "Do Horizontal Wipe",
          type: "transition",
          timing: { mode: "E+", seconds: 0 },
          transition: "horizontalWipe"
        },
        {
          id: "intro-hide-players",
          name: "Hide Players",
          type: "setPlayersShown",
          timing: { mode: "E+", seconds: 0 },
          isShown: false,
          instant: false
        },
        {
          id: "intro-show-players",
          name: "Show Players",
          type: "setPlayersShown",
          timing: { mode: "E+", seconds: 0 },
          isShown: true,
          instant: false
        }
      ]
    }
  ]
};

const rooms = new Map();
const defaultPlayerColors = ["#22d3ee", "#60d394", "#ffe156", "#ff9e2c", "#ff4fa3", "#7c3aed", "#2458ff", "#ef4444", "#f97316"];
const avatarShapes = ["rex", "stego", "trike", "raptor", "bronto", "ankylo"];
const defaultGameConstants = {
  playerColors: defaultPlayerColors
};
const defaultStageLayouts = {
  canvas: { width: 1920, height: 1080 },
  states: [
    {
      id: "lobby",
      name: "Lobby",
      elements: [
        { id: "startPopup", name: "Countdown Popup", selector: "#startPopup", x: 960, y: 130, width: 700, height: 130, scale: 1 },
        { id: "stageTitle", name: "Header", selector: ".stage-title", x: 960, y: 190, width: 1080, height: 150, scale: 1 },
        { id: "stageCodePanel", name: "Stage Code Panel", selector: ".stage-code-panel", x: 960, y: 390, width: 560, height: 190, scale: 1 },
        { id: "waitingStatus", name: "Waiting Status", selector: "#waitingStatus", x: 960, y: 575, width: 700, height: 82, scale: 1 },
        { id: "joinPrompt", name: "Join Prompt", selector: "#joinPrompt", x: 960, y: 650, width: 740, height: 76, scale: 1 },
        { id: "playerLobby", name: "Player Avatars", selector: "#playerLobby", x: 960, y: 920, width: 1320, height: 150, scale: 1 }
      ]
    },
    {
      id: "intro",
      name: "Game Intro",
      elements: [
        { id: "stageCodeBadge", name: "Stage Code Widget", selector: "#stageCodeBadge", x: 108, y: 70, width: 170, height: 82, scale: 1 },
        { id: "stageIntroTitle", name: "Intro Header", selector: "#stageIntroTitle", x: 960, y: 235, width: 1060, height: 130, scale: 1 },
        { id: "stagePresentationText", name: "Presentation Text", selector: "#stagePresentationText", x: 960, y: 460, width: 980, height: 240, scale: 1 },
        { id: "stagePromptText", name: "Prompt Text", selector: "#stagePromptText", x: 960, y: 760, width: 860, height: 120, scale: 1 },
        { id: "presentClickWidget", name: "Click Cursor", selector: "#presentClickWidget", x: 1780, y: 930, width: 90, height: 90, scale: 1 },
        { id: "playerLobby", name: "Player Avatars", selector: "#playerLobby", x: 960, y: 935, width: 1320, height: 150, scale: 1 }
      ]
    }
  ]
};
const acceptedArtTypes = {
  "image/png": ".png",
  "image/svg+xml": ".svg",
  "image/jpeg": ".jpg",
  "image/webp": ".webp"
};
const artAssets = [
  { id: "avatar-frame", name: "Shared Avatar Frame", category: "Player Avatar", parent: "player-avatar", defaultFile: "avatar-frame.svg", use: "Shared frame layer used by every player avatar", sharedBy: ["Rex Avatar", "Stego Avatar", "Trike Avatar", "Raptor Avatar", "Bronto Avatar", "Ankylo Avatar"] },
  { id: "avatar-rex", name: "Rex Dinosaur", category: "Player Avatar", parent: "player-avatar", defaultFile: "dino-rex.svg", use: "Dinosaur silhouette layer for rex slots" },
  { id: "avatar-stego", name: "Stego Dinosaur", category: "Player Avatar", parent: "player-avatar", defaultFile: "dino-stego.svg", use: "Dinosaur silhouette layer for stego slots" },
  { id: "avatar-trike", name: "Trike Dinosaur", category: "Player Avatar", parent: "player-avatar", defaultFile: "dino-trike.svg", use: "Dinosaur silhouette layer for trike slots" },
  { id: "avatar-raptor", name: "Raptor Dinosaur", category: "Player Avatar", parent: "player-avatar", defaultFile: "dino-raptor.svg", use: "Dinosaur silhouette layer for raptor slots" },
  { id: "avatar-bronto", name: "Bronto Dinosaur", category: "Player Avatar", parent: "player-avatar", defaultFile: "dino-bronto.svg", use: "Dinosaur silhouette layer for bronto slots" },
  { id: "avatar-ankylo", name: "Ankylo Dinosaur", category: "Player Avatar", parent: "player-avatar", defaultFile: "dino-ankylo.svg", use: "Dinosaur silhouette layer for ankylo slots" },
  { id: "presentation-click-cursor", name: "Presentation Click Cursor", category: "Presentation Click Prompt", parent: "presentation-click-prompt", defaultFile: "cursor-arrow.svg", use: "Cursor art for presented-text click prompt" }
];
const artGroups = [
  { id: "player-avatar", name: "Player Avatar", description: "Composed from the shared avatar frame plus one dinosaur silhouette." },
  { id: "presentation-click-prompt", name: "Presentation Click Prompt", description: "Standalone cursor art; it does not use the avatar frame." }
];

function readAppVersion() {
  try {
    const buildInfo = JSON.parse(fs.readFileSync(BUILD_INFO_FILE, "utf8"));
    if (buildInfo.version) return buildInfo.version;
  } catch (error) {
    // Fall back below for older checkouts or local experiments.
  }
  try {
    const manifest = JSON.parse(fs.readFileSync(PACKAGE_FILE, "utf8"));
    const buildNumber = readBuildNumber();
    return buildNumber ? `${manifest.version}.${buildNumber}` : manifest.version || "0.0.0";
  } catch (error) {
    return "0.0.0";
  }
}

function readBuildNumber() {
  try {
    return childProcess.execSync("git rev-list --count HEAD", {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    }).trim();
  } catch (error) {
    return "";
  }
}

const APP_VERSION = readAppVersion();

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

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  });
  res.end(body);
}

function contentTypeForFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".svg") return "image/svg+xml; charset=utf-8";
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  return "application/octet-stream";
}

function readJson(req, maxBytes = 8192) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > maxBytes) {
        reject(new Error("Payload too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function readArtManifest() {
  try {
    return JSON.parse(fs.readFileSync(ART_MANIFEST_FILE, "utf8"));
  } catch (error) {
    return {};
  }
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

function normalizeColor(value) {
  const color = String(value || "").trim();
  return /^#[0-9a-fA-F]{6}$/.test(color) ? color.toLowerCase() : "";
}

function normalizeGameConstants(constants) {
  const colors = Array.isArray(constants?.playerColors) ? constants.playerColors : defaultPlayerColors;
  const playerColors = [...new Set(colors.map(normalizeColor).filter(Boolean))];
  return {
    playerColors: playerColors.length ? playerColors : [...defaultPlayerColors]
  };
}

function normalizeStageLayouts(layouts) {
  const incomingCanvas = layouts?.canvas || defaultStageLayouts.canvas;
  const canvas = {
    width: normalizeLayoutNumber(incomingCanvas.width, defaultStageLayouts.canvas.width, 640, 10000),
    height: normalizeLayoutNumber(incomingCanvas.height, defaultStageLayouts.canvas.height, 360, 10000)
  };
  const incomingStates = Array.isArray(layouts?.states) ? layouts.states : defaultStageLayouts.states;
  const normalizedDefaultStates = defaultStageLayouts.states.map((state, index) => normalizeLayoutState(state, index)).filter(Boolean);
  const defaultStatesById = new Map(normalizedDefaultStates.map((state) => [state.id, state]));
  const normalizedIncomingStates = incomingStates.map((state, stateIndex) => normalizeLayoutState(state, stateIndex)).filter(Boolean);
  const migratedStates = migrateStageLayoutStates(normalizedIncomingStates);
  const normalizedStates = migratedStates.filter((state) => defaultStatesById.has(state.id));
  for (const defaultState of normalizedDefaultStates) {
    if (!normalizedStates.some((state) => state.id === defaultState.id)) {
      normalizedStates.push(cloneJson(defaultState));
    }
  }
  return {
    canvas,
    states: normalizedStates.map((state) => {
      const defaultState = defaultStatesById.get(state.id);
      if (!defaultState) return state;
      const elements = [...state.elements];
      for (const element of defaultState.elements) {
        if (!elements.some((item) => item.id === element.id)) elements.push(cloneJson(element));
      }
      return { ...state, elements };
    })
  };
}

function migrateStageLayoutStates(states) {
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
  return states;
}

function normalizeLayoutState(state, stateIndex) {
  if (!state || typeof state !== "object") return null;
  const fallbackId = stateIndex === 0 ? "lobby" : `layout-state-${stateIndex + 1}`;
  return {
    id: normalizeFlowId(state.id || state.name, fallbackId),
    name: cleanFlowText(state.name, state.id || fallbackId),
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
  return {
    id: normalizeFlowId(element.id || element.name, fallbackId),
    name: cleanFlowText(element.name, element.id || fallbackId),
    selector: cleanLayoutSelector(element.selector),
    x: normalizeLayoutNumber(element.x, defaultStageLayouts.canvas.width / 2, -5000, 15000),
    y: normalizeLayoutNumber(element.y, defaultStageLayouts.canvas.height / 2, -5000, 15000),
    width,
    height,
    scale: normalizeLayoutNumber(element.scale, 1, 0.05, 10)
  };
}

function normalizeLayoutNumber(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Number(Math.max(min, Math.min(max, number)).toFixed(3));
}

function cleanLayoutSelector(value) {
  return String(value || "").trim().replace(/[\n\r]/g, "").slice(0, 120);
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
      actions: actions.map((action, actionIndex) => normalizeFlowAction(action, actionIndex, id)).filter(Boolean)
    };
  });
  if (!states.some((state) => state.id === "lobby")) {
    states.unshift(defaultGameFlow.states[0]);
  }
  return { states };
}

function flowActionTypeMeta(type) {
  return availableFlowActionTypes.find((item) => item.id === type) || availableFlowActionTypes[0];
}

function normalizeFlowAction(action, actionIndex, stateId, isSubAction = false) {
  const type = availableFlowActionTypes.some((item) => item.id === action?.type) ? action.type : "presentText";
  const category = flowActionTypeMeta(type).category;
  const fallbackId = `${stateId}-${isSubAction ? "sub-action" : "action"}-${actionIndex + 1}`;
  const base = {
    id: normalizeFlowId(action?.id || action?.name, fallbackId),
    name: cleanFlowText(action?.name, `Action ${actionIndex + 1}`),
    type,
    category,
    timing: normalizeActionTiming(action?.timing, category !== "input", isSubAction),
    subActions: normalizeSubActions(action?.subActions, stateId)
  };
  if (type === "presentText") {
    return {
      ...base,
      text: cleanFlowText(action?.text, "Presented text"),
      textTarget: normalizeTextTarget(action?.textTarget),
      instant: action?.instant === true
    };
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
  return value === "prompt" ? "prompt" : "presentation";
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

function readJsonFile(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
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
  return normalizeGameConstants(readGameConstantsSource());
}

function readStageLayoutsSource() {
  return cloneJson(stageLayoutsStore.source || readDefaultStageLayoutsSource());
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
  backupGameConstantsSource();
  if (gameConstantsStore.storageKind === "github") {
    if (!GAME_FLOW_GITHUB_TOKEN) {
      throw new Error("GAME_FLOW_GITHUB_TOKEN is not configured. Refusing to save to ephemeral local storage.");
    }
    const saved = await writeGithubJsonSource(normalized, gameConstantsStore.remoteSha, GAME_CONSTANTS_GITHUB_PATH, "Save game constants");
    gameConstantsStore.source = normalizeGameConstants(saved.data);
    gameConstantsStore.remoteSha = saved.sha || "";
    gameConstantsStore.loadedAt = Date.now();
    gameConstantsStore.error = "";
    mirrorGameConstantsSource(gameConstantsStore.source);
    return readGameConstantsSource();
  }
  writeLocalGameConstantsSource(normalized);
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
  const normalized = normalizeStageLayouts(layouts);
  backupStageLayoutsSource();
  if (stageLayoutsStore.storageKind === "github") {
    if (!GAME_FLOW_GITHUB_TOKEN) {
      throw new Error("GAME_FLOW_GITHUB_TOKEN is not configured. Refusing to save to ephemeral local storage.");
    }
    const saved = await writeGithubJsonSource(normalized, stageLayoutsStore.remoteSha, STAGE_LAYOUTS_GITHUB_PATH, "Save stage layouts");
    stageLayoutsStore.source = normalizeStageLayouts(saved.data);
    stageLayoutsStore.remoteSha = saved.sha || "";
    stageLayoutsStore.loadedAt = Date.now();
    stageLayoutsStore.error = "";
    mirrorStageLayoutsSource(stageLayoutsStore.source);
    return readStageLayoutsSource();
  }
  writeLocalStageLayoutsSource(normalized);
  stageLayoutsStore.source = normalized;
  stageLayoutsStore.loadedAt = Date.now();
  return readStageLayoutsSource();
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
  backupGameFlowSource();
  if (gameFlowStore.storageKind === "github") {
    if (!GAME_FLOW_GITHUB_TOKEN) {
      throw new Error("GAME_FLOW_GITHUB_TOKEN is not configured. Refusing to save to ephemeral local storage.");
    }
    const saved = await writeGithubGameFlowSource(merged, gameFlowStore.remoteSha);
    gameFlowStore.source = saved.flow;
    gameFlowStore.remoteSha = saved.sha || "";
    gameFlowStore.loadedAt = Date.now();
    gameFlowStore.error = "";
    mirrorGameFlowSource(saved.flow);
    return saved.flow;
  }
  writeLocalGameFlowSource(merged);
  gameFlowStore.source = merged;
  gameFlowStore.loadedAt = Date.now();
  return merged;
}

function backupGameFlowSource() {
  if (!fs.existsSync(GAME_FLOW_FILE)) return;
  fs.mkdirSync(GAME_FLOW_BACKUP_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  fs.copyFileSync(GAME_FLOW_FILE, path.join(GAME_FLOW_BACKUP_DIR, `game-flow-${stamp}.json`));
}

function backupGameConstantsSource() {
  if (!fs.existsSync(GAME_CONSTANTS_FILE)) return;
  fs.mkdirSync(GAME_CONSTANTS_BACKUP_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  fs.copyFileSync(GAME_CONSTANTS_FILE, path.join(GAME_CONSTANTS_BACKUP_DIR, `game-constants-${stamp}.json`));
}

function backupStageLayoutsSource() {
  if (!fs.existsSync(STAGE_LAYOUTS_FILE)) return;
  fs.mkdirSync(STAGE_LAYOUTS_BACKUP_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  fs.copyFileSync(STAGE_LAYOUTS_FILE, path.join(STAGE_LAYOUTS_BACKUP_DIR, `stage-layouts-${stamp}.json`));
}

function writeLocalGameFlowSource(flow) {
  fs.writeFileSync(GAME_FLOW_FILE, `${JSON.stringify(flow, null, 2)}\n`);
}

function writeLocalGameConstantsSource(constants) {
  fs.writeFileSync(GAME_CONSTANTS_FILE, `${JSON.stringify(constants, null, 2)}\n`);
}

function writeLocalStageLayoutsSource(layouts) {
  fs.writeFileSync(STAGE_LAYOUTS_FILE, `${JSON.stringify(layouts, null, 2)}\n`);
}

function mirrorGameFlowSource(flow) {
  try {
    writeLocalGameFlowSource(flow);
  } catch (error) {
    // The durable provider is authoritative; local mirrors are best-effort.
  }
}

function mirrorGameConstantsSource(constants) {
  try {
    writeLocalGameConstantsSource(constants);
  } catch (error) {
    // Durable storage is authoritative; local mirrors are best-effort.
  }
}

function mirrorStageLayoutsSource(layouts) {
  try {
    writeLocalStageLayoutsSource(layouts);
  } catch (error) {
    // Durable storage is authoritative; local mirrors are best-effort.
  }
}

function githubFlowHeaders() {
  return {
    "Accept": "application/vnd.github+json",
    "Authorization": `Bearer ${GAME_FLOW_GITHUB_TOKEN}`,
    "User-Agent": "flip-7-party",
    "X-GitHub-Api-Version": "2022-11-28"
  };
}

async function githubRequest(pathname, options = {}) {
  const response = await fetch(`https://api.github.com${pathname}`, {
    ...options,
    headers: {
      ...githubFlowHeaders(),
      ...(options.headers || {})
    }
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const error = new Error(data?.message || `GitHub request failed with ${response.status}`);
    error.status = response.status;
    error.data = data;
    throw error;
  }
  return data;
}

function githubRepoPath() {
  return `/repos/${GAME_FLOW_GITHUB_REPO}`;
}

function githubContentPath(filePath) {
  return filePath.split("/").map((part) => encodeURIComponent(part)).join("/");
}

async function ensureGithubDataBranch() {
  if (GAME_FLOW_GITHUB_BRANCH === GAME_FLOW_GITHUB_BASE_BRANCH) return;
  try {
    await githubRequest(`${githubRepoPath()}/git/ref/heads/${GAME_FLOW_GITHUB_BRANCH}`);
    return;
  } catch (error) {
    if (error.status !== 404) throw error;
  }
  const baseRef = await githubRequest(`${githubRepoPath()}/git/ref/heads/${GAME_FLOW_GITHUB_BASE_BRANCH}`);
  await githubRequest(`${githubRepoPath()}/git/refs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ref: `refs/heads/${GAME_FLOW_GITHUB_BRANCH}`,
      sha: baseRef.object.sha
    })
  });
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
  await ensureGithubDataBranch();
  try {
    const file = await githubRequest(`${githubRepoPath()}/contents/${githubContentPath(filePath)}?ref=${encodeURIComponent(GAME_FLOW_GITHUB_BRANCH)}`);
    if (!file?.content) return null;
    const json = Buffer.from(file.content, "base64").toString("utf8");
    return { data: JSON.parse(json), sha: file.sha || "" };
  } catch (error) {
    if (error.status === 404) return null;
    throw error;
  }
}

async function writeGithubJsonSource(data, sha = "", filePath = GAME_FLOW_GITHUB_PATH, messagePrefix = "Save JSON", retryConflict = true) {
  await ensureGithubDataBranch();
  const payload = {
    message: `${messagePrefix} ${new Date().toISOString()}`,
    content: Buffer.from(`${JSON.stringify(data, null, 2)}\n`).toString("base64"),
    branch: GAME_FLOW_GITHUB_BRANCH
  };
  if (sha) payload.sha = sha;
  try {
    const result = await githubRequest(`${githubRepoPath()}/contents/${githubContentPath(filePath)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    return { data, sha: result?.content?.sha || "" };
  } catch (error) {
    if (!retryConflict || error.status !== 409 || !sha) throw error;
    const latest = await readGithubJsonSource(filePath);
    return writeGithubJsonSource(data, latest?.sha || "", filePath, messagePrefix, retryConflict);
  }
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

function getStateActions(stateId) {
  return getFlowState(readGameFlow(), stateId)?.actions || [];
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
    subActions: (action.subActions || []).map((subAction, subActionIndex) => publicFlowAction(subAction, subActionIndex)).filter(Boolean)
  };
  if (action.type === "presentText") {
    return { ...base, type: "present", text: action.text, textTarget: action.textTarget || "presentation", instant: action.instant === true };
  }
  if (action.type === "displayText" || action.type === "text") {
    return { ...base, type: "displayText", text: action.text, textTarget: action.textTarget || "presentation", isShown: action.isShown !== false, instant: action.instant === true };
  }
  if (action.type === "setPlayersShown") {
    return { ...base, type: "setPlayersShown", isShown: action.isShown !== false, instant: action.instant === true };
  }
  if (action.type === "transition") {
    const transition = availableFlowTransitions.find((item) => item.id === action.transition) || availableFlowTransitions[0];
    return { ...base, type: "transition", transition: transition.id, transitionName: transition.name };
  }
  if (action.type === "transitionState") {
    return { ...base, type: "transitionState", targetState: action.targetState };
  }
  return { ...base, type: "displayText", text: action.text, textTarget: action.textTarget || "presentation", isShown: action.isShown !== false, instant: action.instant === true };
}

function currentRoomAction(room) {
  if (room.presentedAction) return room.presentedAction;
  const actions = getStateActions(room.phase);
  if (room.actionIndex >= actions.length) return null;
  return publicFlowAction(actions[room.actionIndex], room.actionIndex);
}

function advanceRoomAction(room) {
  const actions = getStateActions(room.phase);
  if (actions.length === 0) return;
  room.actionIndex = Math.min(room.actionIndex + 1, actions.length);
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

  clearActionTimer(room);
  const delayMs = timing.mode === "E+" ? Math.max(0, Number(timing.seconds || 0) * 1000) : 0;
  if (delayMs > 0) {
    room.actionCompletionPendingId = currentAction.id;
    room.actionTimerId = setTimeout(() => {
      room.actionTimerId = null;
      room.actionCompletionPendingId = "";
      advanceRoomAction(room);
      broadcastLobby(room);
    }, delayMs);
    return true;
  }

  advanceRoomAction(room);
  broadcastLobby(room);
  return true;
}

function applyRoomActionEffects(room, action) {
  if (!action || room.appliedActionEffectId === action.id) return;
  room.appliedActionEffectId = action.id;
  if (action.type === "setPlayersShown") {
    room.playersShown = action.isShown !== false;
  }
}

function countdownTargetState() {
  const lobbyState = getFlowState(readGameFlow(), "lobby");
  const action = lobbyState?.actions.find((item) => item.type === "transitionState" && item.trigger === "onCountdownComplete");
  return action?.targetState || "intro";
}

function writeArtManifest(manifest) {
  fs.mkdirSync(ART_ROOT, { recursive: true });
  fs.mkdirSync(ART_CUSTOM_DIR, { recursive: true });
  fs.writeFileSync(ART_MANIFEST_FILE, `${JSON.stringify(manifest, null, 2)}\n`);
}

function cacheBustFileUrl(filePath, urlPath) {
  try {
    const version = Math.round(fs.statSync(filePath).mtimeMs);
    return `${urlPath}?v=${version}`;
  } catch (error) {
    return urlPath;
  }
}

function publicArtAsset(asset, manifest) {
  const custom = manifest[asset.id] || null;
  const defaultFilePath = path.join(ART_DEFAULT_DIR, asset.defaultFile);
  const defaultUrl = cacheBustFileUrl(defaultFilePath, `/art/default/${asset.defaultFile}`);
  const customFile = custom?.fileName ? path.basename(custom.fileName) : "";
  const customFilePath = customFile ? path.join(ART_CUSTOM_DIR, customFile) : "";
  const hasCustom = Boolean(customFile && fs.existsSync(customFilePath));
  const currentUrl = hasCustom ? cacheBustFileUrl(customFilePath, `/art/custom/${customFile}`) : defaultUrl;
  return {
    id: asset.id,
    name: asset.name,
    category: asset.category,
    parent: asset.parent,
    use: asset.use,
    sharedBy: asset.sharedBy || [],
    expectedTypes: Object.keys(acceptedArtTypes),
    defaultUrl,
    currentUrl,
    hasCustom,
    fileName: hasCustom ? customFile : asset.defaultFile,
    updatedAt: hasCustom ? custom.updatedAt : null
  };
}

function sendArtAssetList(res) {
  const manifest = readArtManifest();
  sendJson(res, 200, {
    ok: true,
    groups: artGroups,
    assets: artAssets.map((asset) => publicArtAsset(asset, manifest))
  });
}

async function handleReplaceArtAsset(req, res, assetId) {
  const asset = artAssets.find((item) => item.id === assetId);
  if (!asset) {
    sendJson(res, 404, { ok: false, error: "Art asset not found" });
    return;
  }

  let payload;
  try {
    payload = await readJson(req, 7 * 1024 * 1024);
  } catch (error) {
    sendJson(res, 400, { ok: false, error: "Invalid JSON payload" });
    return;
  }

  const dataUrl = String(payload.dataUrl || "");
  const fileName = path.basename(String(payload.fileName || "replacement"));
  const mimeType = String(payload.mimeType || "");
  const match = dataUrl.match(/^data:([^;,]+);base64,([a-zA-Z0-9+/=]+)$/);
  if (!match || match[1] !== mimeType || !acceptedArtTypes[mimeType]) {
    sendJson(res, 400, { ok: false, error: "Use a PNG, SVG, JPG, or WEBP file." });
    return;
  }

  const originalExt = path.extname(fileName).toLowerCase();
  const expectedExt = acceptedArtTypes[mimeType];
  const ext = originalExt === ".jpeg" ? ".jpg" : originalExt;
  if (ext && ext !== expectedExt) {
    sendJson(res, 400, { ok: false, error: `Selected file does not match ${mimeType}.` });
    return;
  }

  const buffer = Buffer.from(match[2], "base64");
  if (buffer.length === 0 || buffer.length > 5 * 1024 * 1024) {
    sendJson(res, 400, { ok: false, error: "Replacement art must be under 5 MB." });
    return;
  }

  fs.mkdirSync(ART_CUSTOM_DIR, { recursive: true });
  const manifest = readArtManifest();
  const previousFile = manifest[asset.id]?.fileName;
  if (previousFile) {
    const previousPath = path.join(ART_CUSTOM_DIR, path.basename(previousFile));
    if (fs.existsSync(previousPath)) {
      try {
        fs.unlinkSync(previousPath);
      } catch (error) {
        // A stale file is harmless; keep saving the new active asset.
      }
    }
  }

  const savedFileName = `${asset.id}${expectedExt}`;
  fs.writeFileSync(path.join(ART_CUSTOM_DIR, savedFileName), buffer);
  manifest[asset.id] = {
    fileName: savedFileName,
    sourceName: fileName,
    mimeType,
    updatedAt: new Date().toISOString()
  };
  writeArtManifest(manifest);
  sendJson(res, 200, { ok: true, asset: publicArtAsset(asset, manifest) });
}

function serveArtFile(res, kind, fileName) {
  const safeName = path.basename(fileName || "");
  const dir = kind === "custom" ? ART_CUSTOM_DIR : ART_DEFAULT_DIR;
  const filePath = path.join(dir, safeName);
  if (!safeName || !filePath.startsWith(dir) || !fs.existsSync(filePath)) {
    sendJson(res, 404, { ok: false, error: "Art file not found" });
    return;
  }
  fs.readFile(filePath, (error, data) => {
    if (error) {
      sendJson(res, 500, { ok: false, error: "Could not read art file" });
      return;
    }
    res.writeHead(200, {
      "Content-Type": contentTypeForFile(filePath),
      "Content-Length": data.length,
      "Cache-Control": "no-cache"
    });
    res.end(data);
  });
}

async function sendGameFlow(res) {
  const flow = await loadGameFlowSource({ refresh: gameFlowStore.storageKind === "github" });
  sendJson(res, 200, {
    ok: true,
    flow,
    runtimeFlow: normalizeGameFlow(flow),
    storage: {
      kind: gameFlowStore.storageKind,
      durable: gameFlowStore.storageKind === "github" && Boolean(GAME_FLOW_GITHUB_TOKEN),
      error: gameFlowStore.error || "",
      repo: gameFlowStore.storageKind === "github" ? GAME_FLOW_GITHUB_REPO : "",
      branch: gameFlowStore.storageKind === "github" ? GAME_FLOW_GITHUB_BRANCH : "",
      path: gameFlowStore.storageKind === "github" ? GAME_FLOW_GITHUB_PATH : ""
    },
    availableActionTypes: availableFlowActionTypes,
    availableTransitions: availableFlowTransitions
  });
}

async function sendGameConstants(res) {
  const constants = await loadGameConstantsSource({ refresh: gameConstantsStore.storageKind === "github" });
  sendJson(res, 200, {
    ok: true,
    constants: normalizeGameConstants(constants),
    storage: {
      kind: gameConstantsStore.storageKind,
      durable: gameConstantsStore.storageKind === "github" && Boolean(GAME_FLOW_GITHUB_TOKEN),
      error: gameConstantsStore.error || "",
      repo: gameConstantsStore.storageKind === "github" ? GAME_FLOW_GITHUB_REPO : "",
      branch: gameConstantsStore.storageKind === "github" ? GAME_FLOW_GITHUB_BRANCH : "",
      path: gameConstantsStore.storageKind === "github" ? GAME_CONSTANTS_GITHUB_PATH : ""
    }
  });
}

async function sendStageLayouts(res) {
  const layouts = await loadStageLayoutsSource({ refresh: stageLayoutsStore.storageKind === "github" });
  sendJson(res, 200, {
    ok: true,
    layouts: normalizeStageLayouts(layouts),
    storage: {
      kind: stageLayoutsStore.storageKind,
      durable: stageLayoutsStore.storageKind === "github" && Boolean(GAME_FLOW_GITHUB_TOKEN),
      error: stageLayoutsStore.error || "",
      repo: stageLayoutsStore.storageKind === "github" ? GAME_FLOW_GITHUB_REPO : "",
      branch: stageLayoutsStore.storageKind === "github" ? GAME_FLOW_GITHUB_BRANCH : "",
      path: stageLayoutsStore.storageKind === "github" ? STAGE_LAYOUTS_GITHUB_PATH : ""
    }
  });
}

async function handleSaveGameFlow(req, res) {
  let payload;
  try {
    payload = await readJson(req, 128 * 1024);
  } catch (error) {
    sendJson(res, 400, { ok: false, error: "Invalid JSON payload" });
    return;
  }

  let flow;
  try {
    flow = await writeGameFlow(payload.flow || payload);
  } catch (error) {
    sendJson(res, 400, { ok: false, error: `Game flow could not be saved: ${error.message}` });
    return;
  }
  for (const room of rooms.values()) {
    clearActionTimer(room);
    room.actionIndex = 0;
    room.presentedAction = null;
    room.appliedActionEffectId = "";
    broadcastLobby(room);
  }
  sendJson(res, 200, {
    ok: true,
    flow,
    runtimeFlow: normalizeGameFlow(flow),
    storage: {
      kind: gameFlowStore.storageKind,
      durable: gameFlowStore.storageKind === "github" && Boolean(GAME_FLOW_GITHUB_TOKEN),
      error: gameFlowStore.error || ""
    }
  });
}

async function handleSaveGameConstants(req, res) {
  let payload;
  try {
    payload = await readJson(req, 32 * 1024);
  } catch (error) {
    sendJson(res, 400, { ok: false, error: "Invalid JSON payload" });
    return;
  }

  let constants;
  try {
    constants = await writeGameConstants(payload.constants || payload);
  } catch (error) {
    sendJson(res, 400, { ok: false, error: `Game constants could not be saved: ${error.message}` });
    return;
  }
  for (const room of rooms.values()) {
    broadcastLobby(room);
  }
  sendJson(res, 200, {
    ok: true,
    constants,
    storage: {
      kind: gameConstantsStore.storageKind,
      durable: gameConstantsStore.storageKind === "github" && Boolean(GAME_FLOW_GITHUB_TOKEN),
      error: gameConstantsStore.error || ""
    }
  });
}

async function handleSaveStageLayouts(req, res) {
  let payload;
  try {
    payload = await readJson(req, 128 * 1024);
  } catch (error) {
    sendJson(res, 400, { ok: false, error: "Invalid JSON payload" });
    return;
  }

  let layouts;
  try {
    layouts = await writeStageLayouts(payload.layouts || payload);
  } catch (error) {
    sendJson(res, 400, { ok: false, error: `Stage layouts could not be saved: ${error.message}` });
    return;
  }
  sendJson(res, 200, {
    ok: true,
    layouts,
    storage: {
      kind: stageLayoutsStore.storageKind,
      durable: stageLayoutsStore.storageKind === "github" && Boolean(GAME_FLOW_GITHUB_TOKEN),
      error: stageLayoutsStore.error || ""
    }
  });
}

function getRoom(stageCode) {
  if (!rooms.has(stageCode)) {
    rooms.set(stageCode, {
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
      actionIndex: 0,
      presentedAction: null,
      playersShown: true,
      revision: 0
    });
  }
  return rooms.get(stageCode);
}

function getExistingRoom(stageCode) {
  return rooms.get(stageCode) || null;
}

function makeAvatar(playerIndex) {
  const colors = gameConstants().playerColors;
  return {
    color: colors[playerIndex % colors.length],
    shape: avatarShapes[Math.floor(playerIndex / colors.length) % avatarShapes.length]
  };
}

function randomArrayItem(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function makeRandomAvatar(room, playerId) {
  const usedShapes = new Set();
  const usedColors = new Set();
  for (const player of room.players.values()) {
    if (player.id !== playerId && player.avatar?.shape) usedShapes.add(player.avatar.shape);
    if (player.id !== playerId && player.avatar?.color) usedColors.add(normalizeColor(player.avatar.color));
  }
  const availableShapes = avatarShapes.filter((shape) => !usedShapes.has(shape));
  const playerColors = gameConstants().playerColors;
  const availableColors = playerColors.filter((color) => !usedColors.has(color));
  const shape = randomArrayItem(availableShapes.length ? availableShapes : avatarShapes);
  const color = randomArrayItem(availableColors.length ? availableColors : playerColors);
  return { color, shape };
}

function normalizeAvatarShape(value) {
  const shape = String(value || "").trim().toLowerCase();
  return avatarShapes.includes(shape) ? shape : "";
}

function activePlayers(room) {
  return Array.from(room.players.values()).filter((player) => player.active);
}

function selectVip(room) {
  const previousVipPlayerId = room.vipPlayerId;
  const active = activePlayers(room);
  if (active.length === 0) {
    room.vipPlayerId = "";
    room.startToken = "";
    return;
  }
  if (!active.some((player) => player.id === room.vipPlayerId)) {
    room.vipPlayerId = active[0].id;
  }
  if (room.vipPlayerId !== previousVipPlayerId || !room.startToken) {
    room.startToken = randomToken();
  }
}

function publicPlayer(player, room) {
  return {
    id: player.id,
    name: player.name,
    avatar: player.avatar,
    active: player.active,
    joinedAt: player.joinedAt,
    isVip: player.id === room.vipPlayerId
  };
}

function lobbyPayload(room) {
  selectVip(room);
  const currentAction = room.phase !== "lobby" && room.phase !== "starting" ? currentRoomAction(room) : null;
  applyRoomActionEffects(room, currentAction);
  return {
    type: "lobby",
    stageCode: room.stageCode,
    revision: room.revision,
    phase: room.phase,
    countdownStartedAt: room.countdownStartedAt,
    countdownEndsAt: room.countdownEndsAt,
    action: currentAction,
    serverNow: Date.now(),
    vipPlayerId: room.vipPlayerId,
    startToken: room.startToken,
    playersShown: room.playersShown !== false,
    players: activePlayers(room).map((player) => publicPlayer(player, room))
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
  room.appliedActionEffectId = "";
  room.playersShown = true;
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
  room.phase = phase;
  room.countdownStartedAt = 0;
  room.countdownEndsAt = 0;
  room.actionIndex = 0;
  room.presentedAction = null;
  room.appliedActionEffectId = "";
  room.playersShown = true;
  broadcastLobby(room);
}

function enterStartingPhase(room) {
  const now = Date.now();
  clearCountdownTimer(room);
  room.phase = "starting";
  room.countdownStartedAt = now;
  room.countdownEndsAt = now + START_COUNTDOWN_MS;
  room.countdownTimerId = setTimeout(() => {
    enterGamePhase(room, countdownTargetState());
  }, START_COUNTDOWN_MS + START_GO_HOLD_MS);
  broadcastLobby(room);
}

function removeStageClient(stageCode, client) {
  const room = getExistingRoom(stageCode);
  if (!room) return;
  room.stageClients.delete(client);
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

  if (room.phase === "intro" && room.presentedAction?.type === "present") {
    room.presentedAction = null;
    broadcastLobby(room);
    sendJson(res, 200, { ok: true, lobby: lobbyPayload(room) });
    return;
  }

  const currentAction = room.phase === "intro" ? currentRoomAction(room) : null;
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
  if (currentAction?.type === "transition" || currentAction?.type === "displayText" || currentAction?.type === "present" || currentAction?.type === "setPlayersShown") {
    completeCurrentAction(room, payload.actionId, payload.source || "callback");
  }
  sendJson(res, 200, { ok: true, lobby: lobbyPayload(room) });
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

function serveIndex(res) {
  fs.readFile(INDEX_FILE, (error, data) => {
    if (error) {
      sendJson(res, 500, { ok: false, error: "Could not read index.html" });
      return;
    }
    const html = String(data).replaceAll("__APP_VERSION__", APP_VERSION);
    res.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Length": Buffer.byteLength(html)
    });
    res.end(html);
  });
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
  console.log(`Flip 7 Party server running at http://localhost:${PORT}`);
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
