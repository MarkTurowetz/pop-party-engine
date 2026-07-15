// Typed port of the legacy client/stage-runtime.js (top-level classic script) — the
// stage orchestrator. Defines setupStage (app-shell dispatches setupStage()),
// setStageTextObject (layout-runtime reads it), applyControllerRuntimeTestMessage
// (controller.ts reads it), and installs window.PartyGameStageDebugRuntime. It reads
// app-shell DOM/state + utils + the now-on-window layout-runtime fns + the ported
// PartyGameStage* via window. All top-level names are installed on window to
// replicate the classic script's globals.

type Dict = Record<string, unknown>;
type El = HTMLElement;
type AudioEl = HTMLAudioElement & { stageInterrupted?: boolean };

interface StageVisualControllersApi {
  createStageTextController: (o: Dict) => { init: () => void; set: (t: unknown, o: Dict) => number };
  createCraftingTimerController: (o: Dict) => Dict;
}

declare global {
  interface Window {
    setupStage?: () => void;
    // layout-runtime functions (installed by layoutRuntime.ts) consumed here.
    normalizeTextTargetId?: (value: unknown) => string;
    applyStageLayoutTextProperties?: (target: El, element: Dict) => void;
    applyStageLayoutForPhase?: (phase: string) => void;
    applyControllerLayoutForPhase?: (phase: string) => void;
    setStageLayoutGameObjectShownForAction?: (action: Dict, options?: Dict) => unknown;
    setStageLayoutArtElementShownForAction?: (action: Dict, options?: Dict) => unknown;
    playStageLayoutGameObjectAnimationForAction?: (action: Dict, options?: Dict) => unknown;
    loadStageLayouts?: (options?: { forceServer?: boolean }) => Promise<Dict>;
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
    subActionTimers: number[];
    textObjectTimers: number[];
    stageAudioPlayers: Set<AudioEl>;
    gameConstants: Dict;
    // app-shell DOM refs (used by the stage orchestrator).
    craftingTimer: El;
    craftingTimerLabel: El;
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
const stageWidgetTimelineRenderers = new Map<string, { playAll?: (animation: string, options?: Dict) => number }>();
const initializedStageWidgetEntityRenderers = new WeakMap<El, unknown>();
let renderedStageJoinQrUrl = "";

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
      visualAnimation: visualAnimation(),
      element: w().craftingTimer,
      label: w().craftingTimerLabel,
      timerSink: (timerId: number) => w().textObjectTimers.push(timerId),
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
      applyStageState, cancelStageWipe, clearPointPopups: () => (playerRosterRenderer() as { clearPointPopups?: () => void } | null)?.clearPointPopups?.(),
      clearStageAudioPlayers, completeFlowAction, prepareNewStageAction, renderVotingCards, runStageAction, runStageWipe, scheduleSubActions, setStageTextObject, showStageDecisionHalt
    });
  }
  return stageRenderOrchestratorInstance;
}

function currentRenderedActionKey(): string {
  return ((stageRenderOrchestrator() as { actionKey?: () => string } | null)?.actionKey?.() as string) || "";
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

function setPlayerAnswerBubblesShown(isShown: boolean, options: Dict = {}): number {
  return ((playerRosterRenderer() as { setAnswerBubblesShown?: (s: boolean, o: Dict) => number } | null)?.setAnswerBubblesShown?.(isShown, options) as number) || 0;
}

function setPlayerAnswerBubblesShownForAction(isShown: boolean, options: Dict = {}): Promise<void> {
  return new Promise((resolve) => {
    const renderer = playerRosterRenderer() as { setAnswerBubblesShown?: (s: boolean, o: Dict) => number } | null;
    if (!renderer?.setAnswerBubblesShown) {
      resolve();
      return;
    }
    renderer.setAnswerBubblesShown(isShown, { ...options, complete: resolve });
  });
}

function revealPlayerAnswerCorrectnessForAction(action: Dict): Promise<void> {
  return new Promise((resolve) => {
    const renderer = playerRosterRenderer() as { revealAnswerCorrectness?: (o: Dict) => number } | null;
    if (!renderer?.revealAnswerCorrectness) {
      resolve();
      return;
    }
    renderer.revealAnswerCorrectness({
      instant: action.instant === true,
      answerCorrectness: action.answerCorrectness,
      complete: resolve
    });
  });
}

function playerAnswerBubblesAnimating(): boolean {
  return (playerRosterRenderer() as { answerBubblesAnimating?: () => boolean } | null)?.answerBubblesAnimating?.() === true;
}

function renderStagePlayers(players: Dict[], options: Dict = {}): void {
  (playerRosterRenderer() as { render?: (p: Dict[], o?: Dict) => void } | null)?.render?.(players, options);
}

function setPlayersShown(isShown: boolean, options: Dict = {}): number {
  return ((playerRosterRenderer() as { setShown?: (s: boolean, o: Dict) => number } | null)?.setShown?.(isShown, options) as number) || 0;
}

function setPlayersShownForAction(action: Dict): Promise<void> {
  return new Promise((resolve) => {
    const renderer = playerRosterRenderer() as { setShown?: (s: boolean, o: Dict) => number } | null;
    if (!renderer?.setShown) {
      resolve();
      return;
    }
    renderer.setShown(action?.isShown !== false, { instant: action?.instant === true, complete: resolve });
  });
}

function renderPointPopups(popups: Dict[] = [], options: Dict = {}): void {
  (playerRosterRenderer() as { renderPointPopups?: (p: Dict[], o?: Dict) => void } | null)?.renderPointPopups?.(popups, options);
}

function showPointPopupsForAction(_action: Dict): Promise<void> {
  return (playerRosterRenderer() as { showPointPopupsForAction?: () => Promise<void> } | null)?.showPointPopupsForAction?.() || Promise.resolve();
}

function revealVoteStaggerMs(action: Dict): number {
  const seconds = Number(action?.voteRevealStaggerSeconds ?? 1);
  return Math.max(0, Math.min(60, Number.isFinite(seconds) ? seconds : 1)) * 1000;
}

function votingCardRenderOptions(lobby: Dict): Dict {
  const action = (lobby?.action as Dict) || null;
  const actionDetails = action && ["setVotingCardsShown", "revealVotingResults", "revealAuthors", "revealVotes", "revealWinningAnswer"].includes(String(action.type || ""))
    ? { actionId: action.id || "", actionType: action.type || "" }
    : {};
  if (action?.type !== "revealVotes") {
    return { ...actionDetails, voteRevealKey: "instant", voteRevealStaggerMs: 0 };
  }
  return { ...actionDetails, voteRevealKey: `${action.id || action.index || "reveal-votes"}:${action.voteRevealStaggerSeconds ?? 1}`, voteRevealStaggerMs: revealVoteStaggerMs(action) };
}

function renderVotingCards(cards: Dict[] = [], options: Dict = {}): void {
  (votingCardRenderer() as { render?: (c: Dict[], o: Dict) => void } | null)?.render?.(cards, options);
}

function runVotingCardActionForAction(action: Dict): Promise<void> {
  return (votingCardRenderer() as { completionForAction?: (a: Dict) => Promise<void> } | null)?.completionForAction?.(action) || Promise.resolve();
}

function reloadStageArtAssets(): void {
  w().loadArtAssets!().then(() => {
    if (w().currentStageState) renderStageLobby(w().currentStageState as Dict);
  }).catch(() => {});
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
  if (typeof showGameObject !== "function") return;
  const first = await invokeLayoutActionWithCompletion(
    (playOptions) => showGameObject(action, playOptions) as Dict,
    { returnResult: true, suppressMissingWarning: true }
  );
  if (!first?.missing) return;
  await Promise.all([w().loadArtAssets!().catch(() => w().artCompositions), w().loadStageLayouts!({ forceServer: true }).catch(() => w().stageLayouts)]);
  if (w().currentStageState) w().applyStageLayoutForPhase!((w().currentStageState as Dict).phase as string);
  await invokeLayoutActionWithCompletion(
    (playOptions) => showGameObject(action, playOptions) as Dict,
    { returnResult: true }
  );
}

async function playStageLayoutGameObjectAnimationForStageAction(action: Dict): Promise<void> {
  const playAnimation = w().playStageLayoutGameObjectAnimationForAction;
  if (typeof playAnimation !== "function") return;
  const first = await invokeLayoutActionWithCompletion(
    (playOptions) => playAnimation(action, playOptions) as Dict,
    { returnResult: true, suppressMissingWarning: true }
  );
  if (!first?.missing) return;
  await Promise.all([w().loadArtAssets!().catch(() => w().artCompositions), w().loadStageLayouts!({ forceServer: true }).catch(() => w().stageLayouts)]);
  if (w().currentStageState) w().applyStageLayoutForPhase!((w().currentStageState as Dict).phase as string);
  await invokeLayoutActionWithCompletion(
    (playOptions) => playAnimation(action, playOptions) as Dict,
    { returnResult: true }
  );
}

function runStageWipe(onCovered: () => void): number {
  return ((stageWipeController() as { transition?: (cb: () => void) => number } | null)?.transition?.(onCovered) as number) || 0;
}

function cancelStageWipe(): void {
  (stageWipeController() as { cancel?: () => void } | null)?.cancel?.();
}

function initStageTextObjects(): void {
  stageTextController()?.init();
}

function clearStageObjectTimers(): void {
  for (const timerId of w().subActionTimers) clearTimeout(timerId);
  for (const timerId of w().textObjectTimers) clearTimeout(timerId);
  w().subActionTimers = [];
  w().textObjectTimers = [];
}

function clearStageActionTimers(): void {
  if (w().actionTimingTimer !== null) clearTimeout(w().actionTimingTimer!);
  w().actionTimingTimer = null;
  for (const timerId of w().subActionTimers) clearTimeout(timerId);
  w().subActionTimers = [];
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

function setCraftingTimerVisible(isShown: boolean, options: Dict = {}): number {
  return ((craftingTimerController() as { setVisible?: (s: boolean, o: Dict) => number } | null)?.setVisible?.(isShown, options) as number) || 0;
}

function setCraftingTimerShownForAction(action: Dict, options: Dict = {}): Promise<void> {
  return new Promise((resolve) => {
    const controller = craftingTimerController() as { setShownForAction?: (a: Dict, o: Dict) => number } | null;
    if (!controller?.setShownForAction) {
      resolve();
      return;
    }
    controller.setShownForAction(action, { ...options, complete: resolve });
  });
}

function setStageWipeShownForAction(action: Dict, options: Dict = {}): Promise<void> {
  return new Promise((resolve) => {
    const controller = stageWipeController() as { setShownForAction?: (a: Dict, o: Dict) => number } | null;
    if (!controller?.setShownForAction) {
      resolve();
      return;
    }
    controller.setShownForAction(action, { ...options, complete: resolve });
  });
}

function syncStageWipeShown(lobby: Dict): void {
  if ((lobby?.action as Dict)?.type === "setWipeShown") return;
  (stageWipeController() as { syncShown?: (s: boolean, o: Dict) => void } | null)?.syncShown?.(lobby?.wipeShown === true, { actionKey: currentRenderedActionKey(), instant: true });
}

function resetStageObjects(options: Dict = {}): void {
  clearStageObjectTimers();
  if (options.clearActionTimers === true) clearStageActionTimers();
  if (options.clearCountdownTimer === true) clearStageCountdownTimer();
  if (options.resetWipe === true) cancelStageWipe();
  clearStageAudioPlayers();
  (craftingTimerController() as { reset?: () => void } | null)?.reset?.();
  setPlayersShown(true, { instant: false });
  (playerRosterRenderer() as { resetAnswerBubbles?: () => void } | null)?.resetAnswerBubbles?.();
  (playerRosterRenderer() as { clearPointPopupIds?: () => void } | null)?.clearPointPopupIds?.();
  clearVotingCardVisuals({ instant: true });
  initStageTextObjects();
  setStageWidgetGameObjectShown("presentationClickPrompt", false, { instant: true, scope: "global" });
}

function hardResetStageToLobby(): void {
  w().pausedCompletionRequest = null;
  w().presentationAdvancePending = false;
  resetStageObjects({ clearActionTimers: true, clearCountdownTimer: true, resetWipe: true });
}

function isPresentedTextAction(action: Dict | null): boolean {
  return Boolean(action && ["present", "presentText"].includes(action.type as string));
}

function setStageTextObject(target: unknown, options: Dict = {}): number {
  const targetId = w().normalizeTextTargetId!(target);
  const layoutText = w().PartyGameLayoutText as { setStageText?: (t: string, v: unknown) => void } | undefined;
  if (Object.prototype.hasOwnProperty.call(options, "text") && typeof layoutText?.setStageText === "function") {
    layoutText.setStageText(targetId, options.text ?? "");
  }
  if (typeof w().setStageLayoutGameObjectShownForAction === "function") {
    const result = w().setStageLayoutGameObjectShownForAction!(
      { targetLayoutElementId: targetId, targetLayoutScope: "moment", targetLayoutSurface: "stage", isShown: options.isShown !== false, instant: options.instant === true },
      { returnResult: true, suppressMissingWarning: true }
    ) as Dict;
    return Number(result?.duration || 0);
  }
  return (stageTextController()?.set(target, options) as number) || 0;
}

function setStageTextObjectForAction(target: unknown, options: Dict = {}): Promise<void> {
  const targetId = w().normalizeTextTargetId!(target);
  const layoutText = w().PartyGameLayoutText as { setStageText?: (t: string, v: unknown) => void } | undefined;
  if (Object.prototype.hasOwnProperty.call(options, "text") && typeof layoutText?.setStageText === "function") {
    layoutText.setStageText(targetId, options.text ?? "");
  }
  if (typeof w().setStageLayoutGameObjectShownForAction === "function") {
    return setStageLayoutGameObjectShownForStageAction({
      targetLayoutElementId: targetId,
      targetLayoutScope: "moment",
      targetLayoutSurface: "stage",
      isShown: options.isShown !== false,
      instant: options.instant === true
    });
  }
  return new Promise((resolve) => {
    const controller = stageTextController();
    if (!controller?.set) {
      resolve();
      return;
    }
    controller.set(target, { ...options, complete: resolve });
  });
}

function renderCraftingTimer(timer: Dict, options: Dict = {}): number {
  const duration = ((craftingTimerController() as { render?: (t: Dict, o: Dict) => number } | null)?.render?.(timer, options) as number) || 0;
  if (timer?.shown) {
    renderStageWidgetBinding("craftingTimer", { timer, instant: options.instant === true });
  }
  return duration;
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
  if (result?.renderer) {
    stageWidgetTimelineRenderers.set(bindingId, result.renderer as { playAll?: (animation: string, options?: Dict) => number });
  }
  registerRenderedStageWidgetEntity(definition, host, result);
  return result;
}

function setStageLayoutElementGameObjectShown(elementId: string, host: El | null, isShown: boolean, options: Dict = {}): number {
  const shown = isShown !== false;
  const targetElementId = w().normalizeTextTargetId!(elementId);
  if (!targetElementId || typeof w().setStageLayoutGameObjectShownForAction !== "function") {
    if (host) host.classList.toggle("hidden", !shown);
    return 0;
  }
  const result = w().setStageLayoutGameObjectShownForAction!(
    { targetLayoutElementId: targetElementId, targetLayoutScope: options.scope || "moment", targetLayoutSurface: "stage", isShown: shown, instant: options.instant === true },
    { returnResult: true, suppressMissingWarning: true }
  ) as Dict;
  return Number(result?.duration || 0);
}

function setStageWidgetGameObjectShown(bindingId: string, isShown: boolean, options: Dict = {}): number {
  const definition = stageWidgetArtDefinition(bindingId);
  const host = stageWidgetHosts[bindingId]?.() || null;
  const duration = setStageLayoutElementGameObjectShown((definition?.layoutElementId as string) || "", host, isShown, options);
  const instant = options.instant === true;
  const animation = isShown ? (instant ? "On" : "Appear") : instant ? "Off" : "Disappear";
  const artDuration = stageWidgetTimelineRenderers.get(bindingId)?.playAll?.(animation, { instant }) || 0;
  return Math.max(duration, artDuration);
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

function controllerJoinUrlForStage(stageCode: unknown): string {
  const url = new URL("/controller", location.origin);
  url.searchParams.set("stage", w().normalizeStageCode!(stageCode));
  return url.toString();
}

function renderStageJoinQr(stageCode: unknown, isVisible = true): void {
  if (!w().stageJoinQr || !w().stageJoinQrCanvas) return;
  const normalizedCode = w().normalizeStageCode!(stageCode);
  const shouldShow = isVisible && Boolean(normalizedCode);
  if (!shouldShow) {
    setStageWidgetGameObjectShown("joinQr", false);
    return;
  }
  const joinUrl = controllerJoinUrlForStage(normalizedCode);
  renderStageWidgetBinding("joinQr");
  setStageWidgetGameObjectShown("joinQr", true);
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
  setStageWidgetGameObjectShown("waitingStatus", isVisible && Boolean(cleanMessage));
}

function applyStageState(lobby: Dict): void {
  const wasPaused = w().isStagePaused;
  w().currentStageState = lobby;
  const players = (lobby.players as Dict[]) || [];
  const phase = (lobby.phase as string) || "lobby";
  const action = (lobby.action as Dict) || null;
  const isLobbyPhase = phase === "lobby" || phase === "starting";
  const liveGameTitle = lobby.gameTitle || (w().gameConstants as Dict).gameTitle || "Party Game Template";
  document.title = liveGameTitle as string;
  renderStageActionDebug(lobby);
  setStageCodeDisplays(lobby.stageCode || stageCodeValue());
  w().applyStageLayoutForPhase!(phase);
  hideFlowStageTextArtForPhase(phase, action);
  setStageManagedText("stageTitle", liveGameTitle);
  renderStageWidgetBinding("stageCodePanel", { stageCode: stageCodeValue(lobby.stageCode as string) });
  setStageWidgetGameObjectShown("stageCodePanel", isLobbyPhase, { instant: true });
  renderStageWidgetBinding("stageCodeWidget", { stageCode: stageCodeValue(lobby.stageCode as string) });
  setStageWidgetGameObjectShown("stageCodeWidget", !isLobbyPhase, { instant: true, scope: "global" });
  renderStageJoinQr(stageCodeValue(lobby.stageCode as string), isLobbyPhase);
  if (w().stageCountdownTimer !== null) clearInterval(w().stageCountdownTimer!);
  setStageWidgetGameObjectShown("countdownPopup", false, { instant: true });
  w().stageMain.classList.remove("hidden");
  w().stageFooter.classList.remove("hidden");
  w().stageIntroContent.classList.remove("hidden");
  setStageManagedText("stageIntroTitle", "GAME INTRO");
  setStageLayoutElementGameObjectShown("stageTitle", null, isLobbyPhase, { instant: true });
  setStageLayoutElementGameObjectShown("stageIntroTitle", null, phase === "intro", { instant: true });
  renderStageWidgetBinding("presentationClickPrompt");
  setStageWidgetGameObjectShown("presentationClickPrompt", isPresentedTextAction(action) && (action?.timing as Dict)?.mode !== "S+", { scope: "global" });
  clearStageDecisionDebug(lobby);
  renderStagePlayers(players, {
    instant: action?.type === "setPlayerAnswersShown" && action.instant === true
  });
  setPlayersShown(lobby.playersShown !== false);
  const nextAnswersShown = lobby.playerAnswersShown !== false;
  const answersAreStillAnimating = playerAnswerBubblesAnimating();
  const hasParkedShownBubbles = (playerRosterRenderer() as { hasParkedShownBubbles?: () => boolean } | null)?.hasParkedShownBubbles?.() === true;
  const answersWereAlreadyShown = (playerRosterRenderer() as { currentAnswerBubblesShown?: () => boolean } | null)?.currentAnswerBubblesShown?.() === nextAnswersShown;
  setPlayerAnswerBubblesShown(nextAnswersShown, { instant: answersWereAlreadyShown && !answersAreStillAnimating && !hasParkedShownBubbles });
  renderPointPopups((lobby.pendingPointPopups as Dict[]) || [], { deferAnimation: action?.type === "showPoints" });
  renderVotingCards((lobby.votingCards as Dict[]) || [], votingCardRenderOptions(lobby));
  renderCraftingTimer(lobby.craftingTimer as Dict, {
    instant: action?.type === "setTimerShown" && action.instant === true,
    deferVisibility: action?.type === "setTimerShown"
  });
  syncStageWipeShown(lobby);
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
  setStageWidgetGameObjectShown("joinWidget", isLobbyPhase);
  setStageWaitingStatus(vip ? `Waiting for ${vip.name} to start the game` : "", phase !== "intro" && players.length > 0);

  if (phase === "starting") {
    w().countdownClockOffset = (Number(lobby.serverNow) || Date.now()) - Date.now();
    setStageWaitingStatus("Tap CANCEL to stop", true);
    const updateCountdown = () => {
      const now = Date.now() + w().countdownClockOffset;
      const remainingMs = Math.max(0, (Number(lobby.countdownEndsAt) || now) - now);
      const seconds = Math.ceil(remainingMs / 1000);
      renderStageWidgetBinding("countdownPopup", { seconds });
    };
    updateCountdown();
    setStageWidgetGameObjectShown("countdownPopup", true);
    w().stageCountdownTimer = setInterval(updateCountdown, 100) as unknown as number;
  }

  if (phase === "lobby" && lobby.lobbyFlowActive !== true) {
    hardResetStageToLobby();
  }
}

function hideFlowStageTextArtForPhase(phase: string, action: Dict | null = null): void {
  const state = typeof w().stageLayoutStateForPhase === "function" ? w().stageLayoutStateForPhase!(phase) : null;
  const activeTarget = action && ["present", "presentText", "displayText"].includes(action.type as string) && action.isShown !== false ? w().normalizeTextTargetId!(action.textTarget || "presentation") : "";
  for (const element of (state?.elements as Dict[]) || []) {
    const id = w().normalizeTextTargetId!(element.id);
    if (!id || element.artCompositionId !== "layout-text-field") continue;
    if (id === "stagetitle" || id === "stageintrotitle") continue;
    if (id === activeTarget) continue;
    setStageLayoutElementGameObjectShown(id, null, false, { instant: true });
  }
}

function renderStageLobby(lobby: Dict): void {
  (stageRenderOrchestrator() as { render?: (l: Dict) => void } | null)?.render?.(lobby);
}

function prepareNewStageAction(lobby: Dict, actionKey: string): void {
  clearStageActionTimers();
  clearCraftingTimerVisibilityRequest(actionKey);
  clearStageWipeVisibilityRequest(actionKey);
  scheduleActionTiming(lobby, actionKey);
}

function scheduleActionTiming(lobby: Dict, actionKey: string): void {
  if (w().actionTimingTimer !== null) clearTimeout(w().actionTimingTimer!);
  w().actionTimingTimer = null;
  const action = lobby.action as Dict;
  if (!action || (action.timing as Dict)?.mode !== "S+") return;
  const delayMs = Math.max(0, Number((action.timing as Dict).seconds || 0) * 1000);
  w().actionTimingTimer = setTimeout(() => {
    if (currentRenderedActionKey() !== actionKey) return;
    completeFlowAction("startTimer", action.id as string);
  }, delayMs) as unknown as number;
}

function scheduleSubActions(action: Dict, actionKey: string): void {
  for (const subAction of (action?.subActions as Dict[]) || []) {
    const delayMs = Math.max(0, Number((subAction.timing as Dict)?.seconds || 0) * 1000);
    if (delayMs === 0) {
      if (currentRenderedActionKey() === actionKey) runStageAction(subAction, false, actionKey);
      continue;
    }
    const timerId = setTimeout(() => {
      if (currentRenderedActionKey() !== actionKey) return;
      runStageAction(subAction, false, actionKey);
    }, delayMs) as unknown as number;
    w().subActionTimers.push(timerId);
  }
}

function playStageAudioAction(action: Dict, isPrimary: boolean, actionKey: string): void {
  const audioUrl = String(action.audioUrl || "").trim();
  if (!audioUrl) {
    if (isPrimary && (action.timing as Dict)?.mode !== "S+") completeFlowAction("callback", action.id as string);
    return;
  }
  const audio = new Audio(audioUrl) as AudioEl;
  audio.stageInterrupted = false;
  w().stageAudioPlayers.add(audio);
  const finish = () => {
    const wasInterrupted = audio.stageInterrupted === true;
    w().stageAudioPlayers.delete(audio);
    audio.removeEventListener("ended", finish);
    audio.removeEventListener("error", finish);
    if (!wasInterrupted && isPrimary && currentRenderedActionKey() === actionKey && (action.timing as Dict)?.mode !== "S+") {
      completeFlowAction("callback", action.id as string);
    }
  };
  audio.addEventListener("ended", finish);
  audio.addEventListener("error", finish);
  audio.play().catch(finish);
}

let stageActionRunner: Dict | null = null;

function getStageActionRunner(): Dict | null {
  if (!stageActionRunner && w().PartyGameStageActionRunners) {
    stageActionRunner = (w().PartyGameStageActionRunners as unknown as { createRunner: (o: Dict) => Dict }).createRunner({
      applyFlowActionEffect, completeFlowAction, isCurrentActionKey: (actionKey: string) => currentRenderedActionKey() === actionKey, playStageAudioAction, revealPlayerAnswerCorrectnessForAction,
      playStageLayoutGameObjectAnimationForAction: playStageLayoutGameObjectAnimationForStageAction, runStageWipe, runVotingCardActionForAction, setCraftingTimerShownForAction, setStageLayoutGameObjectShownForAction: setStageLayoutGameObjectShownForStageAction, setPlayerAnswerBubblesShown, setPlayerAnswerBubblesShownForAction, setPlayersShownForAction, setStageWipeShownForAction, setStageTextObject, setStageTextObjectForAction, showPointPopupsForAction
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

async function applyFlowActionEffect(actionId: string): Promise<void> {
  const stageCode = currentStageCodeForRuntimeTest();
  if (!stageCode || !actionId) return;
  try {
    const result = (await w().postJson!("/api/action-effect", { stageCode, actionId })) as Dict;
    if (result.lobby) renderStageLobby(result.lobby as Dict);
  } catch (error) {
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

function clearRuntimeTestConfigForStage(stageCode: string): void {
  w().runtimeTestLayouts = null;
  if (!stageCode || !w().canUseServer) return;
  w().postJson!(`/api/stage/${stageCode}/test-config`, { clearFlow: true }).catch(() => {});
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

function subscribeToStage(stageCode: string): void {
  if (!w().canUseServer) {
    setStageWaitingStatus("Open through the server to host a lobby", true);
    return;
  }
  if (!("EventSource" in window)) {
    pollLobby(stageCode);
    w().lobbyPollTimer = setInterval(() => pollLobby(stageCode), 1000) as unknown as number;
    return;
  }
  const stream = new EventSource(`${location.origin}/api/stage/${stageCode}/events`);
  stream.addEventListener("lobby", (event) => renderStageLobby(JSON.parse((event as MessageEvent).data)));
  stream.addEventListener("artAssetsChanged", () => reloadStageArtAssets());
  stream.addEventListener("error", () => setStageWaitingStatus("Reconnecting to lobby", true));
}

function setupStage(): void {
  w().stageScreen.classList.remove("hidden");
  initStageTextObjects();
  reloadStageArtAssets();
  w().listenForArtAssetsChanged!(reloadStageArtAssets);
  w().loadStageLayouts!().then(() => {
    if (w().currentStageState) w().applyStageLayoutForPhase!((w().currentStageState as Dict).phase as string);
  }).catch(() => {});
  const stageCode = w().getOrCreateStageCode!();
  setStageCodeDisplays(stageCode);
  renderStageJoinQr(stageCode, true);
  clearRuntimeTestConfigForStage(stageCode);
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
  subscribeToStage(stageCode);
}

// Install the orchestrator entry points + the names other scripts read as globals,
// replicating the classic script. setStageTextObject ← layout-runtime;
// applyControllerRuntimeTestMessage ← controller.ts; setupStage ← app-shell dispatch.
Object.assign(w(), {
  setupStage,
  setStageTextObject,
  applyControllerRuntimeTestMessage,
  applyRuntimeTestMessage,
  applyStageState,
  renderStageLobby,
  completeFlowAction,
  setCraftingTimerVisible,
  setStageManagedText,
  setStageWaitingStatus,
  setStageWidgetGameObjectShown
});

export {};
