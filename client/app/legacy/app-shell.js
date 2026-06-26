"use strict";

const params = new URLSearchParams(window.location.search);
const pathRoles = {
  "/stage": "stage",
  "/s": "stage",
  "/controller": "controller",
  "/c": "controller",
  "/lab": "lab",
  "/l": "lab",
  "/art": "art",
  "/a": "art",
  "/flow": "flow",
  "/f": "flow",
  "/constants": "constants",
  "/const": "constants",
  "/host-audio": "host-audio",
  "/host-audios": "host-audio",
  "/audio": "host-audio",
  "/layout": "layout",
  "/layouts": "layout",
  "/controller-layout": "controller-layout",
  "/controller-layouts": "controller-layout",
  "/tools": "tools",
  "/tool": "tools"
};
const requestedRole = params.get("role");
const requestedPathRole = pathRoles[window.location.pathname.toLowerCase()];
const role = ["controller", "lab", "art", "flow", "constants", "host-audio", "layout", "controller-layout", "tools"].includes(requestedRole) ? requestedRole : requestedPathRole || "stage";
const origin = window.location.origin;
const canUseServer = window.location.protocol === "http:" || window.location.protocol === "https:";
const stageScreen = document.querySelector("#stageScreen");
const controllerScreen = document.querySelector("#controllerScreen");
const labScreen = document.querySelector("#labScreen");
const artScreen = document.querySelector("#artScreen");
const flowScreen = document.querySelector("#flowScreen");
const constantsScreen = document.querySelector("#constantsScreen");
const hostAudioScreen = document.querySelector("#hostAudioScreen");
const layoutScreen = document.querySelector("#layoutScreen");
const toolDashboardBar = document.querySelector("#toolDashboardBar");
const toolTabs = Array.from(document.querySelectorAll(".tool-tab"));
const globalSaveButton = document.querySelector("#globalSaveButton");
const unsafeChangesModal = document.querySelector("#unsafeChangesModal");
const unsafeChangesCopy = document.querySelector("#unsafeChangesCopy");
const unsafeCancelButton = document.querySelector("#unsafeCancelButton");
const unsafeSaveButton = document.querySelector("#unsafeSaveButton");
const stageBoard = document.querySelector("#stageBoard");
const stageCodeText = document.querySelector("#stageCodeText");
const stageCodeBadgeRoot = document.querySelector("#stageCodeBadge");
const stageCodeBadge = document.querySelector("#stageCodeBadge strong");
const stageJoinQr = document.querySelector("#stageJoinQr");
const stageJoinQrCanvas = document.querySelector("#stageJoinQrCanvas");
const craftingTimer = document.querySelector("#craftingTimer");
const craftingTimerLabel = document.querySelector("#craftingTimerLabel");
const stageDebugAction = document.querySelector("#stageDebugAction");
const playerLobby = document.querySelector("#playerLobby");
const joinPrompt = document.querySelector("#joinPrompt");
const waitingStatus = document.querySelector("#waitingStatus");
const startPopup = document.querySelector("#startPopup");
const stageWipe = document.querySelector("#stageWipe");
const stageMain = document.querySelector(".stage-main");
const stageFooter = document.querySelector(".stage-footer");
const stageIntroContent = document.querySelector("#stageIntroContent");
const stageIntroTitle = document.querySelector("#stageIntroTitle");
const votingCardLayer = document.querySelector("#votingCardLayer");
const stagePresentationText = document.querySelector("#stagePresentationText");
const stagePromptText = document.querySelector("#stagePromptText");
const presentClickWidget = document.querySelector("#presentClickWidget");
const stageDebugAlert = document.querySelector("#stageDebugAlert");
const pauseMenu = document.querySelector("#pauseMenu");
const returnToGameButton = document.querySelector("#returnToGameButton");
const quitToLobbyButton = document.querySelector("#quitToLobbyButton");
const joinState = document.querySelector("#joinState");
const controllerPanel = document.querySelector(".controller-panel");
const controllerLobbyState = document.querySelector("#controllerLobbyState");
const controllerIntroState = document.querySelector("#controllerIntroState");
const controllerIntroMessage = document.querySelector("#controllerIntroMessage");
const controllerGlobalActionState = document.querySelector("#controllerGlobalActionState");
const controllerGlobalActionMessage = document.querySelector("#controllerGlobalActionMessage");
const controllerGlobalActionButton = document.querySelector("#controllerGlobalActionButton");
const controllerChoiceState = document.querySelector("#controllerChoiceState");
const controllerChoicePrompt = document.querySelector("#controllerChoicePrompt");
const controllerChoiceGrid = document.querySelector("#controllerChoiceGrid");
const controllerChoiceDone = document.querySelector("#controllerChoiceDone");
const controllerMicAccessState = document.querySelector("#controllerMicAccessState");
const controllerMicAccessPrompt = document.querySelector("#controllerMicAccessPrompt");
const controllerMicAccessButton = document.querySelector("#controllerMicAccessButton");
const controllerMicAccessStatus = document.querySelector("#controllerMicAccessStatus");
const controllerTextState = document.querySelector("#controllerTextState");
const controllerTextPrompt = document.querySelector("#controllerTextPrompt");
const controllerInvalidBanner = document.querySelector("#controllerInvalidBanner");
const controllerTextInput = document.querySelector("#controllerTextInput");
const controllerTextSubmitButton = document.querySelector("#controllerTextSubmitButton");
const controllerVoiceButton = document.querySelector("#controllerVoiceButton");
const controllerVoiceStatus = document.querySelector("#controllerVoiceStatus");
const controllerTextDone = document.querySelector("#controllerTextDone");
const joinForm = document.querySelector("#joinForm");
const stageCodeInput = document.querySelector("#stageCodeInput");
const playerNameInput = document.querySelector("#playerNameInput");
const joinButton = document.querySelector("#joinButton");
const controllerPlayerName = document.querySelector("#controllerPlayerName");
const controllerAvatar = document.querySelector("#controllerAvatar");
const controllerPlayerBanner = document.querySelector("#controllerPlayerBanner");
const controllerPlayerBannerAvatar = document.querySelector("#controllerPlayerBannerAvatar");
const controllerPlayerBannerName = document.querySelector("#controllerPlayerBannerName");
const controllerMeta = document.querySelector("#controllerMeta");
const startGameButton = document.querySelector("#startGameButton");
const introPresentButton = document.querySelector("#introPresentButton");
const avatarPicker = document.querySelector("#avatarPicker");
const avatarPickerGrid = document.querySelector("#avatarPickerGrid");
const avatarPickerDoneButton = document.querySelector("#avatarPickerDoneButton");
const artAssetList = document.querySelector("#artAssetList");
const artSurfaceTabs = document.querySelectorAll("[data-art-surface]");
const artPreviewTitle = document.querySelector("#artPreviewTitle");
const artPreviewMeta = document.querySelector("#artPreviewMeta");
const artPreviewStage = document.querySelector(".art-preview-stage");
const artPreviewArt = document.querySelector(".art-preview-art");
const artFileInput = document.querySelector("#artFileInput");
const artFileName = document.querySelector("#artFileName");
const artReplaceButton = document.querySelector("#artReplaceButton");
const artCancelButton = document.querySelector("#artCancelButton");
const artComponentEditor = document.querySelector("#artComponentEditor");
const artSaveCompositionButton = document.querySelector("#artSaveCompositionButton");
const artDeleteCompositionButton = document.querySelector("#artDeleteCompositionButton");
const flowShell = document.querySelector(".flow-shell");
const flowResizer = document.querySelector("#flowResizer");
const flowList = document.querySelector("#flowList");
const flowListViewButton = document.querySelector("#flowListViewButton");
const flowNodeViewButton = document.querySelector("#flowNodeViewButton");
const flowEditor = document.querySelector("#flowEditor");
const flowNodeWorkspace = document.querySelector("#flowNodeWorkspace");
const flowNodeStage = document.querySelector("#flowNodeStage");
const flowNodeGraph = document.querySelector("#flowNodeGraph");
const flowNodeWorld = document.querySelector("#flowNodeWorld");
const flowNodeWires = document.querySelector("#flowNodeWires");
const flowNodeWireLabels = document.querySelector("#flowNodeWireLabels");
const flowNodeLayer = document.querySelector("#flowNodeLayer");
const flowNodeMinimap = document.querySelector("#flowNodeMinimap");
const flowNodeMinimapViewport = document.querySelector("#flowNodeMinimapViewport");
const flowNodeInspector = document.querySelector("#flowNodeInspector");
const nodeBackButton = document.querySelector("#nodeBackButton");
const nodeOptimizeButton = document.querySelector("#nodeOptimizeButton");
const nodeViewHelp = document.querySelector("#nodeViewHelp");
const flowNodeHint = document.querySelector("#flowNodeHint");
const flowEditorTitle = document.querySelector("#flowEditorTitle");
const flowEditorHelp = document.querySelector("#flowEditorHelp");
const flowStorageStatus = document.querySelector("#flowStorageStatus");
const addStateButton = document.querySelector("#addStateButton");
const addActionButton = document.querySelector("#addActionButton");
const deleteFlowItemButton = document.querySelector("#deleteFlowItemButton");
const revertFlowButton = document.querySelector("#revertFlowButton");
const constantsStorageStatus = document.querySelector("#constantsStorageStatus");
const gameTitleInput = document.querySelector("#gameTitleInput");
const craftingTimerDurationInput = document.querySelector("#craftingTimerDurationInput");
const startGameCountdownDurationInput = document.querySelector("#startGameCountdownDurationInput");
const pointsForCorrectAnswerInput = document.querySelector("#pointsForCorrectAnswerInput");
const numberOfRoundsInput = document.querySelector("#numberOfRoundsInput");
const randomChanceTestInput = document.querySelector("#randomChanceTestInput");
const speechToTextSendInputBufferInput = document.querySelector("#speechToTextSendInputBufferInput");
const overrideFirstGameInput = document.querySelector("#overrideFirstGameInput");
const playerColorList = document.querySelector("#playerColorList");
const playerColorCount = document.querySelector("#playerColorCount");
const addPlayerColorButton = document.querySelector("#addPlayerColorButton");
const customConstantNavList = document.querySelector("#customConstantNavList");
const customConstantList = document.querySelector("#customConstantList");
const addCustomConstantButton = document.querySelector("#addCustomConstantButton");
const hostAudioStorageStatus = document.querySelector("#hostAudioStorageStatus");
const hostAudioList = document.querySelector("#hostAudioList");
const hostAudioEditorTitle = document.querySelector("#hostAudioEditorTitle");
const hostAudioEditorHelp = document.querySelector("#hostAudioEditorHelp");
const hostAudioNameInput = document.querySelector("#hostAudioNameInput");
const hostAudioLineList = document.querySelector("#hostAudioLineList");
const addHostAudioButton = document.querySelector("#addHostAudioButton");
const addHostAudioLineButton = document.querySelector("#addHostAudioLineButton");
const deleteHostAudioButton = document.querySelector("#deleteHostAudioButton");
const revertHostAudiosButton = document.querySelector("#revertHostAudiosButton");
const layoutStorageStatus = document.querySelector("#layoutStorageStatus");
const layoutToolTitle = document.querySelector("#layoutToolTitle");
const layoutToolDescription = document.querySelector("#layoutToolDescription");
const layoutStateList = document.querySelector("#layoutStateList");
const layoutElementList = document.querySelector("#layoutElementList");
const layoutEditorTitle = document.querySelector("#layoutEditorTitle");
const layoutEditorHelp = document.querySelector("#layoutEditorHelp");
const layoutStagePreview = document.querySelector("#layoutStagePreview");
const layoutEditorFields = document.querySelector("#layoutEditorFields");
const addLayoutObjectButton = document.querySelector("#addLayoutObjectButton");
const removeLayoutObjectButton = document.querySelector("#removeLayoutObjectButton");
const layoutPreviewAddObjectButton = document.querySelector("#layoutPreviewAddObjectButton");
const layoutPreviewRemoveObjectButton = document.querySelector("#layoutPreviewRemoveObjectButton");
const layoutObjectPicker = document.querySelector("#layoutObjectPicker");
const layoutObjectSearch = document.querySelector("#layoutObjectSearch");
const layoutObjectOptions = document.querySelector("#layoutObjectOptions");
const revertLayoutButton = document.querySelector("#revertLayoutButton");
let controllerState = null;
let lobbyPollTimer = null;
let stageCountdownTimer = null;
let controllerCountdownTimer = null;
let dismissedTextInvalidKey = "";
let countdownClockOffset = 0;
let actionTimingTimer = null;
let subActionTimers = [];
let textObjectTimers = [];
const visualAnimation = window.PartyGameVisualObject;
let stageAudioPlayers = new Set();
let stageTextObjects = {};
let runtimeTestLayouts = null;
let runtimeTestControllerLayouts = null;
let isStagePaused = false;
let pausedCompletionRequest = null;
let currentStageState = null;
let presentationAdvancePending = false;
let artAssets = [];
let artGroups = [];
let artCompositions = [];
let artCompositionsSavedSnapshot = "";
let selectedArtAsset = null;
let selectedArtComposite = null;
let pendingArtReplacement = null;
const collapsedArtSections = new Set(getLocalJsonArray("partyTemplate.collapsedArtSections"));
const collapsedArtComposites = new Set(getLocalJsonArray("partyTemplate.collapsedArtComposites"));
let gameFlow = { states: [] };
let gameConstants = {
  playerColors: [],
  craftingTimerDuration: 30,
  startGameCountdownDuration: 1,
  pointsForCorrectAnswer: 200,
  gameTitle: "Party Game Template",
  numberOfRounds: 3,
  randomChanceTest: 0.5,
  speechToTextSendInputBuffer: 1,
  overrideFirstGameOfSession: false,
  customConstants: []
};
let hostAudios = { hostAudios: [] };
let selectedGameConstantId = "gameTitle";
let selectedHostAudioId = "";
let selectedHostAudioLineId = "";
let stageLayouts = { canvas: { width: 1920, height: 1080 }, global: { id: "global", name: "Global Layout", elements: [] }, states: [] };
let controllerLayouts = { canvas: { width: 390, height: 844 }, global: { id: "global", name: "Global Layout", elements: [] }, states: [] };
let flowSavedSnapshot = "";
let constantsSavedSnapshot = "";
let hostAudiosSavedSnapshot = "";
let layoutSavedSnapshot = "";
let controllerLayoutSavedSnapshot = "";
let flowActionTypes = [];
let flowTransitions = [];
let selectedFlowStateId = "";
let selectedFlowActionId = "";
let selectedFlowActionIds = new Set();
let selectedFlowRouteNodeId = "";
let selectedFlowRouteBranchId = "";
let flowViewMode = getLocalValue("partyTemplate.flowViewMode") === "node" ? "node" : "list";
let flowNodeDepth = "moments";
let flowNodeZoom = Math.min(1, Math.max(0.1, Number(getLocalValue("partyTemplate.flowNodeZoom") || 1) || 1));
const collapsedFlowStates = new Set(getLocalJsonArray("partyTemplate.collapsedFlowStates"));
const collapsedFlowActions = new Set(getLocalJsonArray("partyTemplate.collapsedFlowActions"));
let flowHistoryManager = null;
let artHistoryManager = null;
let constantsHistoryManager = null;
let hostAudioHistoryManager = null;
let artToolInitialized = false;
let flowToolInitialized = false;
let constantsToolInitialized = false;
let hostAudioToolInitialized = false;
let layoutToolInitialized = false;
let layoutToolMode = "stage";
let activeToolId = "";
let pendingToolSwitch = null;
let selectedLayoutStateId = "";
let selectedLayoutElementId = "";
let selectedLayoutElementIds = new Set();
const layoutPreviewHiddenElements = new Set();
let currentStageLayoutStateId = "";
let layoutHistoryManager = null;
const runtimeTestChannel = "BroadcastChannel" in window ? new BroadcastChannel("party-game-template-runtime-test") : null;
const artAssetUrls = new Map([
  ["avatar-frame", "/art/default/avatar-frame.svg"],
  ["avatar-rex", "/art/default/dino-rex.svg"],
  ["avatar-stego", "/art/default/dino-stego.svg"],
  ["avatar-trike", "/art/default/dino-trike.svg"],
  ["avatar-raptor", "/art/default/dino-raptor.svg"],
  ["avatar-bronto", "/art/default/dino-bronto.svg"],
  ["avatar-ankylo", "/art/default/dino-ankylo.svg"],
  ["presentation-click-cursor", "/art/default/cursor-arrow.svg"]
]);
const avatarAssetIds = {
  rex: "avatar-rex",
  stego: "avatar-stego",
  trike: "avatar-trike",
  raptor: "avatar-raptor",
  bronto: "avatar-bronto",
  ankylo: "avatar-ankylo"
};
const avatarComposites = [
  { id: "avatar-composite-rex", name: "Player Avatar Rex", species: "rex", dinoAssetId: "avatar-rex" },
  { id: "avatar-composite-stego", name: "Player Avatar Stego", species: "stego", dinoAssetId: "avatar-stego" },
  { id: "avatar-composite-trike", name: "Player Avatar Trike", species: "trike", dinoAssetId: "avatar-trike" },
  { id: "avatar-composite-raptor", name: "Player Avatar Raptor", species: "raptor", dinoAssetId: "avatar-raptor" },
  { id: "avatar-composite-bronto", name: "Player Avatar Bronto", species: "bronto", dinoAssetId: "avatar-bronto" },
  { id: "avatar-composite-ankylo", name: "Player Avatar Ankylo", species: "ankylo", dinoAssetId: "avatar-ankylo" }
];








if (role === "lab") {
  setupLab();
} else if (role === "art") {
  setupArtTool();
} else if (role === "flow") {
  setupFlowTool();
} else if (role === "constants") {
  setupConstantsTool();
} else if (role === "host-audio") {
  setupHostAudioTool();
} else if (role === "layout") {
  setupLayoutTool("stage");
} else if (role === "controller-layout") {
  setupLayoutTool("controller");
} else if (role === "tools") {
  setupToolDashboard();
} else if (role === "controller") {
  setupController();
} else {
  setupStage();
}

