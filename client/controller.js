let controllerAvatarView = null;
let controllerVoiceInput = null;
let controllerChoiceInputView = null;
let controllerSubmitApi = null;
let controllerTextInputView = null;

function getControllerAvatarView() {
  if (!controllerAvatarView) {
    controllerAvatarView = window.createControllerAvatarView({
      avatarClass,
      avatarComposites,
      avatarFrameImage,
      avatarLabel,
      dinoIcon,
      elements: {
        avatar: controllerAvatar,
        banner: controllerPlayerBanner,
        bannerAvatar: controllerPlayerBannerAvatar,
        bannerName: controllerPlayerBannerName,
        picker: avatarPicker,
        pickerGrid: avatarPickerGrid
      },
      getControllerState: () => controllerState,
      postJson,
      renderState: renderControllerState,
      setControllerPlayer: (player) => {
        controllerState.player = player;
      },
      setMetaText: (value) => {
        controllerMeta.textContent = value;
      }
    });
  }
  return controllerAvatarView;
}

function getControllerVoiceInput() {
  if (!controllerVoiceInput) {
    controllerVoiceInput = window.createControllerVoiceInput({
      applyLayoutForPhase: applyControllerLayoutForPhase,
      button: controllerVoiceButton,
      hideViews: hideControllerViews,
      introMessage: controllerIntroMessage,
      introState: controllerIntroState,
      status: controllerVoiceStatus,
      submitText: submitControllerText
    });
  }
  return controllerVoiceInput;
}

function getControllerChoiceInputView() {
  if (!controllerChoiceInputView) {
    controllerChoiceInputView = window.createControllerChoiceInputView({
      applyLayoutForPhase: applyControllerLayoutForPhase,
      bindPress: bindButtonPress,
      elements: {
        done: controllerChoiceDone,
        grid: controllerChoiceGrid,
        prompt: controllerChoicePrompt,
        state: controllerChoiceState
      },
      hideViews: hideControllerViews,
      submitChoice: submitControllerChoice
    });
  }
  return controllerChoiceInputView;
}

function getControllerTextInputView() {
  if (!controllerTextInputView) {
    controllerTextInputView = window.createControllerTextInputView({
      applyLayoutForPhase: applyControllerLayoutForPhase,
      dismissedInvalidKey: () => dismissedTextInvalidKey,
      elements: {
        done: controllerTextDone,
        input: controllerTextInput,
        invalidBanner: controllerInvalidBanner,
        prompt: controllerTextPrompt,
        state: controllerTextState,
        submitButton: controllerTextSubmitButton,
        voiceButton: controllerVoiceButton,
        voiceStatus: controllerVoiceStatus
      },
      getVoiceInput: getControllerVoiceInput,
      hideViews: hideControllerViews,
      setPhaseActionId: (actionId) => {
        controllerState.phaseActionId = actionId;
      },
      submitText: submitControllerText
    });
  }
  return controllerTextInputView;
}

function getControllerSubmitApi() {
  if (!controllerSubmitApi) {
    controllerSubmitApi = window.createControllerSubmitApi({
      getControllerState: () => controllerState,
      postJson
    });
  }
  return controllerSubmitApi;
}

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
  getControllerAvatarView().setAvatar(player);
}

function setControllerPlayerBanner(player) {
  getControllerAvatarView().setBanner(player);
}

function openAvatarPicker() {
  getControllerAvatarView().open();
}

async function closeAvatarPicker({ commit = true } = {}) {
  return getControllerAvatarView().close({ commit });
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
  return getControllerChoiceInputView().render(lobby, me);
}

async function submitControllerChoice(actionId, optionIndex, cardId = "") {
  if (!controllerState) return;
  try {
    const result = await getControllerSubmitApi().submitChoice(actionId, optionIndex, cardId);
    if (result.lobby) renderControllerState(result.lobby);
  } catch (error) {
    controllerChoicePrompt.textContent = error.message;
  }
}

function renderControllerTextState(lobby, me) {
  return getControllerTextInputView().render(lobby, me);
}

async function submitControllerText(actionId, textOverride = null) {
  if (!controllerState) return;
  const text = textOverride == null ? controllerTextInput.value : textOverride;
  if (!text.trim()) return;
  controllerTextSubmitButton.disabled = true;
  controllerVoiceButton.disabled = true;
  try {
    const result = await getControllerSubmitApi().submitText(actionId, text);
    if (result.lobby) renderControllerState(result.lobby);
  } catch (error) {
    controllerInvalidBanner.textContent = error.message;
    controllerInvalidBanner.classList.remove("hidden");
    controllerTextInput.value = "";
    controllerTextSubmitButton.disabled = true;
    controllerVoiceButton.disabled = false;
    controllerVoiceStatus.textContent = error.message;
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
  getControllerAvatarView().syncPendingShape(me);

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
