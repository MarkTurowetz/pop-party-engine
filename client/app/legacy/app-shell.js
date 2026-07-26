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
const globalSaveStatus = document.querySelector("#globalSaveStatus");
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
const stageDebugAction = document.querySelector("#stageDebugAction");
const playerLobby = document.querySelector("#playerLobby");
const joinPrompt = document.querySelector("#joinPrompt");
const waitingStatus = document.querySelector("#waitingStatus");
const startPopup = document.querySelector("#startPopup");
const stageWipe = document.querySelector("#stageWipe");
const stageMain = document.querySelector(".stage-main");
const stageFooter = document.querySelector(".stage-footer");
const stageIntroContent = document.querySelector("#stageIntroContent");
const votingCardLayer = document.querySelector("#votingCardLayer");
const presentClickWidget = document.querySelector("#presentClickWidget");
const stageDebugAlert = document.querySelector("#stageDebugAlert");
const pauseMenu = document.querySelector("#pauseMenu");
const returnToGameButton = document.querySelector("#returnToGameButton");
const quitToLobbyButton = document.querySelector("#quitToLobbyButton");
const joinState = document.querySelector("#joinState");
const controllerPanel = document.querySelector(".controller-panel");
const controllerLobbyState = document.querySelector("#controllerLobbyState");
const controllerGlobalActionState = document.querySelector("#controllerGlobalActionState");
const controllerPresentationMessage = "controllerPresentationMessage";
const controllerPresentationButtonContainer = document.querySelector("#controllerPresentationButtonContainer");
const controllerPausedMessage = "controllerPausedMessage";
const controllerPausedButtonContainer = document.querySelector("#controllerPausedButtonContainer");
const controllerChoiceState = document.querySelector("#controllerChoiceState");
const controllerChoicePrompt = "controllerChoicePrompt";
const controllerChoiceGrid = document.querySelector("#controllerChoiceGrid");
const controllerChoiceDone = "controllerChoiceDone";
const controllerMicAccessState = document.querySelector("#controllerMicAccessState");
const controllerMicAccessPrompt = "controllerMicAccessPrompt";
const controllerMicAccessButtonContainer = document.querySelector("#controllerMicAccessButtonContainer");
const controllerMicAccessStatus = "controllerMicAccessStatus";
const controllerTextState = document.querySelector("#controllerTextState");
const controllerTextPrompt = "controllerTextPrompt";
const controllerInvalidBanner = document.querySelector("#controllerInvalidBanner");
const controllerTextInput = document.querySelector("#controllerTextInput");
const controllerTextSubmitButtonContainer = document.querySelector("#controllerTextSubmitButtonContainer");
const controllerVoiceButtonContainer = document.querySelector("#controllerVoiceButtonContainer");
const controllerVoiceStatus = "controllerVoiceStatus";
const controllerTextDone = "controllerTextDone";
const joinForm = document.querySelector("#joinForm");
const stageCodeInput = document.querySelector("#stageCodeInput");
const playerNameInput = document.querySelector("#playerNameInput");
const controllerJoinButtonContainer = document.querySelector("#controllerJoinButtonContainer");
const controllerPlayerName = "controllerPlayerName";
const controllerAvatar = document.querySelector("#controllerAvatar");
const controllerPlayerBanner = document.querySelector("#controllerPlayerBanner");
const controllerMeta = "controllerMeta";
const controllerLobbyButtonContainer = document.querySelector("#controllerLobbyButtonContainer");
const avatarPicker = document.querySelector("#avatarPicker");
const avatarPickerGrid = document.querySelector("#avatarPickerGrid");
const avatarPickerDoneButton = document.querySelector("#avatarPickerDoneButton");
const artAssetList = document.querySelector("#artAssetList");
const artShell = document.querySelector(".art-shell");
const artResizer = document.querySelector("#artResizer");
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
const artCreateButton = document.querySelector("#artCreateButton");
const artCreateChildButton = document.querySelector("#artCreateChildButton");
const artCreateFolderButton = document.querySelector("#artCreateFolderButton");
const artAssetSearchInput = document.querySelector("#artAssetSearchInput");
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
const constantsShell = document.querySelector(".constants-shell");
const constantsResizer = document.querySelector("#constantsResizer");
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
const hostAudioShell = document.querySelector(".host-audio-shell");
const hostAudioResizer = document.querySelector("#hostAudioResizer");
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
const layoutShell = document.querySelector(".layout-shell");
const layoutResizer = document.querySelector("#layoutResizer");
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
let artOrganization = { stage: { folders: [], order: [], folderItems: {} }, controller: { folders: [], order: [], folderItems: {} } };
let artCompositionsSavedSnapshot = "";
let artOrganizationSavedSnapshot = "";
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









// --- app-shell state exposure for TS runtime modules (Phase 3 strangler) ---
// Mutable let state proxies the live lexical binding via get/set; const refs/
// config are shared by reference. Classic scripts keep reading bare identifiers
// (lexical, unchanged); TS modules read/write window.X against the SAME state.
// (origin is omitted — native read-only window.origin; TS uses location.origin.)
window.params = params;
window.pathRoles = pathRoles;
window.requestedRole = requestedRole;
window.requestedPathRole = requestedPathRole;
window.role = role;
window.canUseServer = canUseServer;
window.stageScreen = stageScreen;
window.controllerScreen = controllerScreen;
window.labScreen = labScreen;
window.artScreen = artScreen;
window.flowScreen = flowScreen;
window.constantsScreen = constantsScreen;
window.hostAudioScreen = hostAudioScreen;
window.layoutScreen = layoutScreen;
window.toolDashboardBar = toolDashboardBar;
window.toolTabs = toolTabs;
window.globalSaveButton = globalSaveButton;
window.globalSaveStatus = globalSaveStatus;
window.unsafeChangesModal = unsafeChangesModal;
window.unsafeChangesCopy = unsafeChangesCopy;
window.unsafeCancelButton = unsafeCancelButton;
window.unsafeSaveButton = unsafeSaveButton;
window.stageBoard = stageBoard;
window.stageCodeText = stageCodeText;
window.stageCodeBadgeRoot = stageCodeBadgeRoot;
window.stageCodeBadge = stageCodeBadge;
window.stageJoinQr = stageJoinQr;
window.stageJoinQrCanvas = stageJoinQrCanvas;
window.craftingTimer = craftingTimer;
window.stageDebugAction = stageDebugAction;
window.playerLobby = playerLobby;
window.joinPrompt = joinPrompt;
window.waitingStatus = waitingStatus;
window.startPopup = startPopup;
window.stageWipe = stageWipe;
window.stageMain = stageMain;
window.stageFooter = stageFooter;
window.stageIntroContent = stageIntroContent;
window.votingCardLayer = votingCardLayer;
window.presentClickWidget = presentClickWidget;
window.stageDebugAlert = stageDebugAlert;
window.pauseMenu = pauseMenu;
window.returnToGameButton = returnToGameButton;
window.quitToLobbyButton = quitToLobbyButton;
window.joinState = joinState;
window.controllerPanel = controllerPanel;
window.controllerLobbyState = controllerLobbyState;
window.controllerGlobalActionState = controllerGlobalActionState;
window.controllerPresentationMessage = controllerPresentationMessage;
window.controllerPresentationButtonContainer = controllerPresentationButtonContainer;
window.controllerPausedMessage = controllerPausedMessage;
window.controllerPausedButtonContainer = controllerPausedButtonContainer;
window.controllerChoiceState = controllerChoiceState;
window.controllerChoicePrompt = controllerChoicePrompt;
window.controllerChoiceGrid = controllerChoiceGrid;
window.controllerChoiceDone = controllerChoiceDone;
window.controllerMicAccessState = controllerMicAccessState;
window.controllerMicAccessPrompt = controllerMicAccessPrompt;
window.controllerMicAccessButtonContainer = controllerMicAccessButtonContainer;
window.controllerMicAccessStatus = controllerMicAccessStatus;
window.controllerTextState = controllerTextState;
window.controllerTextPrompt = controllerTextPrompt;
window.controllerInvalidBanner = controllerInvalidBanner;
window.controllerTextInput = controllerTextInput;
window.controllerTextSubmitButtonContainer = controllerTextSubmitButtonContainer;
window.controllerVoiceButtonContainer = controllerVoiceButtonContainer;
window.controllerVoiceStatus = controllerVoiceStatus;
window.controllerTextDone = controllerTextDone;
window.joinForm = joinForm;
window.stageCodeInput = stageCodeInput;
window.playerNameInput = playerNameInput;
window.controllerJoinButtonContainer = controllerJoinButtonContainer;
window.controllerPlayerName = controllerPlayerName;
window.controllerAvatar = controllerAvatar;
window.controllerPlayerBanner = controllerPlayerBanner;
window.controllerMeta = controllerMeta;
window.controllerLobbyButtonContainer = controllerLobbyButtonContainer;
window.avatarPicker = avatarPicker;
window.avatarPickerGrid = avatarPickerGrid;
window.avatarPickerDoneButton = avatarPickerDoneButton;
window.artAssetList = artAssetList;
window.artShell = artShell;
window.artResizer = artResizer;
window.artSurfaceTabs = artSurfaceTabs;
window.artPreviewTitle = artPreviewTitle;
window.artPreviewMeta = artPreviewMeta;
window.artPreviewStage = artPreviewStage;
window.artPreviewArt = artPreviewArt;
window.artFileInput = artFileInput;
window.artFileName = artFileName;
window.artReplaceButton = artReplaceButton;
window.artCancelButton = artCancelButton;
window.artComponentEditor = artComponentEditor;
window.artSaveCompositionButton = artSaveCompositionButton;
window.artDeleteCompositionButton = artDeleteCompositionButton;
window.artCreateButton = artCreateButton;
window.artCreateChildButton = artCreateChildButton;
window.artCreateFolderButton = artCreateFolderButton;
window.artAssetSearchInput = artAssetSearchInput;
window.flowShell = flowShell;
window.flowResizer = flowResizer;
window.flowList = flowList;
window.flowListViewButton = flowListViewButton;
window.flowNodeViewButton = flowNodeViewButton;
window.flowEditor = flowEditor;
window.flowNodeWorkspace = flowNodeWorkspace;
window.flowNodeStage = flowNodeStage;
window.flowNodeGraph = flowNodeGraph;
window.flowNodeWorld = flowNodeWorld;
window.flowNodeWires = flowNodeWires;
window.flowNodeWireLabels = flowNodeWireLabels;
window.flowNodeLayer = flowNodeLayer;
window.flowNodeMinimap = flowNodeMinimap;
window.flowNodeMinimapViewport = flowNodeMinimapViewport;
window.flowNodeInspector = flowNodeInspector;
window.nodeBackButton = nodeBackButton;
window.nodeOptimizeButton = nodeOptimizeButton;
window.nodeViewHelp = nodeViewHelp;
window.flowNodeHint = flowNodeHint;
window.flowEditorTitle = flowEditorTitle;
window.flowEditorHelp = flowEditorHelp;
window.flowStorageStatus = flowStorageStatus;
window.addStateButton = addStateButton;
window.addActionButton = addActionButton;
window.deleteFlowItemButton = deleteFlowItemButton;
window.revertFlowButton = revertFlowButton;
window.constantsStorageStatus = constantsStorageStatus;
window.constantsShell = constantsShell;
window.constantsResizer = constantsResizer;
window.gameTitleInput = gameTitleInput;
window.craftingTimerDurationInput = craftingTimerDurationInput;
window.startGameCountdownDurationInput = startGameCountdownDurationInput;
window.pointsForCorrectAnswerInput = pointsForCorrectAnswerInput;
window.numberOfRoundsInput = numberOfRoundsInput;
window.randomChanceTestInput = randomChanceTestInput;
window.speechToTextSendInputBufferInput = speechToTextSendInputBufferInput;
window.overrideFirstGameInput = overrideFirstGameInput;
window.playerColorList = playerColorList;
window.playerColorCount = playerColorCount;
window.addPlayerColorButton = addPlayerColorButton;
window.customConstantNavList = customConstantNavList;
window.customConstantList = customConstantList;
window.addCustomConstantButton = addCustomConstantButton;
window.hostAudioStorageStatus = hostAudioStorageStatus;
window.hostAudioShell = hostAudioShell;
window.hostAudioResizer = hostAudioResizer;
window.hostAudioList = hostAudioList;
window.hostAudioEditorTitle = hostAudioEditorTitle;
window.hostAudioEditorHelp = hostAudioEditorHelp;
window.hostAudioNameInput = hostAudioNameInput;
window.hostAudioLineList = hostAudioLineList;
window.addHostAudioButton = addHostAudioButton;
window.addHostAudioLineButton = addHostAudioLineButton;
window.deleteHostAudioButton = deleteHostAudioButton;
window.revertHostAudiosButton = revertHostAudiosButton;
window.layoutStorageStatus = layoutStorageStatus;
window.layoutShell = layoutShell;
window.layoutResizer = layoutResizer;
window.layoutToolTitle = layoutToolTitle;
window.layoutToolDescription = layoutToolDescription;
window.layoutStateList = layoutStateList;
window.layoutElementList = layoutElementList;
window.layoutEditorTitle = layoutEditorTitle;
window.layoutEditorHelp = layoutEditorHelp;
window.layoutStagePreview = layoutStagePreview;
window.layoutEditorFields = layoutEditorFields;
window.addLayoutObjectButton = addLayoutObjectButton;
window.removeLayoutObjectButton = removeLayoutObjectButton;
window.layoutPreviewAddObjectButton = layoutPreviewAddObjectButton;
window.layoutPreviewRemoveObjectButton = layoutPreviewRemoveObjectButton;
window.layoutObjectPicker = layoutObjectPicker;
window.layoutObjectSearch = layoutObjectSearch;
window.layoutObjectOptions = layoutObjectOptions;
window.revertLayoutButton = revertLayoutButton;
window.visualAnimation = visualAnimation;
window.collapsedArtSections = collapsedArtSections;
window.collapsedArtComposites = collapsedArtComposites;
window.collapsedFlowStates = collapsedFlowStates;
window.collapsedFlowActions = collapsedFlowActions;
window.layoutPreviewHiddenElements = layoutPreviewHiddenElements;
window.runtimeTestChannel = runtimeTestChannel;
window.artAssetUrls = artAssetUrls;
window.avatarAssetIds = avatarAssetIds;
window.avatarComposites = avatarComposites;
Object.defineProperty(window, "controllerState", { configurable: true, get: () => controllerState, set: (v) => { controllerState = v; } });
Object.defineProperty(window, "lobbyPollTimer", { configurable: true, get: () => lobbyPollTimer, set: (v) => { lobbyPollTimer = v; } });
Object.defineProperty(window, "stageCountdownTimer", { configurable: true, get: () => stageCountdownTimer, set: (v) => { stageCountdownTimer = v; } });
Object.defineProperty(window, "controllerCountdownTimer", { configurable: true, get: () => controllerCountdownTimer, set: (v) => { controllerCountdownTimer = v; } });
Object.defineProperty(window, "dismissedTextInvalidKey", { configurable: true, get: () => dismissedTextInvalidKey, set: (v) => { dismissedTextInvalidKey = v; } });
Object.defineProperty(window, "countdownClockOffset", { configurable: true, get: () => countdownClockOffset, set: (v) => { countdownClockOffset = v; } });
Object.defineProperty(window, "actionTimingTimer", { configurable: true, get: () => actionTimingTimer, set: (v) => { actionTimingTimer = v; } });
Object.defineProperty(window, "subActionTimers", { configurable: true, get: () => subActionTimers, set: (v) => { subActionTimers = v; } });
Object.defineProperty(window, "textObjectTimers", { configurable: true, get: () => textObjectTimers, set: (v) => { textObjectTimers = v; } });
Object.defineProperty(window, "stageAudioPlayers", { configurable: true, get: () => stageAudioPlayers, set: (v) => { stageAudioPlayers = v; } });
Object.defineProperty(window, "stageTextObjects", { configurable: true, get: () => stageTextObjects, set: (v) => { stageTextObjects = v; } });
Object.defineProperty(window, "runtimeTestLayouts", { configurable: true, get: () => runtimeTestLayouts, set: (v) => { runtimeTestLayouts = v; } });
Object.defineProperty(window, "runtimeTestControllerLayouts", { configurable: true, get: () => runtimeTestControllerLayouts, set: (v) => { runtimeTestControllerLayouts = v; } });
Object.defineProperty(window, "isStagePaused", { configurable: true, get: () => isStagePaused, set: (v) => { isStagePaused = v; } });
Object.defineProperty(window, "pausedCompletionRequest", { configurable: true, get: () => pausedCompletionRequest, set: (v) => { pausedCompletionRequest = v; } });
Object.defineProperty(window, "currentStageState", { configurable: true, get: () => currentStageState, set: (v) => { currentStageState = v; } });
Object.defineProperty(window, "presentationAdvancePending", { configurable: true, get: () => presentationAdvancePending, set: (v) => { presentationAdvancePending = v; } });
Object.defineProperty(window, "artAssets", { configurable: true, get: () => artAssets, set: (v) => { artAssets = v; } });
Object.defineProperty(window, "artGroups", { configurable: true, get: () => artGroups, set: (v) => { artGroups = v; } });
Object.defineProperty(window, "artCompositions", { configurable: true, get: () => artCompositions, set: (v) => { artCompositions = v; } });
Object.defineProperty(window, "artOrganization", { configurable: true, get: () => artOrganization, set: (v) => { artOrganization = v; } });
Object.defineProperty(window, "artCompositionsSavedSnapshot", { configurable: true, get: () => artCompositionsSavedSnapshot, set: (v) => { artCompositionsSavedSnapshot = v; } });
Object.defineProperty(window, "artOrganizationSavedSnapshot", { configurable: true, get: () => artOrganizationSavedSnapshot, set: (v) => { artOrganizationSavedSnapshot = v; } });
Object.defineProperty(window, "selectedArtAsset", { configurable: true, get: () => selectedArtAsset, set: (v) => { selectedArtAsset = v; } });
Object.defineProperty(window, "selectedArtComposite", { configurable: true, get: () => selectedArtComposite, set: (v) => { selectedArtComposite = v; } });
Object.defineProperty(window, "pendingArtReplacement", { configurable: true, get: () => pendingArtReplacement, set: (v) => { pendingArtReplacement = v; } });
Object.defineProperty(window, "gameFlow", { configurable: true, get: () => gameFlow, set: (v) => { gameFlow = v; } });
Object.defineProperty(window, "gameConstants", { configurable: true, get: () => gameConstants, set: (v) => { gameConstants = v; } });
Object.defineProperty(window, "hostAudios", { configurable: true, get: () => hostAudios, set: (v) => { hostAudios = v; } });
Object.defineProperty(window, "selectedGameConstantId", { configurable: true, get: () => selectedGameConstantId, set: (v) => { selectedGameConstantId = v; } });
Object.defineProperty(window, "selectedHostAudioId", { configurable: true, get: () => selectedHostAudioId, set: (v) => { selectedHostAudioId = v; } });
Object.defineProperty(window, "selectedHostAudioLineId", { configurable: true, get: () => selectedHostAudioLineId, set: (v) => { selectedHostAudioLineId = v; } });
Object.defineProperty(window, "stageLayouts", { configurable: true, get: () => stageLayouts, set: (v) => { stageLayouts = v; } });
Object.defineProperty(window, "controllerLayouts", { configurable: true, get: () => controllerLayouts, set: (v) => { controllerLayouts = v; } });
Object.defineProperty(window, "flowSavedSnapshot", { configurable: true, get: () => flowSavedSnapshot, set: (v) => { flowSavedSnapshot = v; } });
Object.defineProperty(window, "constantsSavedSnapshot", { configurable: true, get: () => constantsSavedSnapshot, set: (v) => { constantsSavedSnapshot = v; } });
Object.defineProperty(window, "hostAudiosSavedSnapshot", { configurable: true, get: () => hostAudiosSavedSnapshot, set: (v) => { hostAudiosSavedSnapshot = v; } });
Object.defineProperty(window, "layoutSavedSnapshot", { configurable: true, get: () => layoutSavedSnapshot, set: (v) => { layoutSavedSnapshot = v; } });
Object.defineProperty(window, "controllerLayoutSavedSnapshot", { configurable: true, get: () => controllerLayoutSavedSnapshot, set: (v) => { controllerLayoutSavedSnapshot = v; } });
Object.defineProperty(window, "flowActionTypes", { configurable: true, get: () => flowActionTypes, set: (v) => { flowActionTypes = v; } });
Object.defineProperty(window, "flowTransitions", { configurable: true, get: () => flowTransitions, set: (v) => { flowTransitions = v; } });
Object.defineProperty(window, "selectedFlowStateId", { configurable: true, get: () => selectedFlowStateId, set: (v) => { selectedFlowStateId = v; } });
Object.defineProperty(window, "selectedFlowActionId", { configurable: true, get: () => selectedFlowActionId, set: (v) => { selectedFlowActionId = v; } });
Object.defineProperty(window, "selectedFlowActionIds", { configurable: true, get: () => selectedFlowActionIds, set: (v) => { selectedFlowActionIds = v; } });
Object.defineProperty(window, "selectedFlowRouteNodeId", { configurable: true, get: () => selectedFlowRouteNodeId, set: (v) => { selectedFlowRouteNodeId = v; } });
Object.defineProperty(window, "selectedFlowRouteBranchId", { configurable: true, get: () => selectedFlowRouteBranchId, set: (v) => { selectedFlowRouteBranchId = v; } });
Object.defineProperty(window, "flowNodeDepth", { configurable: true, get: () => flowNodeDepth, set: (v) => { flowNodeDepth = v; } });
Object.defineProperty(window, "flowNodeZoom", { configurable: true, get: () => flowNodeZoom, set: (v) => { flowNodeZoom = v; } });
Object.defineProperty(window, "flowHistoryManager", { configurable: true, get: () => flowHistoryManager, set: (v) => { flowHistoryManager = v; } });
Object.defineProperty(window, "artHistoryManager", { configurable: true, get: () => artHistoryManager, set: (v) => { artHistoryManager = v; } });
Object.defineProperty(window, "constantsHistoryManager", { configurable: true, get: () => constantsHistoryManager, set: (v) => { constantsHistoryManager = v; } });
Object.defineProperty(window, "hostAudioHistoryManager", { configurable: true, get: () => hostAudioHistoryManager, set: (v) => { hostAudioHistoryManager = v; } });
Object.defineProperty(window, "artToolInitialized", { configurable: true, get: () => artToolInitialized, set: (v) => { artToolInitialized = v; } });
Object.defineProperty(window, "flowToolInitialized", { configurable: true, get: () => flowToolInitialized, set: (v) => { flowToolInitialized = v; } });
Object.defineProperty(window, "constantsToolInitialized", { configurable: true, get: () => constantsToolInitialized, set: (v) => { constantsToolInitialized = v; } });
Object.defineProperty(window, "hostAudioToolInitialized", { configurable: true, get: () => hostAudioToolInitialized, set: (v) => { hostAudioToolInitialized = v; } });
Object.defineProperty(window, "layoutToolInitialized", { configurable: true, get: () => layoutToolInitialized, set: (v) => { layoutToolInitialized = v; } });
Object.defineProperty(window, "layoutToolMode", { configurable: true, get: () => layoutToolMode, set: (v) => { layoutToolMode = v; } });
Object.defineProperty(window, "activeToolId", { configurable: true, get: () => activeToolId, set: (v) => { activeToolId = v; } });
Object.defineProperty(window, "pendingToolSwitch", { configurable: true, get: () => pendingToolSwitch, set: (v) => { pendingToolSwitch = v; } });
Object.defineProperty(window, "selectedLayoutStateId", { configurable: true, get: () => selectedLayoutStateId, set: (v) => { selectedLayoutStateId = v; } });
Object.defineProperty(window, "selectedLayoutElementId", { configurable: true, get: () => selectedLayoutElementId, set: (v) => { selectedLayoutElementId = v; } });
Object.defineProperty(window, "selectedLayoutElementIds", { configurable: true, get: () => selectedLayoutElementIds, set: (v) => { selectedLayoutElementIds = v; } });
Object.defineProperty(window, "currentStageLayoutStateId", { configurable: true, get: () => currentStageLayoutStateId, set: (v) => { currentStageLayoutStateId = v; } });
Object.defineProperty(window, "layoutHistoryManager", { configurable: true, get: () => layoutHistoryManager, set: (v) => { layoutHistoryManager = v; } });

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
