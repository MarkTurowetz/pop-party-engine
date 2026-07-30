import { StageCountdownPopupController } from "./stageCountdownPopupController";
import { StageManagedTextSources, type StageManagedTextSource } from "./stageManagedTextSources";
import { StageSubActionScheduler } from "./stageSubActionScheduler";

// Typed port of the legacy client/stage-runtime.js (top-level classic script) — the
// stage orchestrator. Defines setupStage (app-shell dispatches setupStage()),
// applyControllerRuntimeTestMessage
// (controller.ts reads it), and installs window.PartyGameStageDebugRuntime. It reads
// app-shell DOM/state + utils + the now-on-window layout-runtime fns + the ported
// PartyGameStage* via window. All top-level names are installed on window to
// replicate the classic script's globals.

type Dict = Record<string, unknown>;
type El = HTMLElement;
type AudioEl = HTMLAudioElement & { stageInterrupted?: boolean };

const CRAFTING_TRIVIA_PROMPT_TEXT_ID = "craftingTriviaPromptText";

interface StageVisualControllersApi {
  createStageTextController: (o: Dict) => { init: () => void; set: (t: unknown, o: Dict) => number };
  createCraftingTimerController: (o: Dict) => Dict;
}

declare global {
  interface Window {
    setupStage?: () => void | Promise<void>;
    // layout-runtime functions (installed by layoutRuntime.ts) consumed here.
    normalizeTextTargetId?: (value: unknown) => string;
    applyStageLayoutTextProperties?: (target: El, element: Dict) => void;
    applyStageLayoutForPhase?: (phase: string) => void;
    initializeStageMomentLayout?: () => void;
    resetStageMomentLayout?: () => void;
    stageMomentLayoutReadiness?: () => Dict;
    applyControllerLayoutForPhase?: (phase: string, visitKey?: string) => void;
    setStageLayoutGameObjectShownForAction?: (action: Dict, options?: Dict) => unknown;
    setStageLayoutArtElementShownForAction?: (action: Dict, options?: Dict) => unknown;
    playStageLayoutGameObjectAnimationForAction?: (action: Dict, options?: Dict) => unknown;
    loadStageLayouts?: (options?: { forceServer?: boolean; stageCode?: string }) => Promise<Dict>;
    stageLayoutStateForPhase?: (phase: string) => Dict | null;
    stageLayoutEntityForElementId?: (elementId: string, target: El | null, scope?: string) => Dict | null;
    // utils not otherwise typed.
    getOrCreateStageCode?: () => string;
    artComposition?: (id: string) => Dict | null;
    mergeArtCompositionDrafts?: (compositions?: Dict[]) => Dict[];
    // app-shell mutable state (proxied via app-shell exposure).
    currentStageState: Dict | null;
    isStagePaused: boolean;
    pausedCompletionRequest: Dict | null;
    presentationAdvancePending: boolean;
    countdownClockOffset: number;
    stageCountdownTimer: number | null;
    lobbyPollTimer: number | null;
    actionTimingTimer: number | null;
    textObjectTimers: number[];
    stageAudioPlayers: Set<AudioEl>;
    gameConstants: Dict;
    // app-shell DOM refs (used by the stage orchestrator).
    craftingTimer: El;
    playerLobby: El;
    stageDebugAction: El;
    stageDebugAlert: El;
    stageWipe: El;
    votingCardLayer: El;
    stageCodeText: El;
    stageCodeBadge: El;
    stageCodeBadgeRoot: El;
    stageJoinQr: El;
    stageJoinQrCanvas: HTMLCanvasElement;
    joinPrompt: El;
    waitingStatus: El;
    startPopup: El;
    presentClickWidget: El;
    stageMain: El;
    stageFooter: El;
    stageIntroContent: El;
    pauseMenu: El;
    returnToGameButton: El;
    quitToLobbyButton: El;
  }
}

const w = () => globalThis as typeof globalThis & Window;
const visualAnimation = () => w().visualAnimation;
const artComposition = (id: string): Dict | null => w().artComposition?.(id) || null;

let stageTextControllerInstance: { init: () => void; set: (t: unknown, o: Dict) => number } | null = null;
let craftingTimerControllerInstance: Dict | null = null;
let playerRosterRendererInstance: Dict | null = null;
let stageDebugPanelInstance: Dict | null = null;
let stageWipeControllerInstance: Dict | null = null;
let stageRenderOrchestratorInstance: Dict | null = null;
let stageWidgetArtRendererInstance: Dict | null = null;
let stageCountdownPopupControllerInstance: StageCountdownPopupController | null = null;
const initializedStageWidgetEntityRenderers = new WeakMap<El, unknown>();
let renderedStageJoinQrUrl = "";
const stageManagedTextSources = new StageManagedTextSources();
const stageSubActionScheduler = new StageSubActionScheduler({
  currentGameSessionId: () => Number((w().currentStageState as Dict | null)?.gameSessionId || 0),
  run: (action, actionKey) => runStageAction(action, false, actionKey)
});

function stageVisualControllers(): StageVisualControllersApi | null {
  return (w().PartyGameStageVisualControllers as unknown as StageVisualControllersApi) || null;
}

function stageWidgetArtRenderer(): Dict | null {
  if (!stageWidgetArtRendererInstance && w().PartyGameStageWidgetArt) {
    stageWidgetArtRendererInstance = (w().PartyGameStageWidgetArt as unknown as { createRenderer: (o: Dict) => Dict }).createRenderer({
      document, visualAnimation: visualAnimation(), getComposition: artComposition
    });
  }
  return stageWidgetArtRendererInstance;
}

function stageTextController() {
  if (!stageTextControllerInstance && stageVisualControllers()) {
    stageTextControllerInstance = stageVisualControllers()!.createStageTextController({
      visualAnimation: visualAnimation(),
      queryTextElements: () => [],
      defaultElements: {},
      normalizeTextTargetId: w().normalizeTextTargetId,
      applyTextProperties: w().applyStageLayoutTextProperties,
      timerSink: (timerId: number) => w().textObjectTimers.push(timerId),
      objects: w().stageTextObjects,
      setObjects: (objects: Record<string, Dict>) => {
        w().stageTextObjects = objects;
      }
    });
  }
  return stageTextControllerInstance;
}

function craftingTimerController(): Dict | null {
  if (!craftingTimerControllerInstance && stageVisualControllers()) {
    craftingTimerControllerInstance = stageVisualControllers()!.createCraftingTimerController({
      element: w().craftingTimer,
      getRenderedActionKey: () => currentRenderedActionKey(),
      getCurrentStageState: () => w().currentStageState,
      fallbackDurationMs: () => Math.max(1, Number((w().gameConstants as Dict).craftingTimerDuration || 30)) * 1000,
      renderArt: ({ label, timer }: Dict) => renderStageWidgetBinding("craftingTimer", { label, timer })
    });
  }
  return craftingTimerControllerInstance;
}

function playerRosterRenderer(): Dict | null {
  if (!playerRosterRendererInstance && w().PartyGamePlayerRoster) {
    playerRosterRendererInstance = (w().PartyGamePlayerRoster as unknown as { createRenderer: (o: Dict) => Dict }).createRenderer({
      host: w().playerLobby, document, gameObjectApi: w().PartyGameGameObject || w().PartyGameStageGameObject,
      timerSink: (timerId: number) => w().textObjectTimers.push(timerId),
      getComposition: artComposition
    });
  }
  return playerRosterRendererInstance;
}

function stageDebugPanel(): Dict | null {
  if (!stageDebugPanelInstance && w().PartyGameStageDebug) {
    stageDebugPanelInstance = (w().PartyGameStageDebug as unknown as { createPanel: (o: Dict) => Dict }).createPanel({
      actionElement: w().stageDebugAction, alertElement: w().stageDebugAlert
    });
  }
  return stageDebugPanelInstance;
}

const PartyGameStageDebugRuntime = {
  showGameObjectWarning: (details: Dict) => (stageDebugPanel() as { showGameObjectWarning?: (d: Dict) => void } | null)?.showGameObjectWarning?.(details),
  showArtAssetWarning: (details: Dict) => (stageDebugPanel() as { showGameObjectWarning?: (d: Dict) => void } | null)?.showGameObjectWarning?.(details)
};
w().PartyGameStageDebugRuntime = PartyGameStageDebugRuntime;

function stageWipeController(): Dict | null {
  if (!stageWipeControllerInstance && w().PartyGameStageWipe) {
    stageWipeControllerInstance = (w().PartyGameStageWipe as unknown as { createController: (o: Dict) => Dict }).createController({
      element: w().stageWipe,
      renderArt: () => renderStageWidgetBinding("stageWipe")
    });
  }
  return stageWipeControllerInstance;
}

function stageRenderOrchestrator(): Dict | null {
  if (!stageRenderOrchestratorInstance && w().PartyGameStageRenderOrchestrator) {
    stageRenderOrchestratorInstance = (w().PartyGameStageRenderOrchestrator as unknown as { createOrchestrator: (o: Dict) => Dict }).createOrchestrator({
      applyStageState,
      cancelStageWipe,
      clearPresentationClickPrompt: () => setPresentationClickPromptForAction(false, { instant: true }),
      clearStageAudioPlayers,
      completeFlowAction,
      prepareNewStageAction,
      runStageAction,
      runStageWipe,
      scheduleSubActions,
      showRuntimeFault,
      showStageDecisionHalt
    });
  }
  return stageRenderOrchestratorInstance;
}

function stageCountdownPopupController(): StageCountdownPopupController {
  if (!stageCountdownPopupControllerInstance) {
    stageCountdownPopupControllerInstance = new StageCountdownPopupController({
      resolveEntity: () => {
        const definition = stageWidgetArtDefinition("countdownPopup");
        const elementId = String(definition?.layoutElementId || "");
        const entityForElementId = w().stageLayoutEntityForElementId;
        if (!elementId || typeof entityForElementId !== "function") return null;
        return entityForElementId(elementId, w().startPopup);
      }
    });
  }
  return stageCountdownPopupControllerInstance;
}

function currentRenderedActionKey(): string {
  return ((stageRenderOrchestrator() as { actionKey?: () => string } | null)?.actionKey?.() as string) || "";
}

function flowActionCommand(spec: Dict): Dict {
  const activeAction = ((w().currentStageState as Dict | null)?.action as Dict) || null;
  return {
    ...spec,
    commandSource: "flow-action",
    sourceActionId: spec.id || activeAction?.id || ""
  };
}

let votingCardVisualRenderer: Dict | null = null;

function votingCardRenderer(): Dict | null {
  if (!votingCardVisualRenderer && w().votingCardLayer && w().PartyGameVotingCardVisuals) {
    votingCardVisualRenderer = (w().PartyGameVotingCardVisuals as unknown as { createRenderer: (o: Dict) => Dict }).createRenderer({
      layer: w().votingCardLayer, visualAnimation: visualAnimation(), avatarClass: w().avatarClass, avatarFrameImage: w().avatarFrameImage, dinoIcon: w().dinoIcon, playerAvatarArt: w().playerAvatarArt,
      gameObjectApi: w().PartyGameGameObject || w().PartyGameStageGameObject, getComposition: (id: string) => artComposition(id)
    });
  }
  return votingCardVisualRenderer;
}

function clearVotingCardVisuals(options: Dict = {}): void {
  (votingCardRenderer() as { clear?: (o: Dict) => void } | null)?.clear?.(options);
}

function setPlayerAnswerBubblesShownForAction(isShown: boolean, options: Dict = {}): Promise<void> {
  return new Promise((resolve, reject) => {
    const renderer = playerRosterRenderer() as { setAnswerBubblesShown?: (s: boolean, o: Dict) => number } | null;
    if (!renderer?.setAnswerBubblesShown) {
      reject(new Error("Player answer bubble renderer unavailable"));
      return;
    }
    renderer.setAnswerBubblesShown(isShown, { ...options, complete: resolve });
  });
}

function revealPlayerAnswerCorrectnessForAction(action: Dict): Promise<void> {
  return new Promise((resolve, reject) => {
    const renderer = playerRosterRenderer() as { revealAnswerCorrectness?: (o: Dict) => number } | null;
    if (!renderer?.revealAnswerCorrectness) {
      reject(new Error("Player answer bubble renderer unavailable"));
      return;
    }
    renderer.revealAnswerCorrectness({
      instant: action.instant === true,
      answerCorrectness: action.answerCorrectness,
      complete: resolve
    });
  });
}

function renderStagePlayers(players: Dict[], options: Dict = {}): void {
  (playerRosterRenderer() as { render?: (p: Dict[], o?: Dict) => void } | null)?.render?.(players, options);
}

function setPlayersShownForAction(action: Dict): Promise<void> {
  return new Promise((resolve, reject) => {
    const renderer = playerRosterRenderer() as { setShown?: (s: boolean, o: Dict) => number } | null;
    if (!renderer?.setShown) {
      reject(new Error("Player roster renderer unavailable"));
      return;
    }
    renderer.setShown(action?.isShown !== false, { instant: action?.instant === true, complete: resolve });
  });
}

function renderPointPopups(popups: Dict[] = [], options: Dict = {}): void {
  (playerRosterRenderer() as { renderPointPopups?: (p: Dict[], o?: Dict) => void } | null)?.renderPointPopups?.(popups, options);
}

function showPointPopupsForAction(_action: Dict): void {
  (playerRosterRenderer() as { showPointPopupsForAction?: () => void } | null)?.showPointPopupsForAction?.();
}

function votingCardRenderOptions(lobby: Dict): Dict {
  const action = (lobby?.action as Dict) || null;
  const visitId = Number(lobby?.momentVisitId || 0);
  const actionOptions = action && ["setVotingCardsShown", "revealVotingResults", "revealAuthors", "revealVotes", "revealWinningAnswer"].includes(String(action.type || ""))
    ? { actionId: action.id || "", actionType: action.type || "", isShown: action.isShown !== false, cardFilter: action.cardFilter || "all" }
    : {};
  return { ...actionOptions, visitId };
}

function renderVotingCards(cards: Dict[] = [], options: Dict = {}): void {
  (votingCardRenderer() as { render?: (c: Dict[], o: Dict) => void } | null)?.render?.(cards, options);
}

function runVotingCardActionForAction(action: Dict): Promise<void> {
  const renderer = votingCardRenderer() as { runAction?: (a: Dict) => Promise<void> } | null;
  return renderer?.runAction?.(action) || Promise.reject(new Error("Voting card renderer unavailable"));
}

function reloadStageArtAssets(stageCode = "", failClosed = false): Promise<void> {
  return w().loadArtAssets!({ stageCode }).then(() => {
    if (w().currentStageState) renderStageLobby(w().currentStageState as Dict, { force: true });
  }).catch((error) => {
    if (failClosed) throw error;
  });
}

function invokeLayoutActionWithCompletion(
  invoke: (options: Dict) => Dict,
  options: Dict = {}
): Promise<Dict> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result: Dict) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };
    let result: Dict = {};
    result = invoke({ ...options, complete: () => finish(result) });
    if (result?.missing) finish(result);
  });
}

async function setStageLayoutGameObjectShownForStageAction(action: Dict): Promise<void> {
  const showGameObject = w().setStageLayoutGameObjectShownForAction || w().setStageLayoutArtElementShownForAction;
  if (typeof showGameObject !== "function") throw new Error("Stage game object visibility runtime unavailable");
  const result = await invokeLayoutActionWithCompletion(
    (playOptions) => showGameObject(flowActionCommand(action), playOptions) as Dict,
    { returnResult: true }
  );
  if (result?.missing) throw new Error(String(result.reason || "Stage game object target unavailable"));
}

async function playStageLayoutGameObjectAnimationForStageAction(action: Dict): Promise<void> {
  const playAnimation = w().playStageLayoutGameObjectAnimationForAction;
  if (typeof playAnimation !== "function") throw new Error("Stage game object animation runtime unavailable");
  const result = await invokeLayoutActionWithCompletion(
    (playOptions) => playAnimation(flowActionCommand(action), playOptions) as Dict,
    { returnResult: true }
  );
  if (result?.missing) throw new Error(String(result.reason || "Stage game object target unavailable"));
}

function runStageWipe(onCovered: () => void, complete: () => void): number {
  return ((stageWipeController() as { transition?: (covered: () => void, done: () => void) => number } | null)?.transition?.(onCovered, complete) as number) || 0;
}

function cancelStageWipe(): void {
  (stageWipeController() as { cancel?: () => void } | null)?.cancel?.();
}

function initStageTextObjects(): void {
  stageTextController()?.init();
}

function clearStageObjectTimers(): void {
  stageSubActionScheduler.clear();
  for (const timerId of w().textObjectTimers) clearTimeout(timerId);
  w().textObjectTimers = [];
}

function clearStageActionTimers(): void {
  if (w().actionTimingTimer !== null) clearTimeout(w().actionTimingTimer!);
  w().actionTimingTimer = null;
}

function clearStageCountdownTimer(): void {
  if (w().stageCountdownTimer !== null) clearInterval(w().stageCountdownTimer!);
  w().stageCountdownTimer = null;
}

function clearStageAudioPlayers(): void {
  for (const audio of w().stageAudioPlayers) {
    audio.stageInterrupted = true;
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
  }
  w().stageAudioPlayers.clear();
}

function clearCraftingTimerVisibilityRequest(actionKey = ""): void {
  (craftingTimerController() as { clearRequest?: (k: string) => void } | null)?.clearRequest?.(actionKey);
}

function clearStageWipeVisibilityRequest(actionKey = ""): void {
  (stageWipeController() as { clearRequest?: (k: string) => void } | null)?.clearRequest?.(actionKey);
}

async function setCraftingTimerShownForAction(action: Dict, options: Dict = {}): Promise<void> {
  const controller = craftingTimerController() as { prepareShownForAction?: (a: Dict, o: Dict) => number } | null;
  if (!controller?.prepareShownForAction) throw new Error("Crafting timer data runtime unavailable");
  const definition = stageWidgetArtDefinition("craftingTimer");
  const targetLayoutElementId = String(definition?.layoutElementId || "");
  if (!targetLayoutElementId) throw new Error("Crafting timer layout target unavailable");
  controller.prepareShownForAction(action, options);
  await setStageLayoutGameObjectShownForStageAction({
    ...action,
    targetLayoutElementId,
    targetLayoutScope: "moment",
    targetLayoutSurface: "stage"
  });
}

function setStageWipeShownForAction(action: Dict, options: Dict = {}): Promise<void> {
  return new Promise((resolve, reject) => {
    const controller = stageWipeController() as { setShownForAction?: (a: Dict, o: Dict) => number } | null;
    if (!controller?.setShownForAction) {
      reject(new Error("Stage wipe widget unavailable"));
      return;
    }
    controller.setShownForAction(action, { ...options, complete: resolve });
  });
}

function resetStageObjects(options: Dict = {}): void {
  clearStageObjectTimers();
  if (options.clearActionTimers === true) clearStageActionTimers();
  if (options.clearCountdownTimer === true) clearStageCountdownTimer();
  if (options.resetWipe === true) cancelStageWipe();
  clearStageAudioPlayers();
  (craftingTimerController() as { reset?: () => void } | null)?.reset?.();
  (playerRosterRenderer() as { resetAnswerBubbles?: () => void } | null)?.resetAnswerBubbles?.();
  (playerRosterRenderer() as { clearPointPopups?: () => void } | null)?.clearPointPopups?.();
  clearVotingCardVisuals({ instant: true });
  initStageTextObjects();
}

async function startCurrentMomentForAction(_action: Dict, options: Dict = {}): Promise<void> {
  const actionKey = String(options.actionKey || "");
  await Promise.all([
    w().loadArtAssets!(),
    w().loadStageLayouts!({ forceServer: true })
  ]);
  if (actionKey && currentRenderedActionKey() !== actionKey) return;
  const state = w().currentStageState as Dict | null;
  if (!state) throw new Error("Current moment state unavailable");
  applyStageState(state, { initializeMomentText: true });
  w().initializeStageMomentLayout?.();
  const readiness = w().stageMomentLayoutReadiness?.() || { ready: true, missingElementIds: [] };
  if (readiness.ready === false) {
    throw new Error(`Moment elements unavailable: ${((readiness.missingElementIds as string[]) || []).join(", ")}`);
  }
}

async function endCurrentMomentForAction(_action: Dict, options: Dict = {}): Promise<void> {
  const actionKey = String(options.actionKey || "");
  if (actionKey && currentRenderedActionKey() !== actionKey) return;
  setPresentationClickPromptForAction(false, { instant: true });
  clearStageAudioPlayers();
  (craftingTimerController() as { reset?: () => void } | null)?.reset?.();
  (playerRosterRenderer() as { resetAnswerBubbles?: () => void; clearPointPopups?: () => void } | null)?.resetAnswerBubbles?.();
  (playerRosterRenderer() as { clearPointPopups?: () => void } | null)?.clearPointPopups?.();
  clearVotingCardVisuals({ instant: true });
  w().resetStageMomentLayout?.();
  initStageTextObjects();
}

function hardResetStageToLobby(): void {
  w().pausedCompletionRequest = null;
  w().presentationAdvancePending = false;
  setPresentationClickPromptForAction(false, { instant: true });
  // Quit bypasses the authored End Moment action, so perform the same visual
  // teardown before the lobby's Start Moment begins constructing its objects.
  w().resetStageMomentLayout?.();
  stageManagedTextSources.reset();
  resetStageObjects({ clearActionTimers: true, clearCountdownTimer: true, resetWipe: true });
}

function isPresentedTextAction(action: Dict | null): boolean {
  return Boolean(action && ["present", "presentText"].includes(action.type as string));
}

function setStageTextObjectForAction(target: unknown, options: Dict = {}): Promise<void> {
  const targetId = w().normalizeTextTargetId!(target);
  const layoutText = w().PartyGameLayoutText as { setStageText?: (t: string, v: unknown) => void } | undefined;
  if (Object.prototype.hasOwnProperty.call(options, "text") && typeof layoutText?.setStageText === "function") {
    layoutText.setStageText(targetId, options.text ?? "");
  }
  if (typeof w().setStageLayoutGameObjectShownForAction === "function") {
    return setStageLayoutGameObjectShownForStageAction(flowActionCommand({
      targetLayoutElementId: targetId,
      targetLayoutScope: "moment",
      targetLayoutSurface: "stage",
      isShown: options.isShown !== false,
      instant: options.instant === true
    }));
  }
  return new Promise((resolve) => {
    const controller = stageTextController();
    if (!controller?.set) {
      return;
    }
    controller.set(target, { ...options, complete: resolve });
  });
}

function renderCraftingTimer(timer: Dict, options: Dict = {}): number {
  return ((craftingTimerController() as { render?: (t: Dict, o: Dict) => number } | null)?.render?.(timer, options) as number) || 0;
}

const stageWidgetHosts: Record<string, () => El | null> = {
  stageCodePanel: () => w().stageCodeText.closest(".stage-code-panel") as El | null,
  stageCodeWidget: () => w().stageCodeBadgeRoot,
  joinQr: () => w().stageJoinQr,
  joinWidget: () => w().joinPrompt,
  waitingStatus: () => w().waitingStatus,
  countdownPopup: () => w().startPopup,
  craftingTimer: () => w().craftingTimer,
  stageWipe: () => w().stageWipe,
  presentationClickPrompt: () => w().presentClickWidget
};

function stageCodeValue(fallback = ""): string {
  const stateValue = String((w().currentStageState as Dict)?.stageCode || "").trim();
  if (stateValue) return stateValue;
  const storedValue = String(w().stageCodeText?.dataset?.stageCodeValue || w().stageCodeBadge?.dataset?.stageCodeValue || "").trim();
  if (storedValue) return storedValue;
  return w().normalizeStageCode!(String(fallback || "")) || "----";
}

function renderStageRuntimeTextBox(target: El | null, value: unknown, spec: Dict = {}, options: Dict = {}): unknown {
  if (!target) return null;
  const text = String(value ?? "");
  const width = Math.max(1, Number(spec.width || target.clientWidth || target.offsetWidth || 1));
  const height = Math.max(1, Number(spec.height || target.clientHeight || target.offsetHeight || 1));
  const fontSize = Math.max(1, Number(spec.fontSize || Number.parseFloat(w().getComputedStyle?.(target)?.fontSize as string) || 24));
  const textFit = w().PartyGameTextFit as { renderRuntimeText?: (t: El, text: string, spec: Dict, o: Dict) => unknown } | undefined;
  if (typeof textFit?.renderRuntimeText === "function") {
    return textFit.renderRuntimeText(target, text, { width, height, fontSize, fontColor: spec.fontColor, autoFitText: spec.autoFitText !== false, applySize: spec.applySize === true }, {
      autoFit: spec.autoFitText !== false, minSize: Number(options.minSize || 6), lineHeight: Number(options.lineHeight || 1.05), ...options
    });
  }
  target.textContent = text;
  return null;
}

function setFallbackStageText(target: El | null, value: unknown, spec: Dict = {}, options: Dict = {}): void {
  if (!target) return;
  const text = String(value ?? "");
  target.dataset.textFitSource = text;
  renderStageRuntimeTextBox(target, text, spec, options);
}

function setStageCodeDisplays(stageCode: unknown): void {
  const cleanCode = w().normalizeStageCode!(stageCode);
  if (!cleanCode) return;
  w().stageCodeText.dataset.stageCodeValue = cleanCode;
  w().stageCodeBadge.dataset.stageCodeValue = cleanCode;
  const panelHost = stageWidgetHosts.stageCodePanel?.();
  const layoutText = w().PartyGameLayoutText as { setStageText?: (t: unknown, v: unknown) => void } | undefined;
  if (!panelHost?.classList?.contains("has-stage-widget-art")) {
    if (typeof layoutText?.setStageText === "function") {
      layoutText.setStageText(w().stageCodeText, cleanCode);
    } else {
      setFallbackStageText(w().stageCodeText, cleanCode, { width: w().stageCodeText.clientWidth || 760, height: w().stageCodeText.clientHeight || 140, fontSize: 112, autoFitText: true }, { maxSize: 112, minSize: 18, lineHeight: 0.92 });
    }
  }
  if (typeof layoutText?.setStageText === "function") {
    layoutText.setStageText(w().stageCodeBadge, cleanCode);
  } else {
    setFallbackStageText(w().stageCodeBadge, cleanCode, { width: w().stageCodeBadge.clientWidth || 190, height: w().stageCodeBadge.clientHeight || 72, fontSize: 48, autoFitText: true }, { maxSize: 48, minSize: 10, lineHeight: 0.95 });
  }
}

function setStageManagedText(target: El | string | null, value: unknown): void {
  if (!target) return;
  const layoutText = w().PartyGameLayoutText as { setStageText?: (t: unknown, v: unknown) => void } | undefined;
  if (typeof target === "string") {
    layoutText?.setStageText?.(target, value);
    return;
  }
  if (typeof layoutText?.setStageText === "function") {
    layoutText.setStageText(target, value);
  } else {
    setFallbackStageText(target, value, { width: target.clientWidth || target.offsetWidth || 800, height: target.clientHeight || target.offsetHeight || 120, fontSize: Number.parseFloat(w().getComputedStyle?.(target)?.fontSize as string) || 54, autoFitText: true }, { minSize: 8, lineHeight: 1.02 });
  }
}

function reconcileStageManagedText(lobby: Dict, liveGameTitle: unknown, options: Dict = {}): void {
  const sources: StageManagedTextSource[] = [
    { target: "stageTitle", value: liveGameTitle },
    { target: "stageIntroTitle", value: "GAME INTRO" }
  ];
  if (lobby.phase === "crafting-game-state") {
    sources.push({ target: CRAFTING_TRIVIA_PROMPT_TEXT_ID, value: lobby.triviaPromptText || "" });
  }
  for (const source of stageManagedTextSources.reconcile(lobby, sources, {
    force: options.initializeMomentText === true
  })) {
    setStageManagedText(source.target, source.value);
  }
}

const stageWidgetTextOverrides: Record<string, (context: Dict) => Dict> = {
  stageCodePanel: (context) => ({ "panel-code": stageCodeValue(context.stageCode as string) }),
  stageCodeWidget: (context) => ({ "badge-code": stageCodeValue(context.stageCode as string) }),
  joinWidget: () => ({}),
  waitingStatus: (context) => ({ "status-text": context.text || w().waitingStatus.dataset.statusText || "" }),
  countdownPopup: (context) => ({ "popup-text": (context.seconds as number) > 0 ? `Starting in ${context.seconds}` : "Let's Go" }),
  craftingTimer: (context) => ({ "timer-value": (context.label as string) || String(Math.ceil(Number((context.timer as Dict)?.remainingMs || (context.timer as Dict)?.durationMs || 30000) / 1000)) })
};

function stageWidgetArtDefinition(widgetId: string): Dict | null {
  return (w().PartyGameStageWidgetBindings as { definition?: (id: string) => Dict | null } | undefined)?.definition?.(widgetId) || null;
}

function renderStageWidgetBinding(bindingId: string, context: Dict = {}): Dict | null {
  const definition = stageWidgetArtDefinition(bindingId);
  const binding = {
    compositionId: definition?.compositionId,
    host: stageWidgetHosts[bindingId],
    textOverrides: stageWidgetTextOverrides[bindingId],
    overlays: definition?.overlayComponentId ? [{ componentId: definition.overlayComponentId, element: () => w().stageJoinQrCanvas }] : []
  };
  if (!binding?.compositionId) return null;
  const host = binding.host?.();
  if (!host) return null;
  const result = ((stageWidgetArtRenderer() as { renderBound?: (h: El, b: Dict, c: Dict) => Dict } | null)?.renderBound?.(host, binding, context) as Dict) || null;
  registerRenderedStageWidgetEntity(definition, host, result);
  return result;
}

function setPresentationClickPromptForAction(isShown: boolean, options: Dict = {}): void {
  const definition = stageWidgetArtDefinition("presentationClickPrompt");
  const targetLayoutElementId = String(definition?.layoutElementId || "");
  if (!targetLayoutElementId || typeof w().setStageLayoutGameObjectShownForAction !== "function") return;
  w().setStageLayoutGameObjectShownForAction!(
    flowActionCommand({
      targetLayoutElementId,
      targetLayoutScope: "global",
      targetLayoutSurface: "stage",
      isShown: isShown !== false,
      instant: options.instant === true
    }),
    { returnResult: true }
  );
}

function registerRenderedStageWidgetEntity(definition: Dict | null, host: El, renderResult: Dict | null): void {
  const elementId = (definition?.layoutElementId as string) || host?.dataset?.stageLayoutElementId || "";
  const renderer = renderResult?.renderer || null;
  if (!elementId || !renderer || typeof w().stageLayoutEntityForElementId !== "function") return;
  const entity = w().stageLayoutEntityForElementId!(elementId, host);
  if (typeof entity?.update === "function") {
    (entity.update as (o: Dict) => void).call(entity, { artRenderer: renderer, syncArtRendererOnShow: true });
  }
  const isNewRenderer = initializedStageWidgetEntityRenderers.get(host) !== renderer;
  initializedStageWidgetEntityRenderers.set(host, renderer);
  if (isNewRenderer && typeof entity?.applyVisibilityState === "function") {
    (entity.applyVisibilityState as () => void).call(entity);
  }
}

function renderStageActionDebug(lobby: Dict): void {
  (stageDebugPanel() as { renderAction?: (l: Dict) => void } | null)?.renderAction?.(lobby);
}

function clearStageDecisionDebug(lobby: Dict): void {
  (stageDebugPanel() as { clearDecisionAlert?: (l: Dict) => void } | null)?.clearDecisionAlert?.(lobby);
}

function showStageDecisionHalt(lobby: Dict): void {
  (stageDebugPanel() as { showDecisionHalt?: (l: Dict) => void } | null)?.showDecisionHalt?.(lobby);
}

function showRuntimeFault(lobby: Dict): void {
  (stageDebugPanel() as { showRuntimeFault?: (l: Dict) => void } | null)?.showRuntimeFault?.(lobby);
}

function controllerJoinUrlForStage(stageCode: unknown): string {
  const url = new URL("/controller", location.origin);
  url.searchParams.set("stage", w().normalizeStageCode!(stageCode));
  return url.toString();
}

function renderStageJoinQr(stageCode: unknown, isVisible = true): void {
  if (!w().stageJoinQr || !w().stageJoinQrCanvas) return;
  const normalizedCode = w().normalizeStageCode!(stageCode);
  const shouldShow = isVisible && Boolean(normalizedCode);
  if (!shouldShow) return;
  const joinUrl = controllerJoinUrlForStage(normalizedCode);
  renderStageWidgetBinding("joinQr");
  if (renderedStageJoinQrUrl === joinUrl) return;
  renderedStageJoinQrUrl = joinUrl;
  try {
    (w().PartyGameQrCode as { renderCanvas: (c: HTMLCanvasElement, url: string, o: Dict) => void } | undefined)?.renderCanvas(w().stageJoinQrCanvas, joinUrl, { background: "#fff8d6", foreground: "#17131f", size: 220 });
  } catch {
    renderedStageJoinQrUrl = "";
  }
}

function setStageWaitingStatus(message: unknown, isVisible = true): void {
  if (!w().waitingStatus) return;
  const cleanMessage = String(message || "");
  w().waitingStatus.dataset.statusText = cleanMessage;
  const layoutText = w().PartyGameLayoutText as { setStageText?: (t: unknown, v: unknown) => void } | undefined;
  if (!w().waitingStatus.classList.contains("has-stage-widget-art")) {
    if (typeof layoutText?.setStageText === "function") {
      layoutText.setStageText(w().waitingStatus, cleanMessage);
    } else {
      setFallbackStageText(w().waitingStatus, cleanMessage, { width: w().waitingStatus.clientWidth || 440, height: w().waitingStatus.clientHeight || 58, fontSize: 26, autoFitText: true }, { maxSize: 26, minSize: 8, lineHeight: 1 });
    }
  }
  renderStageWidgetBinding("waitingStatus", { text: cleanMessage });
  void isVisible;
}

function applyStageState(lobby: Dict, options: Dict = {}): void {
  const wasPaused = w().isStagePaused;
  w().currentStageState = lobby;
  const players = (lobby.players as Dict[]) || [];
  const phase = (lobby.phase as string) || "lobby";
  const isLobbyPhase = phase === "lobby" || phase === "starting";
  if (w().stageCountdownTimer !== null) clearInterval(w().stageCountdownTimer!);
  w().stageCountdownTimer = null;
  stageCountdownPopupController().beforePhase(phase);
  const liveGameTitle = lobby.gameTitle || (w().gameConstants as Dict).gameTitle || "Party Game Template";
  document.title = liveGameTitle as string;
  renderStageActionDebug(lobby);
  setStageCodeDisplays(lobby.stageCode || stageCodeValue());
  w().applyStageLayoutForPhase!(phase);
  reconcileStageManagedText(lobby, liveGameTitle, options);
  renderStageWidgetBinding("stageCodePanel", { stageCode: stageCodeValue(lobby.stageCode as string) });
  renderStageWidgetBinding("stageCodeWidget", { stageCode: stageCodeValue(lobby.stageCode as string) });
  renderStageJoinQr(stageCodeValue(lobby.stageCode as string), isLobbyPhase);
  w().stageMain.classList.remove("hidden");
  w().stageFooter.classList.remove("hidden");
  w().stageIntroContent.classList.remove("hidden");
  renderStageWidgetBinding("presentationClickPrompt");
  clearStageDecisionDebug(lobby);
  renderStagePlayers(players, {
    // Voice capture owns a live answer preview: the temporary T and the final
    // transcript update the current Player Answer Bubble MC while this input is active.
    liveAnswerPreviewEnabled: String((lobby.textInput as Dict | null)?.type || "") === "voice"
  });
  renderPointPopups((lobby.pendingPointPopups as Dict[]) || [], { deferAnimation: true });
  renderVotingCards((lobby.votingCards as Dict[]) || [], votingCardRenderOptions(lobby));
  renderCraftingTimer(lobby.craftingTimer as Dict, {
    deferVisibility: true
  });
  setStagePaused(lobby.isPaused === true, { localOnly: true });
  if (wasPaused && lobby.isPaused !== true && w().pausedCompletionRequest) {
    const pending = w().pausedCompletionRequest as Dict;
    w().pausedCompletionRequest = null;
    setTimeout(() => {
      if ((w().currentStageState as Dict)?.action && ((w().currentStageState as Dict).action as Dict)?.id === pending.actionId) {
        completeFlowAction(pending.source as string, pending.actionId as string);
      }
    }, 0);
  }

  const vip = players.find((player) => player.isVip);
  renderStageWidgetBinding("joinWidget");
  setStageWaitingStatus(vip ? `Waiting for ${vip.name} to start the game` : "", phase !== "intro" && players.length > 0);

  if (phase === "starting") {
    w().countdownClockOffset = (Number(lobby.serverNow) || Date.now()) - Date.now();
    setStageWaitingStatus("Tap CANCEL to stop", true);
    const updateCountdown = () => {
      const now = Date.now() + w().countdownClockOffset;
      const remainingMs = Math.max(0, (Number(lobby.countdownEndsAt) || now) - now);
      const seconds = Math.ceil(remainingMs / 1000);
      renderStageWidgetBinding("countdownPopup", { seconds });
      stageCountdownPopupController().afterPhase(phase);
      stageCountdownPopupController().update(seconds);
    };
    updateCountdown();
    w().stageCountdownTimer = setInterval(updateCountdown, 100) as unknown as number;
  } else {
    stageCountdownPopupController().afterPhase(phase);
  }
}

function renderStageLobby(lobby: Dict, options: Dict = {}): void {
  (stageRenderOrchestrator() as { render?: (l: Dict, o?: Dict) => void } | null)?.render?.(lobby, options);
}

function prepareNewStageAction(lobby: Dict, actionKey: string): void {
  stageSubActionScheduler.enterGameSession(lobby.gameSessionId);
  clearStageActionTimers();
  clearCraftingTimerVisibilityRequest(actionKey);
  clearStageWipeVisibilityRequest(actionKey);
  scheduleActionTiming(lobby, actionKey);
}

function scheduleActionTiming(lobby: Dict, actionKey: string): void {
  if (w().actionTimingTimer !== null) clearTimeout(w().actionTimingTimer!);
  w().actionTimingTimer = null;
  const action = lobby.action as Dict;
  if (!action || action.trigger || (action.timing as Dict)?.mode !== "S+") return;
  const delayMs = Math.max(0, Number((action.timing as Dict).seconds || 0) * 1000);
  w().actionTimingTimer = setTimeout(() => {
    if (currentRenderedActionKey() !== actionKey) return;
    completeFlowAction("startTimer", action.id as string);
  }, delayMs) as unknown as number;
}

function scheduleSubActions(action: Dict, actionKey: string): void {
  stageSubActionScheduler.schedule(
    action,
    actionKey,
    Number((w().currentStageState as Dict | null)?.gameSessionId || 0)
  );
}

function playStageAudioAction(action: Dict, isPrimary: boolean, actionKey: string): void {
  const audioUrl = String(action.audioUrl || "").trim();
  // An E+ audio action may advance only from this exact Audio element's
  // authored completion event. Missing or failed audio therefore fails closed.
  // S+ remains fire-and-forget; its separate start-relative timer owns flow.
  if (!audioUrl) return;
  const audio = new Audio(audioUrl) as AudioEl;
  audio.stageInterrupted = false;
  w().stageAudioPlayers.add(audio);
  const cleanup = () => {
    w().stageAudioPlayers.delete(audio);
    audio.removeEventListener("ended", finish);
    audio.removeEventListener("error", fail);
  };
  const finish = () => {
    const wasInterrupted = audio.stageInterrupted === true;
    cleanup();
    if (!wasInterrupted && isPrimary && currentRenderedActionKey() === actionKey && (action.timing as Dict)?.mode !== "S+") {
      completeFlowAction("callback", action.id as string);
    }
  };
  const fail = () => cleanup();
  audio.addEventListener("ended", finish);
  audio.addEventListener("error", fail);
  audio.play().catch(fail);
}

let stageActionRunner: Dict | null = null;

function getStageActionRunner(): Dict | null {
  if (!stageActionRunner && w().PartyGameStageActionRunners) {
    stageActionRunner = (w().PartyGameStageActionRunners as unknown as { createRunner: (o: Dict) => Dict }).createRunner({
      completeFlowAction, endCurrentMomentForAction, isCurrentActionKey: (actionKey: string) => currentRenderedActionKey() === actionKey, playStageAudioAction, revealPlayerAnswerCorrectnessForAction, startCurrentMomentForAction,
      playStageLayoutGameObjectAnimationForAction: playStageLayoutGameObjectAnimationForStageAction, runStageWipe, runVotingCardActionForAction, setCraftingTimerShownForAction, setStageLayoutGameObjectShownForAction: setStageLayoutGameObjectShownForStageAction, setPlayerAnswerBubblesShownForAction, setPlayersShownForAction, setPresentationClickPromptForAction, setStageWipeShownForAction, setStageTextObjectForAction, showPointPopupsForAction
    });
  }
  return stageActionRunner;
}

function runStageAction(action: Dict | null, isPrimary: boolean, actionKey: string): void {
  if (!action) return;
  if (isPrimary) scheduleSubActions(action, actionKey);
  (getStageActionRunner() as { run?: (a: Dict, o: Dict) => void } | null)?.run?.(action, { isPrimary, actionKey });
}

async function pollLobby(stageCode: string): Promise<void> {
  try {
    const result = (await w().getJson!(`/api/stage/${stageCode}/lobby`)) as Dict;
    renderStageLobby(result.lobby as Dict);
  } catch {
    setStageWaitingStatus("Reconnecting to lobby", true);
  }
}

async function emitStageInputEvent(eventType: string, actionId: string = ((w().currentStageState as Dict)?.action as Dict)?.id as string || ""): Promise<Dict | null> {
  const state = w().currentStageState as Dict | null;
  if (!state?.stageCode || !eventType) return null;
  const result = (await w().postJson!("/api/input-event", { stageCode: state.stageCode, actionId, eventType })) as Dict;
  if (result.lobby) renderStageLobby(result.lobby as Dict);
  return result;
}

async function handleStageScreenClick(): Promise<void> {
  if (w().isStagePaused) return;
  if (w().presentationAdvancePending) return;
  const state = w().currentStageState as Dict | null;
  if (!isPresentedTextAction((state?.action as Dict) || null)) return;
  w().presentationAdvancePending = true;
  const action = state!.action as Dict;
  const target = action.textTarget || "presentation";
  try {
    setPresentationClickPromptForAction(false, { instant: action.instant === true });
    await setStageTextObjectForAction(target, { isShown: false, instant: action.instant === true });
    await emitStageInputEvent("stageClick", action.id as string);
  } catch {
    // Keep the current presented text on screen if the click cannot be saved.
  } finally {
    w().presentationAdvancePending = false;
  }
}

async function completeFlowAction(source = "callback", actionId: string = ((w().currentStageState as Dict)?.action as Dict)?.id as string || ""): Promise<void> {
  const state = w().currentStageState as Dict | null;
  if (!state?.stageCode) return;
  if (state?.isPaused === true) {
    w().pausedCompletionRequest = { source, actionId };
    return;
  }
  try {
    const result = (await w().postJson!("/api/complete-action", { stageCode: state.stageCode, actionId, source })) as Dict;
    if (result.lobby) renderStageLobby(result.lobby as Dict);
  } catch (error) {
    if ((error as Error).message === "Game is paused") {
      w().pausedCompletionRequest = { source, actionId };
      return;
    }
    setStageWaitingStatus((error as Error).message, true);
  }
}

function currentStageCodeForRuntimeTest(): string {
  return stageCodeValue();
}

async function applyRuntimeTestMessage(message: Dict): Promise<void> {
  if (!message || message.type !== "runtime-test-config") return;
  if (message.clearArtCompositions) {
    await w().loadArtAssets!().catch(() => w().artCompositions);
  } else if (message.artCompositions) {
    w().artCompositions = typeof w().mergeArtCompositionDrafts === "function" ? w().mergeArtCompositionDrafts!(message.artCompositions as Dict[]) : (message.artCompositions as Dict[]);
  }
  if (message.clearLayouts) {
    w().runtimeTestLayouts = null;
    await w().loadStageLayouts!({ forceServer: true }).catch(() => w().stageLayouts);
  } else if (message.layouts) {
    w().runtimeTestLayouts = message.layouts as never;
    w().stageLayouts = w().runtimeTestLayouts as never;
  }
  if (w().currentStageState) w().applyStageLayoutForPhase!((w().currentStageState as Dict).phase as string);
  const stageCode = currentStageCodeForRuntimeTest();
  if (!stageCode || (!message.flow && !message.clearFlow)) return;
  try {
    const result = (await w().postJson!(`/api/stage/${stageCode}/test-config`, { flow: message.flow || null, clearFlow: message.clearFlow === true })) as Dict;
    if (result.lobby) renderStageLobby(result.lobby as Dict);
  } catch (error) {
    setStageWaitingStatus((error as Error).message, true);
  }
}

async function applyControllerRuntimeTestMessage(message: Dict): Promise<void> {
  if (!message || message.type !== "runtime-test-config") return;
  if (message.clearArtCompositions) {
    await w().loadArtAssets!().catch(() => w().artCompositions);
  } else if (message.artCompositions) {
    w().artCompositions = typeof w().mergeArtCompositionDrafts === "function" ? w().mergeArtCompositionDrafts!(message.artCompositions as Dict[]) : (message.artCompositions as Dict[]);
  }
  if (message.clearControllerLayouts) {
    w().runtimeTestControllerLayouts = null;
    await (w().loadControllerLayouts as unknown as (o?: { forceServer?: boolean }) => Promise<Dict>)({ forceServer: true }).catch(() => w().controllerLayouts);
  } else if (message.controllerLayouts) {
    w().runtimeTestControllerLayouts = message.controllerLayouts as never;
    w().controllerLayouts = w().runtimeTestControllerLayouts as never;
  }
  const controllerState = w().controllerState as Dict | null;
  w().applyControllerLayoutForPhase!(controllerState ? (controllerState.phase as string) || "lobby" : "join");
}

function setStagePaused(isPaused: boolean, _options: Dict = {}): void {
  w().isStagePaused = isPaused;
  w().pauseMenu.classList.toggle("hidden", !isPaused);
}

async function requestStagePaused(isPaused: boolean): Promise<void> {
  const state = w().currentStageState as Dict | null;
  if (!state?.stageCode) {
    setStagePaused(isPaused);
    return;
  }
  try {
    const result = (await w().postJson!("/api/pause", { stageCode: state.stageCode, isPaused })) as Dict;
    if (result.lobby) renderStageLobby(result.lobby as Dict);
  } catch (error) {
    setStageWaitingStatus((error as Error).message, true);
  }
}

async function quitStageToLobby(): Promise<void> {
  const state = w().currentStageState as Dict | null;
  if (!state?.stageCode) return;
  hardResetStageToLobby();
  setStagePaused(false);
  try {
    const result = (await w().postJson!("/api/quit-to-lobby", { stageCode: state.stageCode })) as Dict;
    if (result.lobby) renderStageLobby(result.lobby as Dict);
  } catch (error) {
    setStageWaitingStatus((error as Error).message, true);
  }
}

async function subscribeToStage(stageCode: string): Promise<void> {
  if (!w().canUseServer) {
    setStageWaitingStatus("Open through the server to host a lobby", true);
    return;
  }
  if (!("EventSource" in window)) {
    pollLobby(stageCode);
    w().lobbyPollTimer = setInterval(() => pollLobby(stageCode), 1000) as unknown as number;
    return;
  }
  let ticket: string;
  try {
    const result = (await w().postJson!(`/api/stage/${stageCode}/event-ticket`, {})) as Dict;
    ticket = String(result.ticket || "");
  } catch (_error) {
    setStageWaitingStatus("Could not authorize stage events", true);
    window.setTimeout(() => subscribeToStage(stageCode), 1000);
    return;
  }
  const streamUrl = new URL(`${location.origin}/api/stage/${stageCode}/events`);
  if (ticket) streamUrl.searchParams.set("ticket", ticket);
  const stream = new EventSource(streamUrl.toString());
  stream.addEventListener("lobby", (event) => renderStageLobby(JSON.parse((event as MessageEvent).data)));
  stream.addEventListener("artAssetsChanged", () => reloadStageArtAssets());
  stream.addEventListener("error", () => {
    stream.close();
    setStageWaitingStatus("Reconnecting to lobby", true);
    window.setTimeout(() => subscribeToStage(stageCode), 1000);
  });
}

let stageSetupPromise: Promise<void> | null = null;

async function setupStageOnce(): Promise<void> {
  w().stageScreen.classList.remove("hidden");
  initStageTextObjects();
  w().listenForArtAssetsChanged!(reloadStageArtAssets);
  const stageCode = w().getOrCreateStageCode!();
  const isDraftPreview = new URLSearchParams(location.search).get("preview") === "draft";
  let room: Dict;
  if (isDraftPreview) {
    const sessionResponse = await fetch("/api/admin/session", {
      headers: { Accept: "application/json" },
      credentials: "same-origin"
    });
    const session = await sessionResponse.json() as Dict;
    if (!sessionResponse.ok || !session.csrfToken) throw new Error("Administrator authentication is required for draft preview");
    const roomResponse = await fetch("/api/admin/preview-rooms", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-CSRF-Token": String(session.csrfToken),
        ...(w().getSessionValue?.(`partyTemplateStageCapability:${stageCode}`)
          ? { "X-Stage-Capability": w().getSessionValue!(`partyTemplateStageCapability:${stageCode}`) }
          : {})
      },
      credentials: "same-origin",
      body: JSON.stringify({ stageCode })
    });
    room = await roomResponse.json() as Dict;
    if (!roomResponse.ok) throw new Error(String(room.error || "Draft preview room could not be created"));
  } else {
    room = (await w().postJson!("/api/stage/rooms", { stageCode })) as Dict;
  }
  const stageCapability = String(room.stageCapability || "");
  if (stageCapability) w().setSessionValue!(`partyTemplateStageCapability:${stageCode}`, stageCapability);
  setStageCodeDisplays(stageCode);
  await Promise.all([
    reloadStageArtAssets(stageCode, true),
    w().loadStageLayouts!({ stageCode })
  ]);
  if (w().currentStageState) w().applyStageLayoutForPhase!((w().currentStageState as Dict).phase as string);
  renderStageJoinQr(stageCode, true);
  w().runtimeTestChannel?.addEventListener("message", (event: MessageEvent) => {
    applyRuntimeTestMessage(event.data);
  });
  w().stageScreen.addEventListener("click", handleStageScreenClick);
  w().pauseMenu.addEventListener("click", (event) => event.stopPropagation());
  w().returnToGameButton.addEventListener("click", () => requestStagePaused(false));
  w().quitToLobbyButton.addEventListener("click", quitStageToLobby);
  window.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    requestStagePaused(!w().isStagePaused);
  });
  window.addEventListener("resize", () => {
    if (w().currentStageState) w().applyStageLayoutForPhase!((w().currentStageState as Dict).phase as string);
  });
  await subscribeToStage(stageCode);
}

function setupStage(): Promise<void> {
  if (!stageSetupPromise) {
    stageSetupPromise = setupStageOnce().catch((error) => {
      stageSetupPromise = null;
      throw error;
    });
  }
  return stageSetupPromise;
}

// Install the orchestrator entry points + the names other scripts read as globals,
// replicating the classic script.
// applyControllerRuntimeTestMessage ← controller.ts; setupStage ← app-shell dispatch.
Object.assign(w(), {
  setupStage,
  applyControllerRuntimeTestMessage,
  applyRuntimeTestMessage,
  applyStageState,
  renderStageLobby,
  completeFlowAction,
  setStageManagedText,
  setStageWaitingStatus
});

export {};
