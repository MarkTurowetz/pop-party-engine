function updateJoinButton() {
  const hasStage = normalizeStageCode(stageCodeInput.value).length > 0;
  const hasName = playerNameInput.value.trim().length > 0;
  joinButton.disabled = !(hasStage && hasName);
}

async function joinController(stageCode, playerName) {
  const playerId = getControllerPlayerId();
  joinButton.disabled = true;
  const result = await postJson("/api/join", { stageCode, playerName, playerId });
  enterControllerLobby(stageCode, result.player.id, result.lobby, result.player);
  return result;
}

function setControllerAvatar(player) {
  controllerAvatar.className = `controller-avatar ${avatarClass(player.avatar?.shape)}`;
  controllerAvatar.style.setProperty("--avatar-color", player.avatar?.color || "#22d3ee");
  controllerAvatar.innerHTML = `${avatarFrameImage()}${dinoIcon(player.avatar?.shape)}`;
  setControllerPlayerBanner(player);
}

function setControllerPlayerBanner(player) {
  if (!player || !controllerPlayerBanner) return;
  controllerPlayerBannerName.textContent = player.name || "Player";
  controllerPlayerBannerAvatar.className = `player-avatar ${avatarClass(player.avatar?.shape)}`;
  controllerPlayerBannerAvatar.style.setProperty("--avatar-color", player.avatar?.color || "#22d3ee");
  controllerPlayerBannerAvatar.innerHTML = `${avatarFrameImage()}${dinoIcon(player.avatar?.shape)}`;
}

function renderAvatarPicker() {
  if (!controllerState?.player) return;
  const currentShape = controllerState.player.avatar?.shape || "rex";
  const currentColor = controllerState.player.avatar?.color || "#22d3ee";
  pendingAvatarShape = pendingAvatarShape || currentShape;
  avatarPickerGrid.replaceChildren();
  for (const composite of avatarComposites) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "avatar-choice";
    button.classList.toggle("is-selected", composite.species === pendingAvatarShape);
    button.style.setProperty("--avatar-color", currentColor);
    button.innerHTML = `
      <span class="avatar-choice-icon">${avatarFrameImage()}${dinoIcon(composite.species)}</span>
      <span class="avatar-choice-label"></span>
    `;
    button.querySelector(".avatar-choice-label").textContent = avatarLabel(composite.species);
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      pendingAvatarShape = composite.species;
      renderAvatarPicker();
    });
    avatarPickerGrid.appendChild(button);
  }
}

function openAvatarPicker() {
  if (!controllerState?.player) return;
  pendingAvatarShape = controllerState.player.avatar?.shape || "rex";
  avatarPickerOpen = true;
  renderAvatarPicker();
  avatarPicker.classList.remove("hidden");
}

async function closeAvatarPicker({ commit = true } = {}) {
  if (!avatarPickerOpen) return;
  avatarPickerOpen = false;
  avatarPicker.classList.add("hidden");
  if (!commit || !controllerState?.player) return;
  if (!pendingAvatarShape || pendingAvatarShape === controllerState.player.avatar?.shape) return;
  try {
    const result = await postJson("/api/avatar", {
      stageCode: controllerState.stageCode,
      playerId: controllerState.playerId,
      shape: pendingAvatarShape
    });
    if (result.player) {
      controllerState.player = result.player;
      setControllerAvatar(result.player);
    }
    if (result.lobby) renderControllerState(result.lobby);
  } catch (error) {
    controllerMeta.textContent = error.message;
  }
}

function hideControllerViews() {
  joinState.classList.add("hidden");
  controllerLobbyState.classList.add("hidden");
  controllerIntroState.classList.add("hidden");
  controllerChoiceState.classList.add("hidden");
  controllerTextState.classList.add("hidden");
  introPresentButton.classList.add("hidden");
}

function renderControllerChoiceState(lobby, me) {
  const input = me.input || lobby.input || null;
  if (!input) return false;
  hideControllerViews();
  controllerChoiceState.classList.remove("hidden");
  controllerChoicePrompt.textContent = input.prompt || "Answer this question by tapping an answer";
  controllerChoiceGrid.replaceChildren();
  const selectedIndex = Number.isFinite(Number(me.answer?.optionIndex)) ? Number(me.answer.optionIndex) : -1;
  const isDone = input.mode === "submitOnce" && me.answer?.done === true;
  controllerChoiceDone.classList.toggle("hidden", !isDone);
  controllerChoiceGrid.classList.toggle("hidden", isDone);
  if (isDone) {
    controllerChoiceDone.textContent = `You chose: ${me.answer?.text || ""}`;
  }
  const visibleOptions = (input.options || []).filter((option) => input.type !== "vote" || option.authorPlayerId !== me.id);
  for (const option of visibleOptions) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "choice-option-button";
    button.dataset.controllerOption = "";
    button.dataset.optionId = `choice.${option.index}`;
    button.classList.toggle("is-selected", Number(option.index) === selectedIndex);
    button.textContent = option.label || option.text || `Option ${Number(option.index) + 1}`;
    button.disabled = isDone;
    button.addEventListener("click", () => submitControllerChoice(input.actionId, Number(option.index), option.cardId || ""));
    bindButtonPress(button);
    controllerChoiceGrid.appendChild(button);
  }
  applyControllerLayoutForPhase(lobby.phase || "lobby");
  return true;
}

async function submitControllerChoice(actionId, optionIndex, cardId = "") {
  if (!controllerState) return;
  try {
    const result = await postJson("/api/controller-choice", {
      stageCode: controllerState.stageCode,
      playerId: controllerState.playerId,
      actionId,
      optionIndex,
      cardId
    });
    if (result.lobby) renderControllerState(result.lobby);
  } catch (error) {
    controllerChoicePrompt.textContent = error.message;
  }
}

function renderControllerTextState(lobby, me) {
  const input = lobby.textInput || null;
  if (!input) return false;
  hideControllerViews();
  controllerState.phaseActionId = input.actionId;
  controllerTextState.classList.remove("hidden");
  controllerTextPrompt.textContent = input.prompt || "Write your answer";
  controllerInvalidBanner.textContent = "Your submission was invalid";
  controllerTextInput.placeholder = input.placeholder || "Answer here";
  const limit = Number(input.characterLimit || 0);
  if (limit > 0) {
    controllerTextInput.maxLength = limit;
  } else {
    controllerTextInput.removeAttribute("maxlength");
  }
  const isDone = me.answer?.done === true;
  const isInvalid = me.answer?.invalid === true;
  const invalidKey = `${input.actionId}:${me.answer?.nonce || 0}`;
  const showInvalid = isInvalid && dismissedTextInvalidKey !== invalidKey;
  controllerTextDone.classList.toggle("hidden", !isDone);
  controllerTextInput.classList.toggle("hidden", isDone);
  controllerTextSubmitButton.classList.toggle("hidden", isDone);
  controllerInvalidBanner.classList.toggle("hidden", !showInvalid || isDone);
  if (isDone) {
    controllerTextDone.textContent = `You wrote: ${me.answer?.text || ""}`;
  } else if (showInvalid) {
    controllerTextInput.value = "";
  }
  controllerTextSubmitButton.disabled = controllerTextInput.value.trim().length === 0;
  controllerTextSubmitButton.onclick = () => submitControllerText(input.actionId);
  applyControllerLayoutForPhase(lobby.phase || "lobby");
  controllerTextDone.classList.toggle("hidden", !isDone);
  controllerTextInput.classList.toggle("hidden", isDone);
  controllerTextSubmitButton.classList.toggle("hidden", isDone);
  controllerInvalidBanner.classList.toggle("hidden", !showInvalid || isDone);
  return true;
}

async function submitControllerText(actionId) {
  if (!controllerState) return;
  const text = controllerTextInput.value;
  if (!text.trim()) return;
  controllerTextSubmitButton.disabled = true;
  try {
    const result = await postJson("/api/controller-text-submit", {
      stageCode: controllerState.stageCode,
      playerId: controllerState.playerId,
      actionId,
      text
    });
    if (result.lobby) renderControllerState(result.lobby);
  } catch (error) {
    controllerInvalidBanner.textContent = error.message;
    controllerInvalidBanner.classList.remove("hidden");
    controllerTextInput.value = "";
    controllerTextSubmitButton.disabled = true;
  }
}

function renderControllerState(lobby) {
  if (!controllerState) return;
  controllerState.lobby = lobby;
  window.clearInterval(controllerCountdownTimer);
  const me = (lobby.players || []).find((player) => player.id === controllerState.playerId);
  if (!me) {
    closeAvatarPicker({ commit: false });
    controllerState.startToken = "";
    controllerMeta.textContent = "Reconnecting to lobby";
    hideControllerViews();
    introPresentButton.classList.add("hidden");
    controllerLobbyState.classList.remove("hidden");
    startGameButton.classList.add("hidden");
    return;
  }
  controllerState.player = me;
  setControllerPlayerBanner(me);
  controllerState.startToken = me.isVip ? lobby.startToken : "";
  if (!avatarPickerOpen) pendingAvatarShape = me.avatar?.shape || "";

  const controllerPhase = lobby.phase || "lobby";
  controllerState.phase = controllerPhase;
  const controllerInput = me.input || lobby.input || null;
  if (controllerInput?.type || controllerInput?.options?.length) {
    closeAvatarPicker({ commit: false });
    if (renderControllerChoiceState(lobby, me)) return;
  }
  if (lobby.textInput?.actionId) {
    closeAvatarPicker({ commit: false });
    if (renderControllerTextState(lobby, me)) return;
  }
  if (controllerPhase !== "lobby" && controllerPhase !== "starting") {
    closeAvatarPicker({ commit: false });
    hideControllerViews();
    controllerIntroState.classList.toggle("hidden", controllerPhase !== "intro");
    introPresentButton.classList.toggle("hidden", !(me.isVip && controllerPhase === "intro"));
    introPresentButton.disabled = !(me.isVip && controllerPhase === "intro");
    applyControllerLayoutForPhase(controllerPhase);
    return;
  }

  hideControllerViews();
  introPresentButton.classList.add("hidden");
  controllerLobbyState.classList.remove("hidden");
  controllerPlayerName.textContent = me.name;
  setControllerAvatar(me);
  controllerMeta.textContent = me.isVip ? "VIP Player" : "Waiting for the VIP";
  startGameButton.classList.toggle("hidden", !me.isVip);
  startGameButton.classList.toggle("danger-button", controllerPhase === "starting");
  startGameButton.textContent = controllerPhase === "starting" ? "Cancel" : "Start Game";
  startGameButton.dataset.optionId = controllerPhase === "starting" ? "lobby.cancelStart" : "lobby.startGame";
  startGameButton.disabled = !me.isVip;
  applyControllerLayoutForPhase(controllerPhase);

  if (me.isVip && controllerPhase === "starting") {
    controllerClockOffset = (lobby.serverNow || Date.now()) - Date.now();
    const updateCancelButton = () => {
      const now = Date.now() + controllerClockOffset;
      const cancelLocked = now >= (lobby.countdownEndsAt || now);
      startGameButton.disabled = cancelLocked;
      if (cancelLocked) {
        startGameButton.classList.remove("is-pressed", "is-releasing");
      }
    };
    updateCancelButton();
    controllerCountdownTimer = window.setInterval(updateCancelButton, 50);
  }
}

function reloadControllerArtAssets() {
  loadArtAssets().then(() => {
    if (controllerState?.player) setControllerAvatar(controllerState.player);
    if (controllerState?.lobby) renderControllerState(controllerState.lobby);
  }).catch(() => {});
}

async function heartbeat() {
  if (!controllerState) return;
  try {
    const result = await postJson("/api/heartbeat", {
      stageCode: controllerState.stageCode,
      playerId: controllerState.playerId
    });
    renderControllerState(result.lobby);
  } catch (error) {
    if (error.code === "KICKED_TO_LOBBY") {
      window.clearInterval(heartbeatTimer);
      controllerState = null;
      closeAvatarPicker({ commit: false });
      hideControllerViews();
      joinState.classList.remove("hidden");
      applyControllerLayoutForPhase("join");
      joinButton.disabled = false;
      return;
    }
    controllerMeta.textContent = "Reconnecting to lobby";
  }
}

function enterControllerLobby(stageCode, playerId, lobby, player) {
  controllerState = { stageCode, playerId, player };
  setSessionValue("partyTemplatePlayerId", playerId);
  setSessionValue("partyTemplatePlayerName", player.name);
  setSessionValue("partyTemplateStageCode", stageCode);
  setLocalValue("partyTemplateStageCode", stageCode);
  joinState.classList.add("hidden");
  controllerLobbyState.classList.remove("hidden");
  renderControllerState(lobby);
  window.clearInterval(heartbeatTimer);
  heartbeatTimer = window.setInterval(heartbeat, 1000);
}

function setupController() {
  lockControllerViewport();
  bindControllerButtonPressStates();
  controllerScreen.classList.remove("hidden");
  reloadControllerArtAssets();
  listenForArtAssetsChanged(reloadControllerArtAssets);
  loadControllerLayouts().then(() => applyControllerLayoutForPhase("join")).catch(() => applyControllerLayoutForPhase("join"));
  runtimeTestChannel?.addEventListener("message", (event) => {
    applyControllerRuntimeTestMessage(event.data);
  });
  stageCodeInput.value = getStageCodeFromUrl() || normalizeStageCode(getSessionValue("partyTemplateStageCode") || getLocalValue("partyTemplateStageCode"));
  playerNameInput.value = getPlayerNameFromUrl() || getSessionValue("partyTemplatePlayerName") || "";
  updateJoinButton();
  applyControllerLayoutForPhase("join");

  stageCodeInput.addEventListener("input", () => {
    const cursorPosition = stageCodeInput.selectionStart;
    stageCodeInput.value = normalizeStageCode(stageCodeInput.value);
    stageCodeInput.setSelectionRange(cursorPosition, cursorPosition);
    updateJoinButton();
  });
  playerNameInput.addEventListener("input", () => {
    if (!controllerState && playerNameInput.value.trim() !== getSessionValue("partyTemplatePlayerName")) {
      removeSessionValue("partyTemplatePlayerId");
    }
    updateJoinButton();
  });
  controllerTextInput.addEventListener("input", () => {
    if (controllerState?.player?.answer?.invalid) {
      dismissedTextInvalidKey = `${controllerState.phaseActionId || ""}:${controllerState.player.answer.nonce || 0}`;
    }
    controllerInvalidBanner.classList.add("hidden");
    controllerTextSubmitButton.disabled = controllerTextInput.value.trim().length === 0;
  });
  controllerTextInput.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" || event.shiftKey) return;
    event.preventDefault();
    if (!controllerTextSubmitButton.disabled) controllerTextSubmitButton.click();
  });

  joinForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const stageCode = normalizeStageCode(stageCodeInput.value);
    const playerName = playerNameInput.value.trim();
    try {
      await joinController(stageCode, playerName);
    } catch (error) {
      joinButton.disabled = false;
      joinButton.textContent = error.message;
      window.setTimeout(() => {
        joinButton.textContent = "Join";
        updateJoinButton();
      }, 1800);
    }
  });

  if (shouldAutoJoin() && normalizeStageCode(stageCodeInput.value) && playerNameInput.value.trim()) {
    joinButton.textContent = "Joining";
    joinController(normalizeStageCode(stageCodeInput.value), playerNameInput.value.trim()).catch((error) => {
      joinButton.disabled = false;
      joinButton.textContent = error.message;
      window.setTimeout(() => {
        joinButton.textContent = "Join";
        updateJoinButton();
      }, 1800);
    });
  }

  startGameButton.addEventListener("click", async () => {
    if (!controllerState) return;
    if (!controllerState.player?.isVip) return;
    const isCancel = startGameButton.dataset.optionId === "lobby.cancelStart";
    try {
      const result = await postJson(isCancel ? "/api/cancel-start" : "/api/start", {
        stageCode: controllerState.stageCode,
        playerId: controllerState.playerId,
        startToken: controllerState.startToken
      });
      if (result.lobby) renderControllerState(result.lobby);
    } catch (error) {
      controllerMeta.textContent = error.message;
    }
  });

  controllerAvatar.addEventListener("click", openAvatarPicker);
  avatarPicker.addEventListener("click", (event) => {
    if (event.target === avatarPicker) closeAvatarPicker({ commit: true });
  });
  avatarPicker.querySelector(".avatar-picker-panel").addEventListener("click", (event) => {
    event.stopPropagation();
  });
  avatarPickerDoneButton.addEventListener("click", () => closeAvatarPicker({ commit: true }));

  introPresentButton.addEventListener("click", async () => {
    if (!controllerState) return;
    if (!controllerState.player?.isVip) return;
    introPresentButton.disabled = true;
    try {
      const result = await postJson("/api/present-hi", {
        stageCode: controllerState.stageCode,
        playerId: controllerState.playerId,
        startToken: controllerState.startToken
      });
      if (result.lobby) renderControllerState(result.lobby);
    } catch (error) {
      introPresentButton.textContent = error.message;
      window.setTimeout(() => {
        introPresentButton.textContent = "Present HI THERE";
      }, 1800);
    } finally {
      introPresentButton.disabled = false;
    }
  });

  window.addEventListener("pagehide", () => {
    if (!controllerState || !navigator.sendBeacon) return;
    const body = JSON.stringify({
      stageCode: controllerState.stageCode,
      playerId: controllerState.playerId
    });
    navigator.sendBeacon(`${origin}/api/leave`, new Blob([body], { type: "application/json" }));
  });
  window.addEventListener("resize", () => {
    if (!controllerScreen.classList.contains("hidden")) {
      applyControllerLayoutForPhase(controllerState ? controllerState.phase || "lobby" : "join");
    }
  });
}
