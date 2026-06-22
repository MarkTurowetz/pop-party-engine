let stageTextControllerInstance = null;
let craftingTimerControllerInstance = null;
let playerAnswerBubbleControllerInstance = null;
let playerRosterRendererInstance = null;
let stageDebugPanelInstance = null;
let stageWipeControllerInstance = null;

function stageVisualControllers() {
  return window.PartyGameStageVisualControllers || null;
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
      getRenderedActionKey: () => renderedActionKey,
      getCurrentStageState: () => currentStageState,
      fallbackDurationMs: () => Math.max(1, Number(gameConstants.craftingTimerDuration || 30)) * 1000
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
      avatarClass,
      avatarFrameImage,
      dinoIcon,
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

function stageWipeController() {
  if (!stageWipeControllerInstance && window.PartyGameStageWipe) {
    stageWipeControllerInstance = window.PartyGameStageWipe.createController({
      element: stageWipe,
      visualAnimation
    });
  }
  return stageWipeControllerInstance;
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
    actionKey: renderedActionKey,
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
  presentClickWidget.classList.add("hidden");
}

function setStageTextObject(target, options = {}) {
  return stageTextController()?.set(target, options) || 0;
}

function renderCraftingTimer(timer, options = {}) {
  return craftingTimerController()?.render(timer, options) || 0;
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

function applyStageState(lobby) {
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
  stageCodeText.textContent = lobby.stageCode || stageCodeText.textContent;
  const stageCodeBadgeValue = stageCodeBadge.querySelector("strong");
  if (stageCodeBadgeValue) stageCodeBadgeValue.textContent = lobby.stageCode || stageCodeBadgeValue.textContent;
  stageCodeBadgeRoot.classList.toggle("hidden", isLobbyPhase);
  window.clearInterval(stageCountdownTimer);
  startPopup.classList.add("hidden");
  stageMain.classList.toggle("hidden", !isLobbyPhase);
  stageFooter.classList.remove("hidden");
  stageIntroContent.classList.toggle("hidden", phase !== "intro");
  stageIntroTitle.textContent = "GAME INTRO";
  presentClickWidget.classList.toggle("hidden", !(action?.type === "present" && action?.timing?.mode !== "S+"));
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

  const vip = players.find((player) => player.isVip);
  joinPrompt.classList.toggle("hidden", !isLobbyPhase);
  waitingStatus.classList.toggle("hidden", phase === "intro" || players.length === 0);
  waitingStatus.textContent = vip ? `Waiting for ${vip.name} to start the game` : "";

  if (phase === "starting") {
    countdownClockOffset = (lobby.serverNow || Date.now()) - Date.now();
    waitingStatus.classList.remove("hidden");
    waitingStatus.textContent = "Tap CANCEL to stop";
    startPopup.classList.remove("hidden");
    const updateCountdown = () => {
      const now = Date.now() + countdownClockOffset;
      const remainingMs = Math.max(0, (lobby.countdownEndsAt || now) - now);
      const seconds = Math.ceil(remainingMs / 1000);
      startPopup.classList.toggle("is-go", seconds <= 0);
      startPopup.innerHTML = seconds > 0
        ? `<span class="countdown-kicker">Starting in</span><span class="countdown-number">${seconds}</span>`
        : `<span class="countdown-go">Let's Go</span>`;
    };
    updateCountdown();
    stageCountdownTimer = window.setInterval(updateCountdown, 100);
  }

  if (phase === "lobby" && lobby.lobbyFlowActive !== true) {
    resetStageObjects();
  }
  applyStageLayoutForPhase(phase);
}

function renderStageLobby(lobby) {
  const nextPhase = lobby.phase || "lobby";
  const actionKey = `${nextPhase}:${lobby.action?.id || lobby.action?.index || ""}:${lobby.action?.type || ""}`;
  const isNewAction = renderedActionKey !== actionKey;
  const haltedByDecision = lobby.lastDecisionTrace?.selectedTarget === "none";
  const currentActionIsWipeControl = lobby.action?.type === "setWipeShown";
  const shouldWipeToIntro = renderedStagePhase
    && renderedStagePhase !== "intro"
    && nextPhase === "intro"
    && lobby.wipeShown !== true
    && !currentActionIsWipeControl;
  const isNewPhase = renderedStagePhase && renderedStagePhase !== nextPhase;
  if (isNewPhase) {
    clearStageAudioPlayers();
    playerRosterRenderer()?.clearPointPopups();
    renderVotingCards([]);
  }
  renderedStagePhase = nextPhase;
  if (isNewAction) prepareNewStageAction(lobby, actionKey);
  if (haltedByDecision) {
    cancelStageWipe();
    showStageDecisionHalt(lobby);
    renderedActionKey = actionKey;
    applyStageState({ ...lobby, action: null });
    return;
  }
  if (lobby.action?.type === "transition" && isNewAction) {
    renderedActionKey = actionKey;
    scheduleSubActions(lobby.action, actionKey);
    runStageWipe(() => {
      applyStageState(lobby);
      completeFlowAction("callback", lobby.action.id);
    });
    return;
  }
  renderedActionKey = actionKey;
  if (shouldWipeToIntro) {
    runStageWipe(() => {
      applyStageState(lobby);
      if (isNewAction) runStageAction(lobby.action, true, actionKey);
    });
    return;
  }
  applyStageState(lobby);
  if (isNewAction) runStageAction(lobby.action, true, actionKey);
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
    if (renderedActionKey !== actionKey) return;
    completeFlowAction("startTimer", action.id);
  }, delayMs);
}

function scheduleSubActions(action, actionKey) {
  for (const subAction of action?.subActions || []) {
    const delayMs = Math.max(0, Number(subAction.timing?.seconds || 0) * 1000);
    if (delayMs === 0) {
      if (renderedActionKey === actionKey) runStageAction(subAction, false, actionKey);
      continue;
    }
    const timerId = window.setTimeout(() => {
      if (renderedActionKey !== actionKey) return;
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
    if (!wasInterrupted && isPrimary && renderedActionKey === actionKey && action.timing?.mode !== "S+") {
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
      isCurrentActionKey: (actionKey) => renderedActionKey === actionKey,
      playStageAudioAction,
      playerAnswerBubbleAnimationRemaining,
      runStageWipe,
      setCraftingTimerShownForAction,
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
    waitingStatus.classList.remove("hidden");
    waitingStatus.textContent = "Reconnecting to lobby";
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
  try {
    const result = await postJson("/api/complete-action", {
      stageCode: currentStageState.stageCode,
      actionId,
      source
    });
    if (result.lobby) renderStageLobby(result.lobby);
  } catch (error) {
    waitingStatus.classList.remove("hidden");
    waitingStatus.textContent = error.message;
  }
}

async function applyFlowActionEffect(actionId) {
  const stageCode = currentStageCodeForRuntimeTest();
  if (!stageCode || !actionId) return;
  try {
    const result = await postJson("/api/action-effect", { stageCode, actionId });
    if (result.lobby) renderStageLobby(result.lobby);
  } catch (error) {
    waitingStatus.classList.remove("hidden");
    waitingStatus.textContent = error.message;
  }
}

function currentStageCodeForRuntimeTest() {
  return currentStageState?.stageCode || normalizeStageCode(stageCodeText.textContent);
}

async function applyRuntimeTestMessage(message) {
  if (!message || message.type !== "runtime-test-config") return;

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
    waitingStatus.classList.remove("hidden");
    waitingStatus.textContent = error.message;
  }
}

async function applyControllerRuntimeTestMessage(message) {
  if (!message || message.type !== "runtime-test-config") return;
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

function setStagePaused(isPaused) {
  isStagePaused = isPaused;
  pauseMenu.classList.toggle("hidden", !isPaused);
}

async function quitStageToLobby() {
  if (!currentStageState?.stageCode) return;
  resetStageObjects();
  setStagePaused(false);
  try {
    const result = await postJson("/api/quit-to-lobby", {
      stageCode: currentStageState.stageCode
    });
    if (result.lobby) renderStageLobby(result.lobby);
  } catch (error) {
    waitingStatus.classList.remove("hidden");
    waitingStatus.textContent = error.message;
  }
}

function subscribeToStage(stageCode) {
  if (!canUseServer) {
    waitingStatus.classList.remove("hidden");
    waitingStatus.textContent = "Open through the server to host a lobby";
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
    waitingStatus.classList.remove("hidden");
    waitingStatus.textContent = "Reconnecting to lobby";
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
  stageCodeText.textContent = stageCode;
  stageCodeBadge.textContent = stageCode;
  clearRuntimeTestConfigForStage(stageCode);
  runtimeTestChannel?.addEventListener("message", (event) => {
    applyRuntimeTestMessage(event.data);
  });
  stageScreen.addEventListener("click", handleStageScreenClick);
  pauseMenu.addEventListener("click", (event) => event.stopPropagation());
  returnToGameButton.addEventListener("click", () => setStagePaused(false));
  quitToLobbyButton.addEventListener("click", quitStageToLobby);
  window.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    setStagePaused(!isStagePaused);
  });
  window.addEventListener("resize", () => {
    if (currentStageState) applyStageLayoutForPhase(currentStageState.phase);
  });
  subscribeToStage(stageCode);
}
