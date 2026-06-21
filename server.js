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
const availableFlowTransitions = [
  { id: "horizontalWipe", name: "Horizontal Wipe" }
];
const availableFlowActionTypes = [
  { id: "presentText", name: "Present Text", category: "input" },
  { id: "multipleChoiceInput", name: "Multiple Choice Input", category: "input" },
  { id: "triviaInput", name: "Trivia Input", category: "input" },
  { id: "textSubmissionInput", name: "Text Submission Input", category: "input" },
  { id: "doNothing", name: "Do Nothing", category: "standard" },
  { id: "playAudio", name: "Play Audio", category: "standard" },
  { id: "getRandomMultipleChoiceContent", name: "Get Random Multiple Choice Content", category: "standard" },
  { id: "prepareVotingCards", name: "Prepare Voting Cards", category: "standard" },
  { id: "setVotingCardsShown", name: "Set Voting Cards Shown", category: "standard" },
  { id: "voteOnAnswersInput", name: "Vote On Answers Input", category: "input" },
  { id: "revealVotingResults", name: "Reveal Voting Results", category: "standard" },
  { id: "displayText", name: "Display Text", category: "standard" },
  { id: "setPlayersShown", name: "Set Players Shown", category: "standard" },
  { id: "setPlayerAnswersShown", name: "Set Player Answers Shown", category: "standard" },
  { id: "revealPlayerAnswerCorrectness", name: "Reveal Player Answer Correctness", category: "standard" },
  { id: "showPoints", name: "Show Points", category: "standard" },
  { id: "givePendingPoints", name: "Give Pending Points", category: "standard" },
  { id: "setTimerShown", name: "Set Timer Shown", category: "standard" },
  { id: "startCraftingTimer", name: "Start Crafting Timer", category: "standard" },
  { id: "decision", name: "Decision", category: "standard" },
  { id: "transition", name: "Do Transition", category: "standard" },
  { id: "transitionState", name: "Transition To State", category: "standard" }
];

const multipleChoicePrompts = [
  {
    id: "four-letter-word",
    prompt: "Which of these is a 4-letter word?",
    options: ["Hi", "Cat", "Fish", "House"],
    correctAnswerIndex: 3
  },
  {
    id: "animal-that-flies",
    prompt: "Which of these animals can fly?",
    options: ["Dog", "Penguin", "Falcon", "Horse"],
    correctAnswerIndex: 3
  },
  {
    id: "planet-red",
    prompt: "Which planet is known as the Red Planet?",
    options: ["Venus", "Mars", "Jupiter", "Neptune"],
    correctAnswerIndex: 2
  },
  {
    id: "water-freezes",
    prompt: "At what temperature does water freeze in Celsius?",
    options: ["0", "10", "50", "100"],
    correctAnswerIndex: 1
  },
  {
    id: "largest-ocean",
    prompt: "Which ocean is the largest?",
    options: ["Atlantic", "Pacific", "Indian", "Arctic"],
    correctAnswerIndex: 2
  },
  {
    id: "primary-color",
    prompt: "Which of these is a primary color?",
    options: ["Green", "Purple", "Red", "Orange"],
    correctAnswerIndex: 3
  },
  {
    id: "weekday-after-monday",
    prompt: "Which day comes after Monday?",
    options: ["Sunday", "Tuesday", "Friday", "Saturday"],
    correctAnswerIndex: 2
  },
  {
    id: "shape-three-sides",
    prompt: "Which shape has three sides?",
    options: ["Square", "Circle", "Triangle", "Hexagon"],
    correctAnswerIndex: 3
  },
  {
    id: "five-plus-two",
    prompt: "What is 5 + 2?",
    options: ["6", "7", "8", "9"],
    correctAnswerIndex: 2
  },
  {
    id: "instrument-keys",
    prompt: "Which instrument usually has keys?",
    options: ["Drum", "Piano", "Trumpet", "Violin"],
    correctAnswerIndex: 2
  },
  {
    id: "opposite-hot",
    prompt: "Which word is the opposite of hot?",
    options: ["Warm", "Cold", "Bright", "Fast"],
    correctAnswerIndex: 2
  }
].map((item) => ({
  ...item,
  correctAnswerIndex: Math.max(0, Math.floor(Number(item.correctAnswerIndex || 1)) - 1)
}));
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
  playerColors: defaultPlayerColors,
  craftingTimerDuration: 30,
  startGameCountdownDuration: 1,
  gameTitle: "Party Game Template",
  numberOfRounds: 3,
  randomChanceTest: 0.5,
  overrideFirstGameOfSession: false
};
const defaultStageLayouts = {
  canvas: { width: 1920, height: 1080 },
  global: {
    id: "global",
    name: "Global Layout",
    elements: [
      { id: "stageCodeBadge", name: "Small Room Code Widget", selector: "#stageCodeBadge", x: 108, y: 70, width: 170, height: 82, scale: 1 },
      { id: "presentClickWidget", name: "Cursor Widget", selector: "#presentClickWidget", x: 1780, y: 930, width: 90, height: 90, scale: 1 },
      { id: "playerLobby", name: "Player Avatars", selector: "#playerLobby", x: 960, y: 935, width: 1320, height: 150, scale: 1 }
    ]
  },
  states: [
    {
      id: "lobby",
      name: "Lobby",
      hiddenGlobals: ["stagecodebadge"],
      elements: [
        { id: "startPopup", name: "Countdown Popup", selector: "#startPopup", x: 960, y: 130, width: 700, height: 130, scale: 1 },
        { id: "stageTitle", name: "Header", selector: ".stage-title", x: 960, y: 190, width: 1080, height: 150, scale: 1 },
        { id: "stageCodePanel", name: "Stage Code Panel", selector: ".stage-code-panel", x: 960, y: 390, width: 560, height: 190, scale: 1 },
        { id: "waitingStatus", name: "Waiting Status", selector: "#waitingStatus", x: 960, y: 575, width: 700, height: 82, scale: 1 },
        { id: "joinPrompt", name: "Join Prompt", selector: "#joinPrompt", x: 960, y: 650, width: 740, height: 76, scale: 1 }
      ]
    },
    {
      id: "intro",
      name: "Game Intro",
      elements: [
        { id: "stageIntroTitle", name: "Intro Header", selector: "#stageIntroTitle", x: 960, y: 235, width: 1060, height: 130, scale: 1 },
        { id: "stagePresentationText", name: "Presentation Text", selector: "#stagePresentationText", kind: "text", x: 960, y: 460, width: 980, height: 240, scale: 1 },
        { id: "stagePromptText", name: "Prompt Text", selector: "#stagePromptText", kind: "text", x: 960, y: 760, width: 860, height: 120, scale: 1 }
      ]
    }
  ]
};
const defaultControllerLayouts = {
  canvas: { width: 390, height: 844 },
  global: {
    id: "global",
    name: "Global Layout",
    elements: [
      { id: "controllerPlayerBanner", name: "Player Banner", selector: "#controllerPlayerBanner", x: 195, y: 58, width: 338, height: 78, scale: 1 }
    ]
  },
  states: [
    {
      id: "join",
      name: "Join Controller",
      hiddenGlobals: ["controllerplayerbanner"],
      elements: [
        { id: "joinTitle", name: "Join Title", selector: "#joinTitle", kind: "text", x: 195, y: 112, width: 330, height: 86, scale: 1, defaultText: "Join Lobby", fontSize: 54, autoFitText: true, fontColor: "#17131f" },
        { id: "stageCodeField", name: "Stage Code Field", selector: "#stageCodeField", x: 195, y: 255, width: 320, height: 96, scale: 1 },
        { id: "playerNameField", name: "Player Name Field", selector: "#playerNameField", x: 195, y: 375, width: 320, height: 96, scale: 1 },
        { id: "joinButton", name: "Join Button", selector: "#joinButton", x: 195, y: 505, width: 260, height: 78, scale: 1 }
      ]
    },
    {
      id: "lobby",
      name: "Lobby Controller",
      hiddenGlobals: ["controllerplayerbanner"],
      elements: [
        { id: "controllerAvatar", name: "Player Avatar", selector: "#controllerAvatar", x: 195, y: 150, width: 104, height: 104, scale: 1 },
        { id: "controllerPlayerName", name: "Player Name", selector: "#controllerPlayerName", kind: "text", x: 195, y: 290, width: 330, height: 80, scale: 1, defaultText: "Player", fontSize: 66, autoFitText: true, fontColor: "#17131f" },
        { id: "controllerMeta", name: "Controller Status", selector: "#controllerMeta", kind: "text", x: 195, y: 382, width: 330, height: 48, scale: 1, defaultText: "Waiting in lobby", fontSize: 28, autoFitText: true, fontColor: "#6b5a80" },
        { id: "startGameButton", name: "Start Game Button", selector: "#startGameButton", x: 195, y: 508, width: 260, height: 78, scale: 1 }
      ]
    },
    {
      id: "intro",
      name: "Game Intro Controller",
      elements: [
        { id: "controllerIntroMessage", name: "Intro Message", selector: "#controllerIntroMessage", kind: "text", x: 195, y: 250, width: 330, height: 120, scale: 1, defaultText: "Welcome to the Game", fontSize: 44, autoFitText: true, fontColor: "#17131f" },
        { id: "introPresentButton", name: "Present Button", selector: "#introPresentButton", x: 195, y: 450, width: 300, height: 78, scale: 1 }
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
  const flow = await loadGameFlowSource({ refresh: gameFlowStore.storageKind === "github" });
  const normalized = syncStageLayoutsWithFlow(layouts, flow);
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
  backupControllerLayoutsSource();
  if (controllerLayoutsStore.storageKind === "github") {
    if (!GAME_FLOW_GITHUB_TOKEN) {
      throw new Error("GAME_FLOW_GITHUB_TOKEN is not configured. Refusing to save to ephemeral local storage.");
    }
    const saved = await writeGithubJsonSource(normalized, controllerLayoutsStore.remoteSha, CONTROLLER_LAYOUTS_GITHUB_PATH, "Save controller layouts");
    controllerLayoutsStore.source = normalizeControllerLayouts(saved.data);
    controllerLayoutsStore.remoteSha = saved.sha || "";
    controllerLayoutsStore.loadedAt = Date.now();
    controllerLayoutsStore.error = "";
    mirrorControllerLayoutsSource(controllerLayoutsStore.source);
    return readControllerLayoutsSource();
  }
  writeLocalControllerLayoutsSource(normalized);
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

function backupControllerLayoutsSource() {
  if (!fs.existsSync(CONTROLLER_LAYOUTS_FILE)) return;
  fs.mkdirSync(CONTROLLER_LAYOUTS_BACKUP_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  fs.copyFileSync(CONTROLLER_LAYOUTS_FILE, path.join(CONTROLLER_LAYOUTS_BACKUP_DIR, `controller-layouts-${stamp}.json`));
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

function writeLocalControllerLayoutsSource(layouts) {
  fs.writeFileSync(CONTROLLER_LAYOUTS_FILE, `${JSON.stringify(layouts, null, 2)}\n`);
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

function mirrorControllerLayoutsSource(layouts) {
  try {
    writeLocalControllerLayoutsSource(layouts);
  } catch (error) {
    // Durable storage is authoritative; local mirrors are best-effort.
  }
}

function githubFlowHeaders() {
  return {
    "Accept": "application/vnd.github+json",
    "Authorization": `Bearer ${GAME_FLOW_GITHUB_TOKEN}`,
    "User-Agent": "party-game-template",
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

function compareDecisionValues(leftValue, rightValue, valueType, operator) {
  let left = leftValue;
  let right = rightValue;
  if (valueType === "int") {
    left = Math.floor(Number(leftValue) || 0);
    right = Math.floor(Number(rightValue) || 0);
  } else if (valueType === "float") {
    left = Number(leftValue) || 0;
    right = Number(rightValue) || 0;
  } else if (valueType === "bool") {
    left = leftValue === true || String(leftValue).toLowerCase() === "true";
    right = rightValue === true || String(rightValue).toLowerCase() === "true";
  } else {
    left = String(leftValue || "");
    right = String(rightValue || "");
  }
  if (operator === "<") return left < right;
  if (operator === "<=") return left <= right;
  if (operator === "!=") return left !== right;
  if (operator === ">=") return left >= right;
  if (operator === ">") return left > right;
  return left === right;
}

function propertyPathValue(root, pathParts) {
  let value = root;
  for (const part of pathParts) {
    if (value == null) return undefined;
    const key = String(part || "");
    const lowerKey = key.toLowerCase();
    if (lowerKey === "count" || lowerKey === "length") {
      if (Array.isArray(value) || typeof value === "string") {
        value = value.length;
        continue;
      }
      if (value instanceof Map || value instanceof Set) {
        value = value.size;
        continue;
      }
    }
    if (Object.prototype.hasOwnProperty.call(Object(value), key)) {
      value = value[key];
      continue;
    }
    const matchingKey = Object.keys(Object(value)).find((item) => item.toLowerCase() === lowerKey);
    value = matchingKey ? value[matchingKey] : undefined;
  }
  return value;
}

function lookupDecisionRootValue(lookup, key) {
  if (Object.prototype.hasOwnProperty.call(lookup, key)) return lookup[key];
  const matchingKey = Object.keys(lookup).find((item) => item.toLowerCase() === String(key || "").toLowerCase());
  return matchingKey ? lookup[matchingKey] : undefined;
}

function decisionVariableValue(room, variable) {
  const key = String(variable || "activePlayerCount").trim();
  const constants = gameConstants();
  const active = activePlayers(room);
  const activeSessionKey = active.map((player) => player.id).sort().join("|");
  if (activeSessionKey !== room.playerSessionKey) {
    room.numSequentialGames = 0;
  }
  const lookup = {
    activePlayerCount: active.length,
    currentRound: room.currentRound || 1,
    numSequentialGames: room.numSequentialGames || 0,
    isFirstGameOfSession: constants.overrideFirstGameOfSession === true || Number(room.numSequentialGames || 0) === 0,
    gameTitle: constants.gameTitle,
    numberOfRounds: constants.numberOfRounds,
    randomChanceTest: constants.randomChanceTest,
    craftingTimerDuration: constants.craftingTimerDuration,
    startGameCountdownDuration: constants.startGameCountdownDuration,
    pointsForCorrectAnswer: constants.pointsForCorrectAnswer,
    overrideFirstGameOfSession: constants.overrideFirstGameOfSession,
    players: active,
    playerColors: constants.playerColors,
    choiceInputAnswers: room.choiceInputAnswers,
    textInputAnswers: room.textInputAnswers,
    displayedPlayerAnswers: room.displayedPlayerAnswers,
    playerAnswerRecords: room.playerAnswerRecords,
    playerAnswerGroups: room.playerAnswerGroups,
    flowVariables: room.flowVariables
  };
  const pathParts = key.split(".").filter(Boolean);
  const first = pathParts.shift();
  if (!first) return 0;
  if (first.toLowerCase() === "constants") return propertyPathValue(constants, pathParts);
  const lookupValue = lookupDecisionRootValue(lookup, first);
  if (lookupValue !== undefined) {
    return pathParts.length ? propertyPathValue(lookupValue, pathParts) : lookupValue;
  }
  const constantValue = lookupDecisionRootValue(constants, first);
  if (constantValue !== undefined) {
    return pathParts.length ? propertyPathValue(constantValue, pathParts) : constantValue;
  }
  return propertyPathValue({ ...lookup, constants }, [first, ...pathParts]) ?? 0;
}

function evaluateDecisionCode(code, x) {
  const expression = String(code || "").trim();
  if (!expression) return false;
  const match = expression.match(/^x\s*(===|==|!==|!=|<=|>=|<|>)\s*(.+)$/i);
  if (!match) return false;
  const [, operator, rawRight] = match;
  let valueType = "float";
  let right = rawRight.trim();
  if (/^true$/i.test(right) || /^false$/i.test(right)) {
    valueType = "bool";
    right = /^true$/i.test(right);
  } else if ((right.startsWith('"') && right.endsWith('"')) || (right.startsWith("'") && right.endsWith("'"))) {
    valueType = "string";
    right = right.slice(1, -1);
  } else if (!Number.isFinite(Number(right))) {
    valueType = "string";
  }
  const normalizedOperator = operator === "===" ? "==" : operator === "!==" ? "!=" : operator;
  return compareDecisionValues(x, right, valueType, normalizedOperator);
}

function evaluateDecisionBranch(branch, leftValue, valueType) {
  if (branch.type === "noMatch") return false;
  if (branch.type === "code") return evaluateDecisionCode(branch.code, leftValue);
  return compareDecisionValues(leftValue, branch.value, valueType, "==");
}

function evaluateDecisionAction(room, action) {
  const variable = action.variable || "activePlayerCount";
  const valueType = normalizeDecisionValueType(action.valueType);
  const leftValue = decisionVariableValue(room, variable);
  const branches = normalizeDecisionBranches(action);
  const regularBranchResults = branches.filter((branch) => branch.type !== "noMatch").map((branch) => ({
    id: branch.id,
    type: branch.type,
    value: branch.value || "",
    code: branch.code || "",
    targetActionId: branch.targetActionId || "",
    passed: evaluateDecisionBranch(branch, leftValue, valueType)
  }));
  const firstPassingRegular = regularBranchResults.find((branch) => branch.passed);
  const noMatchBranch = branches.find((branch) => branch.type === "noMatch") || null;
  const noMatchResult = noMatchBranch ? {
    id: noMatchBranch.id,
    type: noMatchBranch.type,
    value: noMatchBranch.value || "",
    code: noMatchBranch.code || "",
    targetActionId: noMatchBranch.targetActionId || "",
    passed: !firstPassingRegular
  } : null;
  const branchResults = noMatchResult ? [...regularBranchResults, noMatchResult] : regularBranchResults;
  const selectedBranchResult = firstPassingRegular || noMatchResult;
  const selectedBranch = branches.find((branch) => branch.id === selectedBranchResult?.id) || null;
  const target = selectedBranch?.targetActionId || "";
  const selectedTarget = target && !isNoActionTarget(target) ? String(target) : "none";
  const targetIndex = selectedTarget === "none" ? null : flowActionIndexById(room, selectedTarget);
  return {
    actionId: action.id,
    actionName: action.name,
    variable,
    valueType,
    leftValue,
    selectedBranch: selectedBranch?.id || "",
    selectedBranchType: selectedBranch?.type || "",
    branchResults,
    selectedTarget,
    haltReason: selectedTarget === "none" ? "No Matching Branch" : "",
    targetIndex
  };
}

function resolveDecisionActionIndex(room, action) {
  const decision = evaluateDecisionAction(room, action);
  room.lastDecisionTrace = {
    ...decision,
    activePlayerCount: activePlayers(room).length,
    evaluatedAt: Date.now()
  };
  const target = decision.selectedTarget;
  if (isNoActionTarget(target)) return null;
  if (decision.targetIndex >= 0) return decision.targetIndex;
  return null;
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
    const prompt = randomArrayItem(multipleChoicePrompts) || multipleChoicePrompts[0];
    room.flowVariables = room.flowVariables && typeof room.flowVariables === "object" ? room.flowVariables : {};
    room.flowVariables[normalizeFlowVariableName(action.variableName)] = clonePrompt(prompt);
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
  const responseFlow = localDraftStore.flow || flow;
  sendJson(res, 200, {
    ok: true,
    flow: responseFlow,
    savedFlow: flow,
    runtimeFlow: normalizeGameFlow(responseFlow),
    hasLocalDraft: Boolean(localDraftStore.flow),
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
  const responseConstants = localDraftStore.constants || constants;
  sendJson(res, 200, {
    ok: true,
    constants: normalizeGameConstants(responseConstants),
    savedConstants: normalizeGameConstants(constants),
    hasLocalDraft: Boolean(localDraftStore.constants),
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
  const flow = await loadGameFlowSource({ refresh: gameFlowStore.storageKind === "github" });
  const activeFlow = localDraftStore.flow || flow;
  const syncedLayouts = syncStageLayoutsWithFlow(layouts, activeFlow);
  const responseLayouts = localDraftStore.layouts ? syncStageLayoutsWithFlow(localDraftStore.layouts, activeFlow) : syncedLayouts;
  sendJson(res, 200, {
    ok: true,
    layouts: responseLayouts,
    savedLayouts: syncedLayouts,
    hasLocalDraft: Boolean(localDraftStore.layouts),
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

async function sendControllerLayouts(res) {
  const layouts = await loadControllerLayoutsSource({ refresh: controllerLayoutsStore.storageKind === "github" });
  const flow = await loadGameFlowSource({ refresh: gameFlowStore.storageKind === "github" });
  const activeFlow = localDraftStore.flow || flow;
  const syncedLayouts = syncControllerLayoutsWithFlow(layouts, activeFlow);
  const responseLayouts = localDraftStore.controllerLayouts ? syncControllerLayoutsWithFlow(localDraftStore.controllerLayouts, activeFlow) : syncedLayouts;
  sendJson(res, 200, {
    ok: true,
    layouts: responseLayouts,
    savedLayouts: syncedLayouts,
    hasLocalDraft: Boolean(localDraftStore.controllerLayouts),
    storage: {
      kind: controllerLayoutsStore.storageKind,
      durable: controllerLayoutsStore.storageKind === "github" && Boolean(GAME_FLOW_GITHUB_TOKEN),
      error: controllerLayoutsStore.error || "",
      repo: controllerLayoutsStore.storageKind === "github" ? GAME_FLOW_GITHUB_REPO : "",
      branch: controllerLayoutsStore.storageKind === "github" ? GAME_FLOW_GITHUB_BRANCH : "",
      path: controllerLayoutsStore.storageKind === "github" ? CONTROLLER_LAYOUTS_GITHUB_PATH : ""
    }
  });
}

function sendLocalDraft(res) {
  sendJson(res, 200, {
    ok: true,
    flow: localDraftStore.flow,
    constants: localDraftStore.constants,
    layouts: localDraftStore.layouts,
    controllerLayouts: localDraftStore.controllerLayouts,
    hasFlowDraft: Boolean(localDraftStore.flow),
    hasConstantsDraft: Boolean(localDraftStore.constants),
    hasLayoutDraft: Boolean(localDraftStore.layouts),
    hasControllerLayoutDraft: Boolean(localDraftStore.controllerLayouts)
  });
}

async function handleLocalDraft(req, res) {
  let payload;
  try {
    payload = await readJson(req, 256 * 1024);
  } catch (error) {
    sendJson(res, 400, { ok: false, error: "Invalid JSON payload" });
    return;
  }

  if (payload.clearFlow) localDraftStore.flow = null;
  if (payload.clearConstants) localDraftStore.constants = null;
  if (payload.clearLayouts) localDraftStore.layouts = null;
  if (payload.clearControllerLayouts) localDraftStore.controllerLayouts = null;

  if (payload.flow) {
    try {
      localDraftStore.flow = normalizeGameFlow(payload.flow);
    } catch (error) {
      sendJson(res, 400, { ok: false, error: `Local flow draft is invalid: ${error.message}` });
      return;
    }
  }

  if (payload.constants) {
    try {
      localDraftStore.constants = normalizeGameConstants(payload.constants);
    } catch (error) {
      sendJson(res, 400, { ok: false, error: `Local constants draft is invalid: ${error.message}` });
      return;
    }
  }

  if (payload.layouts) {
    try {
      localDraftStore.layouts = normalizeStageLayouts(payload.layouts);
    } catch (error) {
      sendJson(res, 400, { ok: false, error: `Local layout draft is invalid: ${error.message}` });
      return;
    }
  }

  if (payload.controllerLayouts) {
    try {
      localDraftStore.controllerLayouts = normalizeControllerLayouts(payload.controllerLayouts);
    } catch (error) {
      sendJson(res, 400, { ok: false, error: `Local controller layout draft is invalid: ${error.message}` });
      return;
    }
  }

  if (localDraftStore.layouts) {
    localDraftStore.layouts = syncStageLayoutsWithFlow(localDraftStore.layouts, localDraftStore.flow || readGameFlow());
  }
  if (localDraftStore.controllerLayouts) {
    localDraftStore.controllerLayouts = syncControllerLayoutsWithFlow(localDraftStore.controllerLayouts, localDraftStore.flow || readGameFlow());
  }

  for (const room of rooms.values()) {
    if (payload.flow || payload.clearFlow) {
      clearActionTimer(room);
      resetCraftingTimer(room);
      room.actionIndex = 0;
      room.presentedAction = null;
      room.lastDecisionTrace = null;
      clearAppliedActionEffects(room);
    }
    broadcastLobby(room);
  }

  sendLocalDraft(res);
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
    localDraftStore.flow = null;
  } catch (error) {
    sendJson(res, 400, { ok: false, error: `Game flow could not be saved: ${error.message}` });
    return;
  }
  for (const room of rooms.values()) {
    clearActionTimer(room);
    resetCraftingTimer(room);
    room.actionIndex = 0;
    room.presentedAction = null;
    room.lastDecisionTrace = null;
    clearAppliedActionEffects(room);
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
    localDraftStore.constants = null;
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
    localDraftStore.layouts = null;
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

async function handleSaveControllerLayouts(req, res) {
  let payload;
  try {
    payload = await readJson(req, 128 * 1024);
  } catch (error) {
    sendJson(res, 400, { ok: false, error: "Invalid JSON payload" });
    return;
  }

  let layouts;
  try {
    layouts = await writeControllerLayouts(payload.layouts || payload);
    localDraftStore.controllerLayouts = null;
  } catch (error) {
    sendJson(res, 400, { ok: false, error: `Controller layouts could not be saved: ${error.message}` });
    return;
  }
  sendJson(res, 200, {
    ok: true,
    layouts,
    storage: {
      kind: controllerLayoutsStore.storageKind,
      durable: controllerLayoutsStore.storageKind === "github" && Boolean(GAME_FLOW_GITHUB_TOKEN),
      error: controllerLayoutsStore.error || ""
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
      pendingPointPopups: [],
      pendingPointPopupNonce: 0,
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
      votingInputActionId: "",
      votingInputPrompt: "",
      votingAnswers: new Map(),
      votingWinners: [],
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

function clearAnswersSubmittedAdvanceTimer(room) {
  if (!room.answersSubmittedAdvanceTimerId) return;
  clearTimeout(room.answersSubmittedAdvanceTimerId);
  room.answersSubmittedAdvanceTimerId = null;
}

function displayedPlayerAnswers(room) {
  if (!room.displayedPlayerAnswers || typeof room.displayedPlayerAnswers.get !== "function") {
    room.displayedPlayerAnswers = new Map();
  }
  return room.displayedPlayerAnswers;
}

function displayedAnswerCorrectness(room) {
  if (!room.displayedAnswerCorrectness || typeof room.displayedAnswerCorrectness.get !== "function") {
    room.displayedAnswerCorrectness = new Map();
  }
  return room.displayedAnswerCorrectness;
}

function rememberDisplayedPlayerAnswer(room, playerId, answer) {
  if (!playerId || !answer || !answer.text) return;
  const correctness = displayedAnswerCorrectness(room).get(playerId);
  displayedPlayerAnswers(room).set(playerId, {
    optionIndex: answer.optionIndex,
    originalOptionIndex: answer.originalOptionIndex,
    text: answer.text,
    done: answer.done === true,
    invalid: answer.invalid === true,
    correct: correctness === true ? true : correctness === false ? false : null,
    nonce: answer.nonce || Date.now()
  });
  if (correctness === true || correctness === false) displayedAnswerCorrectness(room).set(playerId, correctness);
}

function storedPlayerAnswer(room, playerId) {
  const liveAnswer = room.choiceInputAnswers?.get(playerId) || room.textInputAnswers?.get(playerId) || null;
  if (liveAnswer) return liveAnswer;
  const record = room.playerAnswerRecords?.[playerId] || null;
  return record?.text ? {
    optionIndex: record.optionIndex,
    originalOptionIndex: record.originalOptionIndex,
    text: record.text,
    done: true,
    correct: record.correct === true ? true : record.correct === false ? false : null,
    nonce: record.answeredAt || Date.now()
  } : null;
}

function seedDisplayedPlayerAnswers(room, playerIds = []) {
  const ids = Array.isArray(playerIds) && playerIds.length ? playerIds : activePlayers(room).map((player) => player.id);
  for (const playerId of ids) {
    const answer = storedPlayerAnswer(room, playerId);
    if (answer?.text) rememberDisplayedPlayerAnswer(room, playerId, answer);
  }
  updatePlayerAnswerGroups(room);
}

function forgetDisplayedPlayerAnswer(room, playerId) {
  if (!playerId) return;
  displayedPlayerAnswers(room).delete(playerId);
  displayedAnswerCorrectness(room).delete(playerId);
}

function clearDisplayedPlayerAnswers(room) {
  displayedPlayerAnswers(room).clear();
  displayedAnswerCorrectness(room).clear();
  if (room.hiddenPlayerAnswerIds?.clear) room.hiddenPlayerAnswerIds.clear();
  else room.hiddenPlayerAnswerIds = new Set();
  room.playerAnswerGroups = { correct: [], wrong: [], all: [] };
}

function triviaPromptById(id) {
  return multipleChoicePrompts.find((prompt) => prompt.id === id) || null;
}

function clonePrompt(prompt) {
  return {
    id: prompt.id,
    prompt: prompt.prompt,
    options: [...prompt.options],
    correctAnswerIndex: prompt.correctAnswerIndex
  };
}

function shuffledTriviaPrompt(prompt) {
  const pairs = prompt.options.map((text, originalIndex) => ({ text, originalIndex }));
  for (let i = pairs.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [pairs[i], pairs[j]] = [pairs[j], pairs[i]];
  }
  return {
    id: prompt.id,
    prompt: prompt.prompt,
    options: pairs.map((item) => item.text),
    optionOriginalIndexes: pairs.map((item) => item.originalIndex),
    correctAnswerIndex: prompt.correctAnswerIndex
  };
}

function clearPlayerAnswerData(room) {
  room.playerAnswerRecords = {};
  room.playerAnswerGroups = { correct: [], wrong: [], all: [] };
  displayedAnswerCorrectness(room).clear();
}

function clearDisplayedCorrectnessForPlayers(room, playerIds) {
  const correctness = displayedAnswerCorrectness(room);
  const displayedAnswers = displayedPlayerAnswers(room);
  for (const playerId of playerIds || []) {
    correctness.delete(playerId);
    const displayed = displayedAnswers.get(playerId);
    if (displayed) {
      displayed.correct = null;
      displayed.nonce = Date.now();
    }
  }
}

function updatePlayerAnswerGroups(room) {
  const records = room.playerAnswerRecords || {};
  const all = [...new Set([...Object.keys(records), ...displayedPlayerAnswers(room).keys()])];
  room.playerAnswerGroups = {
    all,
    correct: all.filter((playerId) => records[playerId]?.correct === true),
    wrong: all.filter((playerId) => records[playerId]?.correct === false)
  };
}

function filteredPlayerIds(room, filter = "all") {
  updatePlayerAnswerGroups(room);
  const normalized = normalizePlayerFilter(filter);
  if (normalized === "votingWinner") return [...(room.votingWinners || [])];
  if (normalized === "votingLosers") {
    const winners = new Set(room.votingWinners || []);
    return activePlayers(room).map((player) => player.id).filter((playerId) => !winners.has(playerId));
  }
  return [...(room.playerAnswerGroups?.[normalized] || room.playerAnswerGroups?.all || [])];
}

function markDisplayedAnswersCorrectness(room) {
  const records = room.playerAnswerRecords || {};
  for (const [playerId, record] of Object.entries(records)) {
    if (record.correct === true || record.correct === false) {
      displayedAnswerCorrectness(room).set(playerId, record.correct);
      const displayed = displayedPlayerAnswers(room).get(playerId);
      if (displayed) {
        displayed.correct = record.correct;
        displayed.nonce = Date.now();
      }
    }
  }
}

function clearChoiceInput(room) {
  clearAnswersSubmittedAdvanceTimer(room);
  room.choiceInputActionId = "";
  room.choiceInputPrompt = "";
  room.choiceInputOptions = [];
  room.choiceInputOriginalIndexes = [];
  room.choiceInputCorrectAnswerIndex = null;
  room.choiceInputKind = "multipleChoice";
  room.choiceInputContentId = "";
  room.choiceInputMode = "singleSelect";
  room.choiceInputLocked = false;
  if (room.choiceInputAnswers?.clear) {
    room.choiceInputAnswers.clear();
  } else {
    room.choiceInputAnswers = new Map();
  }
}

function clearTextInput(room) {
  clearAnswersSubmittedAdvanceTimer(room);
  room.textInputActionId = "";
  room.textInputPrompt = "";
  room.textInputPlaceholder = "";
  room.textInputCharacterLimit = 0;
  if (room.textInputAnswers?.clear) {
    room.textInputAnswers.clear();
  } else {
    room.textInputAnswers = new Map();
  }
}

function clearVotingInput(room) {
  clearAnswersSubmittedAdvanceTimer(room);
  room.votingInputActionId = "";
  room.votingInputPrompt = "";
  if (room.votingAnswers?.clear) {
    room.votingAnswers.clear();
  } else {
    room.votingAnswers = new Map();
  }
}

function clearVotingData(room) {
  clearVotingInput(room);
  room.votingCards = [];
  room.votingCardsShown = false;
  room.votingResultsShown = false;
  room.votingWinners = [];
}

function prepareVotingCards(room) {
  const records = room.playerAnswerRecords || {};
  const cards = activePlayers(room)
    .map((player) => {
      const answer = records[player.id];
      const text = String(answer?.text || "").trim();
      if (!text) return null;
      return {
        id: `vote-card-${player.id}`,
        authorPlayerId: player.id,
        text,
        voterIds: [],
        voteCount: 0,
        isWinner: false,
        hidden: false
      };
    })
    .filter(Boolean);
  for (let i = cards.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  room.votingCards = cards;
  room.votingCardsShown = false;
  room.votingResultsShown = false;
  room.votingWinners = [];
  room.lastVotingPrepare = {
    activePlayerCount: activePlayers(room).length,
    answerRecordCount: Object.keys(records).length,
    cardCount: cards.length,
    preparedAt: Date.now()
  };
  clearVotingInput(room);
}

function votingCardByOptionIndex(room, optionIndex) {
  const cards = Array.isArray(room.votingCards) ? room.votingCards : [];
  return cards.filter((card) => card && card.hidden !== true)[optionIndex] || null;
}

function revealVotingResults(room) {
  const cards = Array.isArray(room.votingCards) ? room.votingCards : [];
  let highestVotes = -1;
  for (const card of cards) {
    const voters = Array.isArray(card.voterIds) ? card.voterIds : [];
    card.voteCount = voters.length;
    highestVotes = Math.max(highestVotes, card.voteCount);
  }
  for (const card of cards) {
    card.isWinner = highestVotes >= 0 && card.voteCount === highestVotes;
  }
  room.votingWinners = cards.filter((card) => card.isWinner).map((card) => card.authorPlayerId);
  room.votingResultsShown = true;
}

function setVotingCardsShown(room, action) {
  const shouldShow = action?.isShown !== false;
  const filter = normalizeVotingCardFilter(action?.cardFilter);
  const cards = Array.isArray(room.votingCards) ? room.votingCards : [];
  if (shouldShow && filter === "all") room.votingCardsShown = true;
  if (!shouldShow && filter === "all") room.votingCardsShown = false;
  for (const card of cards) {
    if (filter === "winners" && card.isWinner !== true) continue;
    if (filter === "losers" && card.isWinner === true) continue;
    card.hidden = !shouldShow;
  }
}

function serializeVotingCards(room) {
  if (room.votingCardsShown === false) return [];
  return (room.votingCards || [])
    .filter((card) => card && card.hidden !== true)
    .map((card, index) => {
      const voters = room.votingResultsShown === true
        ? (card.voterIds || []).map((playerId) => {
            const player = room.players.get(playerId);
            return player ? { id: player.id, name: player.name, avatar: player.avatar } : null;
          }).filter(Boolean)
        : [];
      return {
        id: card.id,
        index,
        text: card.text,
        voteCount: Number(card.voteCount || 0),
        isWinner: card.isWinner === true,
        resultsShown: room.votingResultsShown === true,
        voters
      };
    });
}

function craftingTimerDurationMs() {
  return Math.round(normalizeDurationSeconds(gameConstants().craftingTimerDuration, 30) * 1000);
}

function clearCraftingTimerTimeout(room) {
  if (!room.craftingTimerTimeoutId) return;
  clearTimeout(room.craftingTimerTimeoutId);
  room.craftingTimerTimeoutId = null;
}

function pauseCraftingTimer(room) {
  if (!room.craftingTimerRunning) return;
  room.craftingTimerRemainingMs = Math.max(0, (room.craftingTimerEndsAt || Date.now()) - Date.now());
  room.craftingTimerRunning = false;
  room.craftingTimerStartedAt = 0;
  room.craftingTimerEndsAt = 0;
  clearCraftingTimerTimeout(room);
}

function resetCraftingTimer(room) {
  clearAnswersSubmittedAdvanceTimer(room);
  clearCraftingTimerTimeout(room);
  room.craftingTimerShown = false;
  room.craftingTimerRunning = false;
  room.craftingTimerDurationMs = 0;
  room.craftingTimerRemainingMs = 0;
  room.craftingTimerStartedAt = 0;
  room.craftingTimerEndsAt = 0;
  room.craftingTimerActionId = "";
  room.craftingTimerTimerEndTargetActionId = "";
  room.craftingTimerAnswersSubmittedTargetActionId = "";
  room.craftingTimerEndHandled = false;
  clearActiveInputFlowEvent(room);
}

function setCraftingTimerShown(room, isShown) {
  if (isShown) {
    const durationMs = craftingTimerDurationMs();
    room.craftingTimerShown = true;
    room.craftingTimerRunning = false;
    room.craftingTimerDurationMs = durationMs;
    room.craftingTimerRemainingMs = durationMs;
    room.craftingTimerStartedAt = 0;
    room.craftingTimerEndsAt = 0;
    room.craftingTimerEndHandled = false;
    clearCraftingTimerTimeout(room);
    return;
  }
  pauseCraftingTimer(room);
  room.craftingTimerShown = false;
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

function scheduleCraftingTimerEnd(room) {
  clearCraftingTimerTimeout(room);
  const delayMs = Math.max(0, (room.craftingTimerEndsAt || Date.now()) - Date.now());
  room.craftingTimerTimeoutId = setTimeout(() => {
    room.craftingTimerTimeoutId = null;
    if (!room.craftingTimerRunning || room.craftingTimerEndHandled) return;
    emitInputFlowEvent(room, "timerEnd");
  }, delayMs + 20);
}

function startCraftingTimer(room, action) {
  if (!room.craftingTimerShown || room.craftingTimerDurationMs <= 0 || room.craftingTimerRemainingMs <= 0) {
    setCraftingTimerShown(room, true);
  }
  const now = Date.now();
  room.craftingTimerShown = true;
  room.craftingTimerRunning = true;
  room.craftingTimerStartedAt = now;
  room.craftingTimerEndsAt = now + Math.max(0, room.craftingTimerRemainingMs || room.craftingTimerDurationMs);
  room.craftingTimerActionId = action.id;
  room.craftingTimerTimerEndTargetActionId = "";
  room.craftingTimerAnswersSubmittedTargetActionId = "";
  room.craftingTimerEndHandled = false;
  scheduleCraftingTimerEnd(room);
}

function craftingTimerPayload(room) {
  const remainingMs = room.craftingTimerRunning
    ? Math.max(0, (room.craftingTimerEndsAt || Date.now()) - Date.now())
    : Math.max(0, room.craftingTimerRemainingMs || 0);
  return {
    shown: room.craftingTimerShown === true,
    running: room.craftingTimerRunning === true,
    durationMs: Math.max(0, room.craftingTimerDurationMs || 0),
    remainingMs,
    startedAt: room.craftingTimerStartedAt || 0,
    endsAt: room.craftingTimerEndsAt || 0,
    actionId: room.craftingTimerActionId || ""
  };
}

function allActivePlayersHaveSubmittedInput(room) {
  const active = activePlayers(room);
  if (!active.length) return false;
  if (room.votingInputActionId) {
    return active.every((player) => {
      const eligibleCards = (room.votingCards || []).filter((card) => card.hidden !== true && card.authorPlayerId !== player.id);
      return !eligibleCards.length || room.votingAnswers.has(player.id);
    });
  }
  if (room.textInputActionId) {
    return active.every((player) => room.textInputAnswers.get(player.id)?.done === true);
  }
  if (room.choiceInputActionId) {
    return active.every((player) => room.choiceInputAnswers.has(player.id));
  }
  return false;
}

function flowEventTargetForAction(action, eventType) {
  if (!action) return "";
  if (eventType === "timerEnd") return action.timerEndTargetActionId || "";
  if (eventType === "allPlayersSubmitted") return action.answersSubmittedTargetActionId || "";
  return "";
}

function clearActiveInputFlowEvent(room) {
  room.activeInputFlowEventKey = "";
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

function triviaContentForAction(room, action) {
  const variableName = normalizeFlowVariableName(action?.contentVariable);
  const stored = room.flowVariables?.[variableName];
  const prompt = stored?.id ? triviaPromptById(stored.id) || stored : multipleChoicePrompts[0];
  const content = action?.randomizeOptions ? shuffledTriviaPrompt(prompt) : {
    ...clonePrompt(prompt),
    optionOriginalIndexes: prompt.options.map((_, index) => index)
  };
  return content;
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
    const visibleCards = (room.votingCards || []).filter((card) => card && card.hidden !== true && card.authorPlayerId !== player?.id);
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
    lastPreparedVotingCardCount: Number(room.lastVotingPrepare?.cardCount || 0)
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
  clearVotingData(room);
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
    const eligibleCards = (room.votingCards || []).filter((card) => card && card.hidden !== true && card.authorPlayerId !== playerId);
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
