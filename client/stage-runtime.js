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

function isElementParked(element, hiddenClass = "hidden", parkedClass = "text-hidden") {
  return element.classList.contains(hiddenClass) || element.classList.contains(parkedClass);
}

function stageTextVisualFor(object) {
  if (!object?.element) return null;
  if (!object.visual || object.visual.element !== object.element) {
    object.visual = visualAnimation.createCssVisualObject({
      element: object.element,
      hiddenClasses: ["text-hidden", "hidden"],
      motionHiddenClasses: ["text-hidden"],
      displayHiddenClasses: ["hidden"],
      updateClass: "text-update",
      instantClass: "text-instant",
      getVisible: () => object.visible === true || !isElementParked(object.element),
      setVisible: (isVisible) => {
        object.visible = isVisible;
        object.element.dataset.visualVisible = isVisible ? "true" : "false";
      },
      timerSink: (timerId) => textObjectTimers.push(timerId)
    });
  }
  return object.visual;
}

function isStageTextVisible(object) {
  return stageTextVisualFor(object)?.isVisible() === true;
}

function stageTextAnimationFor(isShown, wasVisible) {
  return visualAnimation.animationForVisibility(isShown, wasVisible);
}

function playStageTextVisual(object, animation, options = {}) {
  return stageTextVisualFor(object)?.play(animation, options) || 0;
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

function renderVotingCards(cards = []) {
  if (!votingCardLayer) return;
  votingCardLayer.classList.toggle("hidden", !cards.length);
  const desired = new Set((cards || []).map((card) => card.id));
  const existing = new Map(Array.from(votingCardLayer.querySelectorAll(".voting-card[data-card-id]")).map((el) => [el.dataset.cardId, el]));
  for (const cardData of cards || []) {
    let card = existing.get(cardData.id);
    if (!card) {
      card = document.createElement("article");
      card.className = "voting-card";
      card.dataset.cardId = cardData.id;
      card.innerHTML = `
        <div class="voting-card-author"></div>
        <div class="voting-card-answer"></div>
        <div class="voting-card-votes hidden"></div>
        <div class="voting-card-voters"></div>
      `;
      votingCardLayer.appendChild(card);
    }
    card.classList.toggle("is-winner", cardData.isWinner === true);
    card.classList.toggle("is-loser", cardData.isLoser === true);

    // Author reveal
    const authorEl = card.querySelector(".voting-card-author");
    authorEl.textContent = cardData.authorName || "";
    if (cardData.authorsRevealed === true) {
      requestAnimationFrame(() => authorEl.classList.add("is-revealed"));
    } else {
      authorEl.classList.remove("is-revealed");
    }

    // Answer text
    card.querySelector(".voting-card-answer").textContent = cardData.text || "";

    // Vote count badge
    const voteBadge = card.querySelector(".voting-card-votes");
    const voteCount = Number(cardData.voteCount || 0);
    voteBadge.classList.toggle("hidden", !cardData.votesRevealed);
    voteBadge.textContent = `${voteCount} vote${voteCount === 1 ? "" : "s"}`;

    // Voter badges (appear one by one via staggered CSS transition delay)
    const votersEl = card.querySelector(".voting-card-voters");
    const voters = cardData.votesRevealed ? (cardData.voters || []) : [];
    const existingBadges = Array.from(votersEl.querySelectorAll(".voting-card-voter-badge"));
    // Add missing badges
    voters.forEach((voter, i) => {
      let badge = existingBadges[i];
      if (!badge) {
        badge = document.createElement("span");
        badge.className = "voting-card-voter-badge";
        badge.style.transitionDelay = `${i * 80}ms`;
        badge.innerHTML = `
          <span class="voting-card-voter-avatar"></span>
          <span class="voting-card-voter-name"></span>
        `;
        votersEl.appendChild(badge);
      }
      if (badge.dataset.voterId && badge.dataset.voterId !== voter.id) {
        badge.classList.remove("is-revealed");
      }
      badge.dataset.voterId = voter.id || "";
      const avatarEl = badge.querySelector(".voting-card-voter-avatar");
      avatarEl.className = `voting-card-voter-avatar ${avatarClass(voter.avatar?.shape)}`;
      avatarEl.style.setProperty("--avatar-color", voter.avatar?.color || "#22d3ee");
      avatarEl.innerHTML = `${avatarFrameImage()}${dinoIcon(voter.avatar?.shape)}`;
      badge.querySelector(".voting-card-voter-name").textContent = voter.name || "Player";
      requestAnimationFrame(() => badge.classList.add("is-revealed"));
    });
    // Remove extra badges
    for (let i = voters.length; i < existingBadges.length; i++) existingBadges[i].remove();
  }
  for (const card of Array.from(votingCardLayer.querySelectorAll(".voting-card[data-card-id]"))) {
    if (!desired.has(card.dataset.cardId)) card.remove();
  }
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
  stageTextObjects = {};
  for (const element of stageBoard.querySelectorAll(".stage-text-object[id]")) {
    const target = normalizeTextTargetId(element.id);
    stageTextObjects[target] = { element, visible: false, text: "" };
  }
  stageTextObjects.presentation = stageTextObjects.stagepresentationtext || { element: stagePresentationText, visible: false, text: "" };
  stageTextObjects.prompt = stageTextObjects.stageprompttext || { element: stagePromptText, visible: false, text: "" };
  for (const target of Object.keys(stageTextObjects)) {
    setStageTextObject(target, { text: "", isShown: false, instant: true, complete: null });
  }
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

function resetStageObjects() {
  clearStageObjectTimers();
  clearStageAudioPlayers();
  window.clearInterval(craftingTimerInterval);
  craftingTimerInterval = null;
  craftingTimer?.classList.add("hidden");
  playerLobby.classList.remove("players-hidden", "players-instant");
  renderedPlayerAnswersShown = true;
  playerLobby.classList.remove("answers-hidden");
  renderedPointPopupIds.clear();
  initStageTextObjects();
  presentClickWidget.classList.add("hidden");
}

function setStageTextObject(target, options = {}) {
  const object = stageTextObjects[normalizeTextTargetId(target)] || stageTextObjects[target] || stageTextObjects.presentation;
  if (!object) return 0;
  const element = object.element;
  const nextText = options.text ?? object.text ?? "";
  const isShown = options.isShown !== false;
  const instant = options.instant === true;
  const wasVisible = isStageTextVisible(object);
  const animation = stageTextAnimationFor(isShown, wasVisible);
  if (nextText || isShown) element.textContent = nextText;
  if (object.layoutElement) applyStageLayoutTextProperties(element, object.layoutElement);
  element.classList.toggle("is-long", nextText.length > 62);
  element.classList.toggle("is-extra-long", nextText.length > 104);
  object.text = nextText;
  return playStageTextVisual(object, animation, { instant, complete: options.complete });
}

function renderCraftingTimer(timer) {
  window.clearInterval(craftingTimerInterval);
  craftingTimerInterval = null;
  if (!craftingTimer || !craftingTimerLabel || !timer?.shown) {
    craftingTimer?.classList.add("hidden");
    return;
  }
  const durationMs = Math.max(1, Number(timer.durationMs || 1));
  const clockOffset = (timer.serverNow || currentStageState?.serverNow || Date.now()) - Date.now();
  const update = () => {
    const now = Date.now() + clockOffset;
    const remainingMs = timer.running
      ? Math.max(0, Number(timer.endsAt || now) - now)
      : Math.max(0, Number(timer.remainingMs || 0));
    const progress = Math.max(0, Math.min(1, remainingMs / durationMs));
    craftingTimer.style.setProperty("--timer-progress", progress.toFixed(4));
    craftingTimerLabel.textContent = String(Math.ceil(remainingMs / 1000));
  };
  craftingTimer.classList.remove("hidden");
  update();
  if (timer.running) {
    craftingTimerInterval = window.setInterval(update, 100);
  }
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
  renderVotingCards(lobby.votingCards || []);
  renderCraftingTimer(lobby.craftingTimer);

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

function runStageAction(action, isPrimary, actionKey) {
  if (!action) return;
  if (isPrimary) scheduleSubActions(action, actionKey);
  if (action.type === "doNothing") {
    if (isPrimary) completeFlowAction("callback", action.id);
    return;
  }
  if (action.type === "playAudio" || action.type === "playHostAudio") {
    playStageAudioAction(action, isPrimary, actionKey);
    return;
  }
  if (action.type === "getRandomMultipleChoiceContent") {
    if (isPrimary) {
      completeFlowAction("callback", action.id);
    } else {
      applyFlowActionEffect(action.id);
    }
    return;
  }
  if (action.type === "prepareVotingCards") {
    if (isPrimary) {
      completeFlowAction("callback", action.id);
    } else {
      applyFlowActionEffect(action.id);
    }
    return;
  }
  if (action.type === "setVotingCardsShown") {
    if (isPrimary) {
      completeFlowAction("callback", action.id);
    } else {
      applyFlowActionEffect(action.id);
    }
    return;
  }
  if (action.type === "revealVotingResults" || action.type === "revealAuthors" || action.type === "revealVotes" || action.type === "revealWinningAnswer") {
    if (isPrimary) {
      completeFlowAction("callback", action.id);
    } else {
      applyFlowActionEffect(action.id);
    }
    return;
  }
  if (action.type === "revealPlayerAnswerCorrectness") {
    if (!isPrimary) {
      applyFlowActionEffect(action.id);
      return;
    }
    window.setTimeout(() => {
      if (renderedActionKey !== actionKey) return;
      completeFlowAction("callback", action.id);
    }, 250);
    return;
  }
  if (action.type === "showPoints") {
    if (!isPrimary) {
      applyFlowActionEffect(action.id);
      return;
    }
    window.setTimeout(() => {
      if (renderedActionKey !== actionKey) return;
      completeFlowAction("callback", action.id);
    }, 1500);
    return;
  }
  if (action.type === "givePendingPoints") {
    if (isPrimary) completeFlowAction("callback", action.id);
    else applyFlowActionEffect(action.id);
    return;
  }
  if (action.type === "setPlayersShown") {
    playerLobby.classList.toggle("players-hidden", action.isShown === false);
    playerLobby.classList.toggle("players-instant", action.instant === true);
    if (!isPrimary) applyFlowActionEffect(action.id);
    if (isPrimary) {
      const playerCount = playerLobby.querySelectorAll(".player-tile").length;
      const delayMs = action.instant ? 0 : 1000 + Math.max(0, playerCount - 1) * 45;
      playerVisibilityTimer = window.setTimeout(() => {
        if (renderedActionKey !== actionKey) return;
        completeFlowAction("callback", action.id);
      }, delayMs);
    }
    return;
  }
  if (action.type === "setPlayerAnswersShown") {
    const existingDuration = playerAnswerBubbleAnimationRemaining();
    const duration = action.playerFilter && action.playerFilter !== "all"
      ? (action.instant ? 0 : 500)
      : Math.max(
          setPlayerAnswerBubblesShown(action.isShown !== false, { instant: action.instant === true }),
          existingDuration
        );
    if (!isPrimary) applyFlowActionEffect(action.id);
    if (isPrimary) {
      window.setTimeout(() => {
        if (renderedActionKey !== actionKey) return;
        completeFlowAction("callback", action.id);
      }, duration);
    }
    return;
  }
  if (action.type === "setTimerShown" || action.type === "startCraftingTimer") {
    if (isPrimary) {
      completeFlowAction("callback", action.id);
    } else {
      applyFlowActionEffect(action.id);
    }
    return;
  }
  if (action.type === "present" || action.type === "displayText") {
    const target = action.textTarget || "presentation";
    setStageTextObject(target, {
      text: action.text || "",
      isShown: action.isShown !== false,
      instant: action.instant === true,
      complete: isPrimary && action.type === "displayText"
        ? () => {
            if (renderedActionKey !== actionKey) return;
            completeFlowAction("callback", action.id);
          }
        : null
    });
    return;
  }
  if (!isPrimary && action.type === "transition") {
    runStageWipe(() => {});
    return;
  }
  if (action.type === "transitionState" && isPrimary) {
    completeFlowAction("callback", action.id);
    return;
  }
  if (action.type === "text" && isPrimary) {
    completeFlowAction("callback", action.id);
  }
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
  stream.addEventListener("error", () => {
    waitingStatus.classList.remove("hidden");
    waitingStatus.textContent = "Reconnecting to lobby";
  });
}

function setupStage() {
  stageScreen.classList.remove("hidden");
  initStageTextObjects();
  loadArtAssets().then(() => {
    if (currentStageState) renderStageLobby(currentStageState);
  }).catch(() => {});
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
