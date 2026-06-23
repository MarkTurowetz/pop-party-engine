const controllerModules = window.createControllerModuleCache();

function getControllerAvatarView() {
  return controllerModules.get("avatarView", () => window.createControllerAvatarView({
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
      renderState: renderControllerState,
      setControllerPlayer: (player) => {
        controllerState.player = player;
      },
      setMetaText: (value) => {
        controllerMeta.textContent = value;
      },
      updateAvatar: (shape) => getControllerSubmitApi().updateAvatar(shape)
    }));
}

function getControllerVoiceInput() {
  return controllerModules.get("voiceInput", () => window.createControllerVoiceInput({
      applyLayoutForPhase: applyControllerLayoutForPhase,
      button: controllerVoiceButton,
      getReleaseBufferSeconds: () => Number(controllerState?.lobby?.speechToTextSendInputBuffer ?? gameConstants.speechToTextSendInputBuffer ?? 1),
      hideViews: hideControllerViews,
      introMessage: controllerIntroMessage,
      introState: controllerIntroState,
      previewText: previewControllerText,
      status: controllerVoiceStatus,
      submitText: submitControllerText
    }));
}

function getControllerMicrophoneAccessView() {
  return controllerModules.get("microphoneAccessView", () => window.createControllerMicrophoneAccessView({
      applyLayoutForPhase: applyControllerLayoutForPhase,
      elements: {
        button: controllerMicAccessButton,
        prompt: controllerMicAccessPrompt,
        state: controllerMicAccessState,
        status: controllerMicAccessStatus
      },
      grantAccess: grantControllerMicrophoneAccess,
      hideViews: hideControllerViews,
      waiting: {
        message: controllerIntroMessage,
        state: controllerIntroState
      }
    }));
}

function getControllerChoiceInputView() {
  return controllerModules.get("choiceInputView", () => window.createControllerChoiceInputView({
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
    }));
}

function getControllerGlobalActionView() {
  return controllerModules.get("globalActionView", () => window.createControllerGlobalActionView({
      advanceStageClick: advanceControllerStageClick,
      applyLayoutForPhase: applyControllerLayoutForPhase,
      elements: {
        button: controllerGlobalActionButton,
        message: controllerGlobalActionMessage,
        state: controllerGlobalActionState
      },
      hideViews: hideControllerViews
    }));
}

function getControllerHeartbeatRuntime() {
  return controllerModules.get("heartbeatRuntime", () => window.createControllerHeartbeatRuntime({
      applyLayoutForPhase: applyControllerLayoutForPhase,
      closeAvatarPicker,
      elements: {
        joinButton,
        joinState,
        meta: controllerMeta
      },
      getControllerState: () => controllerState,
      hideViews: hideControllerViews,
      renderState: renderControllerState,
      sendHeartbeat: () => getControllerSubmitApi().heartbeat(),
      setControllerState: (value) => {
        controllerState = value;
      }
    }));
}

function getControllerLobbyView() {
  return controllerModules.get("lobbyView", () => window.createControllerLobbyView({
      applyLayoutForPhase: applyControllerLayoutForPhase,
      elements: {
        introPresentButton,
        introState: controllerIntroState,
        lobbyState: controllerLobbyState,
        meta: controllerMeta,
        playerName: controllerPlayerName,
        startButton: startGameButton
      },
      hideViews: hideControllerViews,
      setAvatar: setControllerAvatar
    }));
}

function getControllerTextInputView() {
  return controllerModules.get("textInputView", () => window.createControllerTextInputView({
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
    }));
}

function getControllerSubmitApi() {
  return controllerModules.get("submitApi", () => window.createControllerSubmitApi({
      getControllerState: () => controllerState,
      postJson
    }));
}

function getControllerSessionRuntime() {
  return controllerModules.get("sessionRuntime", () => window.createControllerSessionRuntime({
      elements: {
        joinState,
        lobbyState: controllerLobbyState
      },
      getControllerState: () => controllerState,
      heartbeatRuntime: getControllerHeartbeatRuntime(),
      renderState: renderControllerState,
      setControllerState: (value) => {
        controllerState = value;
      },
      setLocalValue,
      setSessionValue
    }));
}

function updateJoinButton() {
  const hasStage = normalizeStageCode(stageCodeInput.value).length > 0;
  const hasName = playerNameInput.value.trim().length > 0;
  joinButton.disabled = !(hasStage && hasName);
}

async function joinController(stageCode, playerName) {
  const playerId = getControllerPlayerId();
  joinButton.disabled = true;
  const result = await getControllerSubmitApi().join(stageCode, playerName, playerId);
  getControllerSessionRuntime().enterLobby(stageCode, result.player.id, result.lobby, result.player);
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
  controllerGlobalActionState.classList.add("hidden");
  controllerGlobalActionButton.classList.add("hidden");
  controllerChoiceState.classList.add("hidden");
  controllerMicAccessState.classList.add("hidden");
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

function renderControllerMicrophoneAccessState(lobby, me) {
  return getControllerMicrophoneAccessView().render(lobby, me);
}

function renderControllerGlobalActionState(lobby, me) {
  return getControllerGlobalActionView().render(lobby, me);
}

function renderControllerPausedState(lobby) {
  hideControllerViews();
  getControllerVoiceInput().stopRecognition();
  controllerGlobalActionState.classList.remove("hidden");
  controllerGlobalActionButton.classList.add("hidden");
  controllerGlobalActionButton.disabled = true;
  controllerGlobalActionMessage.textContent = "Game Paused";
  applyControllerLayoutForPhase(lobby.phase || "lobby");
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

async function grantControllerMicrophoneAccess(actionId) {
  if (!controllerState) return null;
  const result = await getControllerSubmitApi().grantMicrophoneAccess(actionId);
  if (result?.lobby) renderControllerState(result.lobby);
  return result;
}

async function previewControllerText(actionId, text = "T") {
  if (!controllerState) return;
  try {
    const result = await getControllerSubmitApi().previewText(actionId, text);
    if (result?.lobby) renderControllerState(result.lobby);
  } catch (error) {
    controllerVoiceStatus.textContent = error.message;
  }
}

async function advanceControllerStageClick(actionId) {
  if (!controllerState) return null;
  const result = await getControllerSubmitApi().inputEvent(actionId, "stageClick");
  if (result?.lobby) renderControllerState(result.lobby);
  return result;
}

function renderControllerState(lobby) {
  if (!controllerState) return;
  controllerState.lobby = lobby;
  window.clearInterval(controllerCountdownTimer);
  const me = (lobby.players || []).find((player) => player.id === controllerState.playerId);
  if (!me) {
    closeAvatarPicker({ commit: false });
    controllerState.startToken = "";
    getControllerLobbyView().renderMissingPlayer();
    return;
  }
  controllerState.player = me;
  setControllerPlayerBanner(me);
  controllerState.startToken = me.isVip ? lobby.startToken : "";
  getControllerAvatarView().syncPendingShape(me);

  const controllerPhase = lobby.phase || "lobby";
  controllerState.phase = controllerPhase;
  if (lobby.isPaused === true && controllerPhase !== "lobby" && controllerPhase !== "starting") {
    closeAvatarPicker({ commit: false });
    renderControllerPausedState(lobby);
    return;
  }
  if (lobby.microphoneAccess?.actionId) {
    closeAvatarPicker({ commit: false });
    if (renderControllerMicrophoneAccessState(lobby, me)) return;
  }
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
    if (renderControllerGlobalActionState(lobby, me)) return;
    getControllerLobbyView().renderInGamePhase(me, controllerPhase);
    return;
  }

  controllerCountdownTimer = getControllerLobbyView().renderLobby(lobby, me, controllerPhase);
}

function reloadControllerArtAssets() {
  loadArtAssets().then(() => {
    if (controllerState?.player) setControllerAvatar(controllerState.player);
    if (controllerState?.lobby) renderControllerState(controllerState.lobby);
  }).catch(() => {});
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

  const setupBindings = window.createControllerSetupBindings({
    elements: {
      invalidBanner: controllerInvalidBanner,
      joinButton,
      joinForm,
      playerNameInput,
      stageCodeInput,
      textInput: controllerTextInput,
      textSubmitButton: controllerTextSubmitButton
    },
    getControllerState: () => controllerState,
    getSessionValue,
    joinController,
    normalizeStageCode,
    removeSessionValue,
    setDismissedInvalidKey: (value) => {
      dismissedTextInvalidKey = value;
    },
    shouldAutoJoin,
    updateJoinButton
  });
  setupBindings.bindJoinControls();
  setupBindings.bindTextInputControls();

  window.createControllerActionBindings({
    applyLayoutForPhase: applyControllerLayoutForPhase,
    closeAvatarPicker,
    elements: {
      avatar: controllerAvatar,
      avatarPicker,
      avatarPickerDoneButton,
      avatarPickerPanel: avatarPicker.querySelector(".avatar-picker-panel"),
      controllerScreen,
      introPresentButton,
      startButton: startGameButton
    },
    getControllerState: () => controllerState,
    getSessionRuntime: getControllerSessionRuntime,
    getSubmitApi: getControllerSubmitApi,
    openAvatarPicker,
    origin,
    renderState: renderControllerState,
    setMetaText: (value) => {
      controllerMeta.textContent = value;
    }
  }).bindAll();
}
