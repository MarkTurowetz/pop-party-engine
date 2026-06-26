let stageTextControllerInstance = null;
let craftingTimerControllerInstance = null;
let playerAnswerBubbleControllerInstance = null;
let playerRosterRendererInstance = null;
let stageDebugPanelInstance = null;
let stageWipeControllerInstance = null;
let stageRenderOrchestratorInstance = null;
let stageWidgetArtRendererInstance = null;
let renderedStageJoinQrUrl = "";

function stageVisualControllers() {
  return window.PartyGameStageVisualControllers || null;
}

function stageWidgetArtRenderer() {
  if (!stageWidgetArtRendererInstance && window.PartyGameStageWidgetArt) {
    stageWidgetArtRendererInstance = window.PartyGameStageWidgetArt.createRenderer({
      document,
      visualAnimation,
      getComposition: artComposition
    });
  }
  return stageWidgetArtRendererInstance;
}

function stageTextController() {
  if (!stageTextControllerInstance && stageVisualControllers()) {
    stageTextControllerInstance = stageVisualControllers().createStageTextController({
      visualAnimation,
      queryTextElements: () => Array.from(stageBoard.querySelectorAll(".stage-text-object[id]")),
      defaultElements: {
        presentation: stagePresentationText,
        prompt: stagePromptText
      },
      normalizeTextTargetId,
      applyTextProperties: applyStageLayoutTextProperties,
      timerSink: (timerId) => textObjectTimers.push(timerId),
      objects: stageTextObjects,
      setObjects: (objects) => {
        stageTextObjects = objects;
      }
    });
  }
  return stageTextControllerInstance;
}

function craftingTimerController() {
  if (!craftingTimerControllerInstance && stageVisualControllers()) {
    craftingTimerControllerInstance = stageVisualControllers().createCraftingTimerController({
      visualAnimation,
      element: craftingTimer,
      label: craftingTimerLabel,
      timerSink: (timerId) => textObjectTimers.push(timerId),
      getRenderedActionKey: () => currentRenderedActionKey(),
      getCurrentStageState: () => currentStageState,
      fallbackDurationMs: () => Math.max(1, Number(gameConstants.craftingTimerDuration || 30)) * 1000,
      onTick: ({ label, timer }) => renderStageWidgetBinding("craftingTimer", { label, timer })
    });
  }
  return craftingTimerControllerInstance;
}

function playerAnswerBubbleController() {
  if (!playerAnswerBubbleControllerInstance && stageVisualControllers()) {
    playerAnswerBubbleControllerInstance = stageVisualControllers().createPlayerAnswerBubbleController({
      visualAnimation,
      host: playerLobby,
      document
    });
  }
  return playerAnswerBubbleControllerInstance;
}

function playerRosterRenderer() {
  if (!playerRosterRendererInstance && window.PartyGamePlayerRoster) {
    playerRosterRendererInstance = window.PartyGamePlayerRoster.createRenderer({
      host: playerLobby,
      document,
      gameObjectApi: window.PartyGameGameObject || window.PartyGameStageGameObject,
      timerSink: (timerId) => textObjectTimers.push(timerId),
      avatarClass,
      avatarFrameImage,
      dinoIcon,
      playerAvatarArt,
      syncAnswerBubble: syncPlayerAnswerBubble
    });
  }
  return playerRosterRendererInstance;
}

function stageDebugPanel() {
  if (!stageDebugPanelInstance && window.PartyGameStageDebug) {
    stageDebugPanelInstance = window.PartyGameStageDebug.createPanel({
      actionElement: stageDebugAction,
      alertElement: stageDebugAlert
    });
  }
  return stageDebugPanelInstance;
}

window.PartyGameStageDebugRuntime = {
  showGameObjectWarning: (details) => stageDebugPanel()?.showGameObjectWarning(details),
  showArtAssetWarning: (details) => stageDebugPanel()?.showGameObjectWarning(details)
};

function stageWipeController() {
  if (!stageWipeControllerInstance && window.PartyGameStageWipe) {
    stageWipeControllerInstance = window.PartyGameStageWipe.createController({
      element: stageWipe,
      gameObjectApi: window.PartyGameGameObject || window.PartyGameStageGameObject,
      visualAnimation
    });
  }
  return stageWipeControllerInstance;
}

function stageRenderOrchestrator() {
  if (!stageRenderOrchestratorInstance && window.PartyGameStageRenderOrchestrator) {
    stageRenderOrchestratorInstance = window.PartyGameStageRenderOrchestrator.createOrchestrator({
      applyStageState,
      cancelStageWipe,
      clearPointPopups: () => playerRosterRenderer()?.clearPointPopups(),
      clearStageAudioPlayers,
      completeFlowAction,
      prepareNewStageAction,
      renderVotingCards,
      runStageAction,
      runStageWipe,
      scheduleSubActions,
      setStageTextObject,
      showStageDecisionHalt
    });
  }
  return stageRenderOrchestratorInstance;
}

function currentRenderedActionKey() {
  return stageRenderOrchestrator()?.actionKey() || "";
}

let votingCardVisualRenderer = null;

function votingCardRenderer() {
  if (!votingCardVisualRenderer && votingCardLayer && window.PartyGameVotingCardVisuals) {
    votingCardVisualRenderer = window.PartyGameVotingCardVisuals.createRenderer({
      layer: votingCardLayer,
      visualAnimation,
      avatarClass,
      avatarFrameImage,
      dinoIcon,
      playerAvatarArt,
      gameObjectApi: window.PartyGameGameObject || window.PartyGameStageGameObject,
      getComposition: () => artComposition("voting-card")
    });
  }
  return votingCardVisualRenderer;
}

function clearVotingCardVisuals(options = {}) {
  votingCardRenderer()?.clear(options);
}

function syncPlayerAnswerBubble(tile, player, options = {}) {
  return playerAnswerBubbleController()?.sync(tile, player, options) || 0;
}

function setPlayerAnswerBubblesShown(isShown, options = {}) {
  return playerAnswerBubbleController()?.setShown(isShown, options) || 0;
}

function playerAnswerBubbleAnimationRemaining() {
  return playerAnswerBubbleController()?.remaining() || 0;
}

function renderStagePlayers(players) {
  playerRosterRenderer()?.render(players);
}

function setPlayersShown(isShown, options = {}) {
  return playerRosterRenderer()?.setShown(isShown, options) || 0;
}

function setPlayersShownForAction(action) {
  return setPlayersShown(action?.isShown !== false, { instant: action?.instant === true });
}

function renderPointPopups(popups = []) {
  playerRosterRenderer()?.renderPointPopups(popups);
}

function revealVoteStaggerMs(action) {
  const seconds = Number(action?.voteRevealStaggerSeconds ?? 1);
  return Math.max(0, Math.min(60, Number.isFinite(seconds) ? seconds : 1)) * 1000;
}

function voteRevealDurationMs(action, cards = currentStageState?.votingCards || []) {
  if (action?.type !== "revealVotes") return 0;
  const maxVotes = Math.max(0, ...(Array.isArray(cards) ? cards.map((card) => (card.voters || []).length) : [0]));
  if (maxVotes <= 0) return 0;
  return Math.round(maxVotes * revealVoteStaggerMs(action) + 220);
}

function votingCardRenderOptions(lobby) {
  const action = lobby?.action || null;
  if (action?.type !== "revealVotes") {
    return { voteRevealKey: "instant", voteRevealStaggerMs: 0 };
  }
  return {
    voteRevealKey: `${action.id || action.index || "reveal-votes"}:${action.voteRevealStaggerSeconds ?? 1}`,
    voteRevealStaggerMs: revealVoteStaggerMs(action)
  };
}

function renderVotingCards(cards = [], options = {}) {
  votingCardRenderer()?.render(cards, options);
}

function reloadStageArtAssets() {
  loadArtAssets().then(() => {
    if (currentStageState) renderStageLobby(currentStageState);
  }).catch(() => {});
}

async function setStageLayoutGameObjectShownForStageAction(action) {
  const showGameObject = window.setStageLayoutGameObjectShownForAction || setStageLayoutArtElementShownForAction;
  if (typeof showGameObject !== "function") return 0;
  const first = showGameObject(action, {
      returnResult: true,
      suppressMissingWarning: true
  });
  if (!first?.missing) return first?.duration || 0;

  await Promise.all([
    loadArtAssets().catch(() => artCompositions),
    loadStageLayouts({ forceServer: true }).catch(() => stageLayouts)
  ]);
  if (currentStageState) applyStageLayoutForPhase(currentStageState.phase);
  const retry = showGameObject(action, { returnResult: true });
  return retry?.duration || 0;
}

function runStageWipe(onCovered) {
  return stageWipeController()?.transition(onCovered) || 0;
}

function cancelStageWipe() {
  stageWipeController()?.cancel();
}

function initStageTextObjects() {
  stageTextController()?.init();
}

function normalizeTextTargetId(value) {
  return String(value || "")
    .trim()
    .replace(/^#/, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function clearStageObjectTimers() {
  for (const timerId of subActionTimers) window.clearTimeout(timerId);
  for (const timerId of textObjectTimers) window.clearTimeout(timerId);
  subActionTimers = [];
  textObjectTimers = [];
}

function clearStageActionTimers() {
  for (const timerId of subActionTimers) window.clearTimeout(timerId);
  subActionTimers = [];
}

function clearStageAudioPlayers() {
  for (const audio of stageAudioPlayers) {
    audio.stageInterrupted = true;
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
  }
  stageAudioPlayers.clear();
}

function clearCraftingTimerVisibilityRequest(actionKey = "") {
  craftingTimerController()?.clearRequest(actionKey);
}

function clearStageWipeVisibilityRequest(actionKey = "") {
  stageWipeController()?.clearRequest(actionKey);
}

function setCraftingTimerVisible(isShown, options = {}) {
  return craftingTimerController()?.setVisible(isShown, options) || 0;
}

function setCraftingTimerShownForAction(action, options = {}) {
  return craftingTimerController()?.setShownForAction(action, options) || 0;
}

function setStageWipeShownForAction(action, options = {}) {
  return stageWipeController()?.setShownForAction(action, options) || 0;
}

function syncStageWipeShown(lobby) {
  if (lobby?.action?.type === "setWipeShown") return;
  stageWipeController()?.syncShown(lobby?.wipeShown === true, {
    actionKey: currentRenderedActionKey(),
    instant: true
  });
}

function resetStageObjects() {
  clearStageObjectTimers();
  clearStageAudioPlayers();
  craftingTimerController()?.reset();
  setPlayersShown(true, { instant: false });
  playerAnswerBubbleController()?.reset();
  playerRosterRenderer()?.clearPointPopupIds();
  clearVotingCardVisuals({ instant: true });
  initStageTextObjects();
  setStageWidgetGameObjectShown("presentationClickPrompt", false, { instant: true, scope: "global" });
}

function setStageTextObject(target, options = {}) {
  return stageTextController()?.set(target, options) || 0;
}

function renderCraftingTimer(timer, options = {}) {
  const duration = craftingTimerController()?.render(timer, options) || 0;
  if (timer?.shown) {
    renderStageWidgetBinding("craftingTimer", {
      timer,
      instant: options.instant === true
    });
  }
  return duration;
}

const stageWidgetHosts = {
  stageCodePanel: () => stageCodeText.closest(".stage-code-panel"),
  stageCodeWidget: () => stageCodeBadgeRoot,
  joinQr: () => stageJoinQr,
  joinWidget: () => joinPrompt,
  waitingStatus: () => waitingStatus,
  countdownPopup: () => startPopup,
  craftingTimer: () => craftingTimer,
  presentationClickPrompt: () => presentClickWidget
};

function stageCodeValue(fallback = "") {
  const stateValue = String(currentStageState?.stageCode || "").trim();
  if (stateValue) return stateValue;
  const storedValue = String(stageCodeText?.dataset?.stageCodeValue || stageCodeBadge?.dataset?.stageCodeValue || "").trim();
  if (storedValue) return storedValue;
  return normalizeStageCode(String(fallback || stageCodeText?.dataset?.textFitSource || stageCodeText?.textContent || ""));
}

function setStageCodeDisplays(stageCode) {
  const cleanCode = normalizeStageCode(stageCode);
  if (!cleanCode) return;
  stageCodeText.dataset.stageCodeValue = cleanCode;
  stageCodeBadge.dataset.stageCodeValue = cleanCode;
  if (!stageCodeText.classList.contains("has-stage-widget-art")) {
    stageCodeText.textContent = cleanCode;
  }
  stageCodeBadge.textContent = cleanCode;
}

const stageWidgetTextOverrides = {
  stageCodePanel: (context) => ({ "panel-code": stageCodeValue(context.stageCode) }),
  stageCodeWidget: (context) => ({ "badge-code": stageCodeValue(context.stageCode) }),
  joinWidget: () => ({ "join-text": joinPrompt.dataset.joinText || "Join the Lobby at bit.ly/popcontroller" }),
  waitingStatus: (context) => ({ "status-text": context.text || waitingStatus.dataset.statusText || "" }),
  countdownPopup: (context) => ({ "popup-text": context.seconds > 0 ? `Starting in ${context.seconds}` : "Let's Go" }),
  craftingTimer: (context) => ({
    "timer-value": context.label || craftingTimerLabel.dataset.timerValue || craftingTimerLabel.dataset.textFitSource || craftingTimerLabel.textContent || String(Math.ceil(Number(context.timer?.remainingMs || context.timer?.durationMs || 30000) / 1000))
  })
};

function stageWidgetArtDefinition(widgetId) {
  return window.PartyGameStageWidgetBindings?.definition?.(widgetId) || null;
}

function renderStageWidgetBinding(bindingId, context = {}) {
  const definition = stageWidgetArtDefinition(bindingId);
  const binding = {
    compositionId: definition?.compositionId,
    host: stageWidgetHosts[bindingId],
    textOverrides: stageWidgetTextOverrides[bindingId],
    overlays: definition?.overlayComponentId ? [
      {
        componentId: definition.overlayComponentId,
        element: () => stageJoinQrCanvas
      }
    ] : []
  };
  if (!binding?.compositionId) return null;
  const host = binding.host?.(context);
  if (!host) return null;
  const result = stageWidgetArtRenderer()?.renderBound(host, binding, context) || null;
  registerRenderedStageWidgetEntity(definition, host, result);
  return result;
}

function setStageLayoutElementGameObjectShown(elementId, host, isShown, options = {}) {
  const shown = isShown !== false;
  if (host && shown) host.classList.remove("hidden");
  if (!elementId || typeof setStageLayoutGameObjectShownForAction !== "function") {
    if (host) host.classList.toggle("hidden", !shown);
    return 0;
  }
  const result = setStageLayoutGameObjectShownForAction({
    targetLayoutElementId: elementId,
    targetLayoutScope: options.scope || "moment",
    targetLayoutSurface: "stage",
    isShown: shown,
    instant: options.instant === true
  }, {
    returnResult: true,
    suppressMissingWarning: true
  });
  if (host && result?.missing) {
    host.classList.add("hidden");
  }
  return Number(result?.duration || 0);
}

function setStageWidgetGameObjectShown(bindingId, isShown, options = {}) {
  const definition = stageWidgetArtDefinition(bindingId);
  return setStageLayoutElementGameObjectShown(
    definition?.layoutElementId || "",
    stageWidgetHosts[bindingId]?.(options.context || {}) || null,
    isShown,
    options
  );
}

function registerRenderedStageWidgetEntity(definition, host, renderResult) {
  const elementId = definition?.layoutElementId || host?.dataset?.stageLayoutElementId || "";
  const renderer = renderResult?.renderer || null;
  if (!elementId || !renderer || typeof stageLayoutEntityForElementId !== "function") return;
  const entity = stageLayoutEntityForElementId(elementId, host);
  entity?.update?.({
    artRenderer: renderer,
    syncArtRendererOnShow: true
  });
}

function renderStageActionDebug(lobby) {
  stageDebugPanel()?.renderAction(lobby);
}

function clearStageDecisionDebug(lobby) {
  stageDebugPanel()?.clearDecisionAlert(lobby);
}

function showStageDecisionHalt(lobby) {
  stageDebugPanel()?.showDecisionHalt(lobby);
}

function controllerJoinUrlForStage(stageCode) {
  const url = new URL("/controller", origin);
  url.searchParams.set("stage", normalizeStageCode(stageCode));
  return url.toString();
}

function renderStageJoinQr(stageCode, isVisible = true) {
  if (!stageJoinQr || !stageJoinQrCanvas) return;
  const normalizedCode = normalizeStageCode(stageCode);
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
    window.PartyGameQrCode?.renderCanvas(stageJoinQrCanvas, joinUrl, {
      background: "#fff8d6",
      foreground: "#17131f",
      size: 220
    });
  } catch (error) {
    renderedStageJoinQrUrl = "";
  }
}

function setStageWaitingStatus(message, isVisible = true) {
  if (!waitingStatus) return;
  const cleanMessage = String(message || "");
  waitingStatus.dataset.statusText = cleanMessage;
  if (!waitingStatus.classList.contains("has-stage-widget-art")) {
    waitingStatus.textContent = cleanMessage;
  }
  renderStageWidgetBinding("waitingStatus", { text: cleanMessage });
  setStageWidgetGameObjectShown("waitingStatus", isVisible && Boolean(cleanMessage));
}

function applyStageState(lobby) {
  const wasPaused = isStagePaused;
  currentStageState = lobby;
  const players = lobby.players || [];
  const phase = lobby.phase || "lobby";
  const action = lobby.action || null;
  const isLobbyPhase = phase === "lobby" || phase === "starting";
  const liveGameTitle = lobby.gameTitle || gameConstants.gameTitle || "Party Game Template";
  document.title = liveGameTitle;
  renderStageActionDebug(lobby);
  const stageTitleElement = document.querySelector(".stage-title");
  if (stageTitleElement) stageTitleElement.textContent = liveGameTitle;
  setStageCodeDisplays(lobby.stageCode || stageCodeValue());
  applyStageLayoutForPhase(phase);
  renderStageWidgetBinding("stageCodePanel", { stageCode: stageCodeValue(lobby.stageCode) });
  setStageWidgetGameObjectShown("stageCodePanel", isLobbyPhase, { instant: true });
  renderStageWidgetBinding("stageCodeWidget", { stageCode: stageCodeValue(lobby.stageCode) });
  setStageWidgetGameObjectShown("stageCodeWidget", !isLobbyPhase, { instant: true, scope: "global" });
  renderStageJoinQr(stageCodeValue(lobby.stageCode), isLobbyPhase);
  window.clearInterval(stageCountdownTimer);
  setStageWidgetGameObjectShown("countdownPopup", false, { instant: true });
  stageMain.classList.remove("hidden");
  stageFooter.classList.remove("hidden");
  stageIntroContent.classList.remove("hidden");
  stageIntroTitle.textContent = "GAME INTRO";
  setStageLayoutElementGameObjectShown("stageTitle", stageTitleElement, isLobbyPhase, { instant: true });
  setStageLayoutElementGameObjectShown("stageIntroTitle", stageIntroTitle, phase === "intro", { instant: true });
  renderStageWidgetBinding("presentationClickPrompt");
  setStageWidgetGameObjectShown("presentationClickPrompt", action?.type === "present" && action?.timing?.mode !== "S+", {
    scope: "global"
  });
  clearStageDecisionDebug(lobby);
  renderStagePlayers(players);
  setPlayersShown(lobby.playersShown !== false);
  const nextAnswersShown = lobby.playerAnswersShown !== false;
  const answersAreStillAnimating = playerAnswerBubbleAnimationRemaining() > 0;
  const hasParkedShownBubbles = playerAnswerBubbleController()?.hasParkedShownBubbles() === true;
  const answersWereAlreadyShown = playerAnswerBubbleController()?.currentShown() === nextAnswersShown;
  setPlayerAnswerBubblesShown(nextAnswersShown, { instant: answersWereAlreadyShown && !answersAreStillAnimating && !hasParkedShownBubbles });
  renderPointPopups(lobby.pendingPointPopups || []);
  renderVotingCards(lobby.votingCards || [], votingCardRenderOptions(lobby));
  renderCraftingTimer(lobby.craftingTimer, { instant: action?.type === "setTimerShown" && action.instant === true });
  syncStageWipeShown(lobby);
  setStagePaused(lobby.isPaused === true, { localOnly: true });
  if (wasPaused && lobby.isPaused !== true && pausedCompletionRequest) {
    const pending = pausedCompletionRequest;
    pausedCompletionRequest = null;
    window.setTimeout(() => {
      if (currentStageState?.action?.id === pending.actionId) {
        completeFlowAction(pending.source, pending.actionId);
      }
    }, 0);
  }

  const vip = players.find((player) => player.isVip);
  renderStageWidgetBinding("joinWidget");
  setStageWidgetGameObjectShown("joinWidget", isLobbyPhase);
  setStageWaitingStatus(vip ? `Waiting for ${vip.name} to start the game` : "", phase !== "intro" && players.length > 0);

  if (phase === "starting") {
    countdownClockOffset = (lobby.serverNow || Date.now()) - Date.now();
    setStageWaitingStatus("Tap CANCEL to stop", true);
    const updateCountdown = () => {
      const now = Date.now() + countdownClockOffset;
      const remainingMs = Math.max(0, (lobby.countdownEndsAt || now) - now);
      const seconds = Math.ceil(remainingMs / 1000);
      renderStageWidgetBinding("countdownPopup", { seconds });
    };
    updateCountdown();
    setStageWidgetGameObjectShown("countdownPopup", true);
    stageCountdownTimer = window.setInterval(updateCountdown, 100);
  }

  if (phase === "lobby" && lobby.lobbyFlowActive !== true) {
    resetStageObjects();
  }
}

function renderStageLobby(lobby) {
  stageRenderOrchestrator()?.render(lobby);
}

function prepareNewStageAction(lobby, actionKey) {
  clearStageActionTimers();
  clearCraftingTimerVisibilityRequest(actionKey);
  clearStageWipeVisibilityRequest(actionKey);
  scheduleActionTiming(lobby, actionKey);
}

function scheduleActionTiming(lobby, actionKey) {
  window.clearTimeout(actionTimingTimer);
  actionTimingTimer = null;
  const action = lobby.action;
  if (!action || action.timing?.mode !== "S+") return;
  const delayMs = Math.max(0, Number(action.timing.seconds || 0) * 1000);
  actionTimingTimer = window.setTimeout(() => {
    if (currentRenderedActionKey() !== actionKey) return;
    completeFlowAction("startTimer", action.id);
  }, delayMs);
}

function scheduleSubActions(action, actionKey) {
  for (const subAction of action?.subActions || []) {
    const delayMs = Math.max(0, Number(subAction.timing?.seconds || 0) * 1000);
    if (delayMs === 0) {
      if (currentRenderedActionKey() === actionKey) runStageAction(subAction, false, actionKey);
      continue;
    }
    const timerId = window.setTimeout(() => {
      if (currentRenderedActionKey() !== actionKey) return;
      runStageAction(subAction, false, actionKey);
    }, delayMs);
    subActionTimers.push(timerId);
  }
}

function playStageAudioAction(action, isPrimary, actionKey) {
  const audioUrl = String(action.audioUrl || "").trim();
  if (!audioUrl) {
    if (isPrimary) completeFlowAction("callback", action.id);
    return;
  }

  const audio = new Audio(audioUrl);
  audio.stageInterrupted = false;
  stageAudioPlayers.add(audio);
  const finish = () => {
    const wasInterrupted = audio.stageInterrupted === true;
    stageAudioPlayers.delete(audio);
    audio.removeEventListener("ended", finish);
    audio.removeEventListener("error", finish);
    if (!wasInterrupted && isPrimary && currentRenderedActionKey() === actionKey && action.timing?.mode !== "S+") {
      completeFlowAction("callback", action.id);
    }
  };
  audio.addEventListener("ended", finish);
  audio.addEventListener("error", finish);
  audio.play().catch(finish);
}

let stageActionRunner = null;

function getStageActionRunner() {
  if (!stageActionRunner && window.PartyGameStageActionRunners) {
    stageActionRunner = window.PartyGameStageActionRunners.createRunner({
      applyFlowActionEffect,
      completeFlowAction,
      isCurrentActionKey: (actionKey) => currentRenderedActionKey() === actionKey,
      playStageAudioAction,
      playerAnswerBubbleAnimationRemaining,
      runStageWipe,
      setCraftingTimerShownForAction,
      setStageLayoutGameObjectShownForAction: setStageLayoutGameObjectShownForStageAction,
      setPlayerAnswerBubblesShown,
      setPlayersShownForAction,
      setStageWipeShownForAction,
      setStageTextObject,
      voteRevealDurationMs
    });
  }
  return stageActionRunner;
}

function runStageAction(action, isPrimary, actionKey) {
  if (!action) return;
  if (isPrimary) scheduleSubActions(action, actionKey);
  getStageActionRunner()?.run(action, { isPrimary, actionKey });
}

async function pollLobby(stageCode) {
  try {
    const result = await getJson(`/api/stage/${stageCode}/lobby`);
    renderStageLobby(result.lobby);
  } catch (error) {
    setStageWaitingStatus("Reconnecting to lobby", true);
  }
}

async function emitStageInputEvent(eventType, actionId = currentStageState?.action?.id || "") {
  if (!currentStageState?.stageCode || !eventType) return null;
  const result = await postJson("/api/input-event", {
    stageCode: currentStageState.stageCode,
    actionId,
    eventType
  });
  if (result.lobby) renderStageLobby(result.lobby);
  return result;
}

async function handleStageScreenClick() {
  if (isStagePaused) return;
  if (presentationAdvancePending) return;
  if (currentStageState?.action?.type !== "present") return;
  presentationAdvancePending = true;
  const action = currentStageState.action;
  const target = action.textTarget || "presentation";
  const delayMs = setStageTextObject(target, {
    isShown: false,
    instant: action.instant === true
  });
  try {
    if (delayMs > 0) await new Promise((resolve) => window.setTimeout(resolve, delayMs));
    await emitStageInputEvent("stageClick", action.id);
  } catch (error) {
    // Keep the current presented text on screen if the click cannot be saved.
  } finally {
    presentationAdvancePending = false;
  }
}

async function completeFlowAction(source = "callback", actionId = currentStageState?.action?.id || "") {
  if (!currentStageState?.stageCode) return;
  if (currentStageState?.isPaused === true) {
    pausedCompletionRequest = { source, actionId };
    return;
  }
  try {
    const result = await postJson("/api/complete-action", {
      stageCode: currentStageState.stageCode,
      actionId,
      source
    });
    if (result.lobby) renderStageLobby(result.lobby);
  } catch (error) {
    if (error.message === "Game is paused") {
      pausedCompletionRequest = { source, actionId };
      return;
    }
    setStageWaitingStatus(error.message, true);
  }
}

async function applyFlowActionEffect(actionId) {
  const stageCode = currentStageCodeForRuntimeTest();
  if (!stageCode || !actionId) return;
  try {
    const result = await postJson("/api/action-effect", { stageCode, actionId });
    if (result.lobby) renderStageLobby(result.lobby);
  } catch (error) {
    setStageWaitingStatus(error.message, true);
  }
}

function currentStageCodeForRuntimeTest() {
  return stageCodeValue();
}

async function applyRuntimeTestMessage(message) {
  if (!message || message.type !== "runtime-test-config") return;

  if (message.clearArtCompositions) {
    await loadArtAssets().catch(() => artCompositions);
  } else if (message.artCompositions) {
    artCompositions = typeof mergeArtCompositionDrafts === "function"
      ? mergeArtCompositionDrafts(message.artCompositions)
      : message.artCompositions;
  }

  if (message.clearLayouts) {
    runtimeTestLayouts = null;
    await loadStageLayouts({ forceServer: true }).catch(() => stageLayouts);
  } else if (message.layouts) {
    runtimeTestLayouts = message.layouts;
    stageLayouts = runtimeTestLayouts;
  }

  if (currentStageState) applyStageLayoutForPhase(currentStageState.phase);

  const stageCode = currentStageCodeForRuntimeTest();
  if (!stageCode || (!message.flow && !message.clearFlow)) return;
  try {
    const result = await postJson(`/api/stage/${stageCode}/test-config`, {
      flow: message.flow || null,
      clearFlow: message.clearFlow === true
    });
    if (result.lobby) renderStageLobby(result.lobby);
  } catch (error) {
    setStageWaitingStatus(error.message, true);
  }
}

async function applyControllerRuntimeTestMessage(message) {
  if (!message || message.type !== "runtime-test-config") return;
  if (message.clearArtCompositions) {
    await loadArtAssets().catch(() => artCompositions);
  } else if (message.artCompositions) {
    artCompositions = typeof mergeArtCompositionDrafts === "function"
      ? mergeArtCompositionDrafts(message.artCompositions)
      : message.artCompositions;
  }

  if (message.clearControllerLayouts) {
    runtimeTestControllerLayouts = null;
    await loadControllerLayouts({ forceServer: true }).catch(() => controllerLayouts);
  } else if (message.controllerLayouts) {
    runtimeTestControllerLayouts = message.controllerLayouts;
    controllerLayouts = runtimeTestControllerLayouts;
  }
  applyControllerLayoutForPhase(controllerState ? controllerState.phase || "lobby" : "join");
}

function clearRuntimeTestConfigForStage(stageCode) {
  runtimeTestLayouts = null;
  if (!stageCode || !canUseServer) return;
  postJson(`/api/stage/${stageCode}/test-config`, { clearFlow: true }).catch(() => {});
}

function setStagePaused(isPaused, options = {}) {
  isStagePaused = isPaused;
  pauseMenu.classList.toggle("hidden", !isPaused);
}

async function requestStagePaused(isPaused) {
  if (!currentStageState?.stageCode) {
    setStagePaused(isPaused, { localOnly: true });
    return;
  }
  try {
    const result = await postJson("/api/pause", {
      stageCode: currentStageState.stageCode,
      isPaused
    });
    if (result.lobby) renderStageLobby(result.lobby);
  } catch (error) {
    setStageWaitingStatus(error.message, true);
  }
}

async function quitStageToLobby() {
  if (!currentStageState?.stageCode) return;
  resetStageObjects();
  setStagePaused(false, { localOnly: true });
  try {
    const result = await postJson("/api/quit-to-lobby", {
      stageCode: currentStageState.stageCode
    });
    if (result.lobby) renderStageLobby(result.lobby);
  } catch (error) {
    setStageWaitingStatus(error.message, true);
  }
}

function subscribeToStage(stageCode) {
  if (!canUseServer) {
    setStageWaitingStatus("Open through the server to host a lobby", true);
    return;
  }

  if (!("EventSource" in window)) {
    pollLobby(stageCode);
    lobbyPollTimer = window.setInterval(() => pollLobby(stageCode), 1000);
    return;
  }

  const stream = new EventSource(`${origin}/api/stage/${stageCode}/events`);
  stream.addEventListener("lobby", (event) => {
    renderStageLobby(JSON.parse(event.data));
  });
  stream.addEventListener("artAssetsChanged", () => {
    reloadStageArtAssets();
  });
  stream.addEventListener("error", () => {
    setStageWaitingStatus("Reconnecting to lobby", true);
  });
}

function setupStage() {
  stageScreen.classList.remove("hidden");
  initStageTextObjects();
  reloadStageArtAssets();
  listenForArtAssetsChanged(reloadStageArtAssets);
  loadStageLayouts().then(() => {
    if (currentStageState) applyStageLayoutForPhase(currentStageState.phase);
  }).catch(() => {});
  const stageCode = getOrCreateStageCode();
  setStageCodeDisplays(stageCode);
  renderStageJoinQr(stageCode, true);
  clearRuntimeTestConfigForStage(stageCode);
  runtimeTestChannel?.addEventListener("message", (event) => {
    applyRuntimeTestMessage(event.data);
  });
  stageScreen.addEventListener("click", handleStageScreenClick);
  pauseMenu.addEventListener("click", (event) => event.stopPropagation());
  returnToGameButton.addEventListener("click", () => requestStagePaused(false));
  quitToLobbyButton.addEventListener("click", quitStageToLobby);
  window.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    requestStagePaused(!isStagePaused);
  });
  window.addEventListener("resize", () => {
    if (currentStageState) applyStageLayoutForPhase(currentStageState.phase);
  });
  subscribeToStage(stageCode);
}
