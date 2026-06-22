function playerTileSignature(player) {
  return JSON.stringify({
    name: player.name,
    avatar: player.avatar || {},
    isVip: player.isVip === true
  });
}

function applyAnswerBubbleTextFit(bubble, text) {
  const length = String(text || "").length;
  const fontSize = length > 72 ? 14 : length > 52 ? 16 : length > 34 ? 19 : length > 22 ? 23 : 28;
  bubble.style.fontSize = `${fontSize}px`;
  bubble.classList.toggle("is-long", length > 14);
}

let stageTextControllerInstance = null;
let craftingTimerControllerInstance = null;

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

function answerBubbleVisualFor(bubble) {
  return visualAnimation.createCssVisualObject({
    element: bubble,
    hiddenClasses: ["is-hidden"],
    motionHiddenClasses: ["is-hidden"],
    exitingClass: "is-exiting",
    updateClass: "is-updating",
    instantClass: "is-instant",
    getVisible: () => !bubble.classList.contains("is-hidden") && !bubble.classList.contains("is-exiting"),
    setVisible: (isVisible) => {
      bubble.dataset.visualVisible = isVisible ? "true" : "false";
    }
  });
}

function isBubbleVisible(bubble) {
  return answerBubbleVisualFor(bubble).isVisible();
}

function playAnswerBubbleVisual(bubble, animation, options = {}) {
  return answerBubbleVisualFor(bubble).play(animation, options);
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

function createPlayerTile(player, playerIndex, signature) {
  const tile = document.createElement("article");
  tile.className = "player-tile";
  tile.classList.toggle("needs-input", player.needsInput === true);
  tile.dataset.playerId = player.id;
  tile.dataset.signature = signature;
  tile.style.setProperty("--player-index", playerIndex);
  tile.innerHTML = `
    <div class="player-avatar ${avatarClass(player.avatar?.shape)}" style="--avatar-color:${player.avatar?.color || "#22d3ee"}">${avatarFrameImage()}${dinoIcon(player.avatar?.shape)}</div>
    <div class="player-name"></div>
    ${player.isVip ? '<div class="vip-badge">VIP</div>' : ""}
  `;
  tile.querySelector(".player-name").textContent = player.name;
  syncPlayerAnswerBubble(tile, player, { instant: true });
  return tile;
}

function syncPlayerAnswerBubble(tile, player, options = {}) {
  const displayedAnswer = player.displayedAnswer || null;
  const answerText = displayedAnswer?.text || "";
  const answerNonce = String(displayedAnswer?.nonce || "");
  const answerHidden = displayedAnswer?.hidden === true;
  let bubble = tile.querySelector(".player-answer-bubble");
  if (!answerText || answerHidden) {
    if (bubble) {
      const bubbleToRemove = bubble;
      bubble.dataset.answerHidden = "true";
      const duration = playAnswerBubbleVisual(bubble, isBubbleVisible(bubble) ? "disappear" : "park", options);
      const removalToken = bubble.dataset.visualAnimationToken || "";
      const removeBubble = () => {
        if (bubbleToRemove.parentElement && bubbleToRemove.dataset.visualAnimationToken === removalToken) bubbleToRemove.remove();
      };
      if (duration > 0) window.setTimeout(removeBubble, duration);
      else removeBubble();
    }
    return 0;
  }

  const hadBubble = Boolean(bubble);
  const previousNonce = bubble?.dataset.answerNonce || "";
  const previousText = bubble?.dataset.answerText || "";
  if (!bubble) {
    bubble = document.createElement("div");
    bubble.className = "player-answer-bubble is-hidden";
    tile.insertBefore(bubble, tile.firstChild);
  }

  bubble.textContent = answerText;
  bubble.dataset.answerNonce = answerNonce;
  bubble.dataset.answerText = answerText;
  bubble.dataset.answerHidden = "false";
  bubble.classList.toggle("is-correct", displayedAnswer?.correct === true);
  bubble.classList.toggle("is-wrong", displayedAnswer?.correct === false);
  applyAnswerBubbleTextFit(bubble, answerText);

  if (renderedPlayerAnswersShown === false) {
    return playAnswerBubbleVisual(bubble, "park", { instant: true });
  }

  if (!hadBubble || !isBubbleVisible(bubble)) {
    return playAnswerBubbleVisual(bubble, "appear", options);
  }
  if (previousNonce !== answerNonce || previousText !== answerText) {
    return playAnswerBubbleVisual(bubble, "update", options);
  }
  return 0;
}

function setPlayerAnswerBubblesShown(isShown, options = {}) {
  const instant = options.instant === true;
  const remainingDuration = playerAnswerBubbleAnimationRemaining();
  const wasShown = renderedPlayerAnswersShown !== false;
  renderedPlayerAnswersShown = isShown;
  playerLobby.classList.toggle("answers-hidden", !isShown);
  const bubbles = Array.from(playerLobby.querySelectorAll(".player-answer-bubble"));
  if (!bubbles.length) {
    playerAnswerBubbleAnimationEndsAt = 0;
    return 0;
  }
  if (!instant && wasShown === isShown && remainingDuration > 0) {
    return remainingDuration;
  }
  let duration = 0;
  if (isShown) {
    for (const bubble of bubbles) {
      if (bubble.dataset.answerHidden === "true") continue;
      if (!isBubbleVisible(bubble)) {
        duration = Math.max(duration, playAnswerBubbleVisual(bubble, "appear", { instant }));
      }
    }
  } else {
    for (const bubble of bubbles) {
      const animation = isBubbleVisible(bubble) ? "disappear" : "park";
      duration = Math.max(duration, playAnswerBubbleVisual(bubble, animation, { instant }));
    }
  }
  playerAnswerBubbleAnimationEndsAt = duration > 0 ? Date.now() + duration : 0;
  return duration;
}

function playerAnswerBubbleAnimationRemaining() {
  return Math.max(0, playerAnswerBubbleAnimationEndsAt - Date.now());
}

function renderStagePlayers(players) {
  const existingTiles = new Map(Array.from(playerLobby.querySelectorAll(".player-tile[data-player-id]")).map((tile) => [tile.dataset.playerId, tile]));
  const desiredIds = new Set(players.map((player) => player.id));
  let cursor = playerLobby.firstElementChild;
  players.forEach((player, playerIndex) => {
    const signature = playerTileSignature(player);
    const existing = existingTiles.get(player.id);
    const tile = existing?.dataset.signature === signature
      ? existing
      : createPlayerTile(player, playerIndex, signature);
    tile.classList.toggle("needs-input", player.needsInput === true);
    tile.style.setProperty("--player-index", playerIndex);
    if (existing && existing !== tile) {
      if (existing === cursor) cursor = existing.nextElementSibling;
      existing.remove();
    }
    const isNewTile = tile !== existing;
    if (tile === cursor) {
      cursor = cursor.nextElementSibling;
    } else {
      playerLobby.insertBefore(tile, cursor);
    }
    if (!isNewTile) syncPlayerAnswerBubble(tile, player);
  });
  Array.from(playerLobby.querySelectorAll(".player-tile[data-player-id]")).forEach((tile) => {
    if (!desiredIds.has(tile.dataset.playerId)) tile.remove();
  });
}

function renderPointPopups(popups = []) {
  for (const popup of popups || []) {
    if (!popup?.id || renderedPointPopupIds.has(popup.id)) continue;
    const tile = playerLobby.querySelector(`.player-tile[data-player-id="${CSS.escape(popup.playerId)}"]`);
    if (!tile) continue;
    renderedPointPopupIds.add(popup.id);
    const node = document.createElement("div");
    node.className = "point-popup";
    node.textContent = `+${Math.max(0, Math.floor(Number(popup.points || 0)))}`;
    tile.appendChild(node);
    window.setTimeout(() => node.remove(), 1600);
  }
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
  window.clearTimeout(stageWipeTimer);
  window.clearTimeout(stageWipeHideTimer);
  stageWipe.classList.remove("hidden", "is-running");
  void stageWipe.offsetWidth;
  stageWipe.classList.add("is-running");
  stageWipeTimer = window.setTimeout(onCovered, 420);
  stageWipeHideTimer = window.setTimeout(() => {
    stageWipe.classList.add("hidden");
    stageWipe.classList.remove("is-running");
  }, 1120);
}

function cancelStageWipe() {
  window.clearTimeout(stageWipeTimer);
  window.clearTimeout(stageWipeHideTimer);
  stageWipe.classList.add("hidden");
  stageWipe.classList.remove("is-running");
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
  window.clearTimeout(playerVisibilityTimer);
  for (const timerId of subActionTimers) window.clearTimeout(timerId);
  for (const timerId of textObjectTimers) window.clearTimeout(timerId);
  subActionTimers = [];
  textObjectTimers = [];
}

function clearStageActionTimers() {
  window.clearTimeout(playerVisibilityTimer);
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

function setCraftingTimerVisible(isShown, options = {}) {
  return craftingTimerController()?.setVisible(isShown, options) || 0;
}

function setCraftingTimerShownForAction(action, options = {}) {
  return craftingTimerController()?.setShownForAction(action, options) || 0;
}

function resetStageObjects() {
  clearStageObjectTimers();
  clearStageAudioPlayers();
  craftingTimerController()?.reset();
  playerLobby.classList.remove("players-hidden", "players-instant");
  renderedPlayerAnswersShown = true;
  playerLobby.classList.remove("answers-hidden");
  renderedPointPopupIds.clear();
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
  if (!stageDebugAction) return;
  const phase = lobby.phase || "lobby";
  const debug = lobby.debugAction || null;
  if (phase === "lobby" || phase === "starting" || !debug) {
    stageDebugAction.classList.add("hidden");
    stageDebugAction.textContent = "";
    return;
  }
  const phaseName = debug.phaseName || phase;
  const actionName = debug.actionName || debug.actionId || "No Action";
  const actionType = debug.actionType ? ` / ${debug.actionType}` : "";
  const parts = [`${phaseName}: ${actionName}${actionType}`];
  const required = Number(debug.requiredInputCount || 0);
  const submitted = Number(debug.submittedInputCount || 0);
  if (required > 0 && (debug.actionType || "").includes("Input")) {
    parts.push(`input ${submitted}/${required}`);
  }
  const records = Number(debug.playerAnswerRecordCount || 0);
  if (records > 0) parts.push(`answers ${records}`);
  const storedRounds = Number(debug.storedAnswerRoundCount || 0);
  const storedCurrent = Number(debug.storedAnswerCurrentRoundCount || 0);
  if (storedRounds > 0 || storedCurrent > 0) parts.push(`stored r${storedRounds} cur${storedCurrent}`);
  const cards = Number(debug.votingCardCount || 0);
  const visibleCards = Number(debug.visibleVotingCardCount || 0);
  const preparedCards = Number(debug.lastPreparedVotingCardCount || 0);
  if (cards > 0 || preparedCards > 0 || debug.actionType === "prepareVotingCards" || debug.actionType === "setVotingCardsShown" || debug.actionType === "voteOnAnswersInput") {
    parts.push(`cards ${visibleCards}/${cards} prepared ${preparedCards}`);
  }
  const skippedCards = Number(debug.lastVotingPrepareSkippedCount || 0);
  if (skippedCards > 0) parts.push(`skipped ${skippedCards}`);
  stageDebugAction.textContent = parts.join(" · ");
  stageDebugAction.classList.remove("hidden");
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
  if (stageDebugAlert && lobby.lastDecisionTrace?.selectedTarget !== "none") stageDebugAlert.classList.add("hidden");
  renderStagePlayers(players);
  playerLobby.classList.toggle("players-hidden", lobby.playersShown === false);
  const nextAnswersShown = lobby.playerAnswersShown !== false;
  const answersAreStillAnimating = playerAnswerBubbleAnimationRemaining() > 0;
  const hasParkedShownBubbles = nextAnswersShown && Boolean(playerLobby.querySelector(".player-answer-bubble.is-hidden, .player-answer-bubble.is-exiting"));
  setPlayerAnswerBubblesShown(nextAnswersShown, { instant: renderedPlayerAnswersShown === nextAnswersShown && !answersAreStillAnimating && !hasParkedShownBubbles });
  renderPointPopups(lobby.pendingPointPopups || []);
  renderVotingCards(lobby.votingCards || [], votingCardRenderOptions(lobby));
  renderCraftingTimer(lobby.craftingTimer, { instant: action?.type === "setTimerShown" && action.instant === true });

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

  if (phase === "lobby") {
    resetStageObjects();
  }
  applyStageLayoutForPhase(phase);
}

function renderStageLobby(lobby) {
  const nextPhase = lobby.phase || "lobby";
  const actionKey = `${nextPhase}:${lobby.action?.id || lobby.action?.index || ""}:${lobby.action?.type || ""}`;
  const isNewAction = renderedActionKey !== actionKey;
  const haltedByDecision = lobby.lastDecisionTrace?.selectedTarget === "none";
  const shouldWipeToIntro = renderedStagePhase && renderedStagePhase !== "intro" && nextPhase === "intro";
  const isNewPhase = renderedStagePhase && renderedStagePhase !== nextPhase;
  if (isNewPhase) {
    clearStageAudioPlayers();
    renderedPointPopupIds.clear();
    playerLobby.querySelectorAll(".point-popup").forEach((node) => node.remove());
    renderVotingCards([]);
  }
  renderedStagePhase = nextPhase;
  if (isNewAction) prepareNewStageAction(lobby, actionKey);
  if (haltedByDecision) {
    cancelStageWipe();
    if (stageDebugAlert) {
      stageDebugAlert.textContent = `No Matching Branch: ${lobby.lastDecisionTrace?.actionId || "Unknown Action"}`;
      stageDebugAlert.classList.remove("hidden");
    }
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
      playerLobby,
      runStageWipe,
      setCraftingTimerShownForAction,
      setPlayerAnswerBubblesShown,
      setPlayerVisibilityTimer: (timerId) => {
        playerVisibilityTimer = timerId;
      },
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

async function advancePresentation() {
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
    const result = await postJson("/api/advance-presentation", {
      stageCode: currentStageState.stageCode,
      actionId: action.id,
      source: "callback"
    });
    if (result.lobby) renderStageLobby(result.lobby);
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
  stageScreen.addEventListener("click", advancePresentation);
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
