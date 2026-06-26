const controllerModules = window.createControllerModuleCache();

function setControllerText(target, value) {
  if (!target) return;
  if (typeof window.PartyGameLayoutText?.setControllerText === "function") {
    window.PartyGameLayoutText.setControllerText(target, value);
    return;
  }
  target.textContent = String(value ?? "");
}

function setControllerButtonText(target, value, spec = {}) {
  if (!target) return;
  const text = String(value ?? "");
  const rect = target.getBoundingClientRect?.() || {};
  const textSpec = {
    width: Number(spec.width || rect.width || 240),
    height: Number(spec.height || rect.height || 58),
    fontSize: Number(spec.fontSize || 24),
    fontColor: spec.fontColor || "currentColor",
    autoFitText: spec.autoFitText !== false,
    applySize: false
  };
  if (typeof window.PartyGameTextFit?.renderTextBox === "function") {
    window.PartyGameTextFit.renderTextBox(target, text, textSpec, spec.options || {});
    return;
  }
  target.textContent = text;
}

function initializeControllerButtonText() {
  setControllerButtonText(joinButton, "Join", { width: 260, height: 64, fontSize: 24 });
  setControllerButtonText(startGameButton, "Start Game", { width: 260, height: 64, fontSize: 24 });
  setControllerButtonText(introPresentButton, "Present HI THERE", { width: 300, height: 64, fontSize: 24 });
  setControllerButtonText(controllerGlobalActionButton, "Next", { width: 260, height: 64, fontSize: 24 });
  setControllerButtonText(controllerMicAccessButton, "Yes", { width: 260, height: 64, fontSize: 24 });
  setControllerButtonText(controllerTextSubmitButton, "Submit", { width: 260, height: 64, fontSize: 24 });
  setControllerButtonText(controllerVoiceButton, "Hold To Record", { width: 300, height: 64, fontSize: 24 });
}

function getControllerViewState() {
  return controllerModules.get("viewState", () => window.createControllerViewState({
      choice: controllerChoiceState,
      globalAction: controllerGlobalActionState,
      intro: controllerIntroState,
      join: joinState,
      lobby: controllerLobbyState,
      microphoneAccess: controllerMicAccessState,
      textInput: controllerTextState
    }));
}

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
      playerAvatarArt,
      renderState: renderControllerState,
      setButtonText: setControllerButtonText,
      setControllerPlayer: (player) => {
        controllerState.player = player;
      },
      setText: setControllerText,
      setMetaText: (value) => {
        setControllerText(controllerMeta, value);
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
      renderGlobalMessage: renderControllerGlobalMessage,
      setButtonText: setControllerButtonText,
      setText: setControllerText,
      showView: (viewId) => getControllerViewState().show(viewId),
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
      renderGlobalMessage: renderControllerGlobalMessage,
      setText: setControllerText,
      setButtonText: setControllerButtonText,
      showView: (viewId) => getControllerViewState().show(viewId),
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
      setButtonText: setControllerButtonText,
      setText: setControllerText,
      showView: (viewId) => getControllerViewState().show(viewId),
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
      hideViews: hideControllerViews,
      setButtonText: setControllerButtonText,
      setText: setControllerText,
      showView: (viewId) => getControllerViewState().show(viewId)
    }));
}

function renderControllerGlobalMessage(lobby, message, options = {}) {
  return getControllerGlobalActionView().renderMessage(lobby, message, {
    ...options,
    showButton: false
  });
}

function getControllerStateRuntime() {
  return controllerModules.get("stateRuntime", () => window.createControllerStateRuntime({
      closeAvatarPicker,
      getChoiceInputView: getControllerChoiceInputView,
      getGlobalActionView: getControllerGlobalActionView,
      getLobbyView: getControllerLobbyView,
      getMicrophoneAccessView: getControllerMicrophoneAccessView,
      getTextInputView: getControllerTextInputView,
      getVoiceInput: getControllerVoiceInput
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
      setText: setControllerText,
      showView: (viewId) => getControllerViewState().show(viewId),
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
      setText: setControllerText,
      showView: (viewId) => getControllerViewState().show(viewId),
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
      setText: setControllerText,
      showView: (viewId) => getControllerViewState().show(viewId),
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
      showView: (viewId) => getControllerViewState().show(viewId),
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
  getControllerViewState().hideAll();
  controllerGlobalActionButton.classList.add("hidden");
  introPresentButton.classList.add("hidden");
}

async function submitControllerChoice(actionId, optionIndex, cardId = "") {
  if (!controllerState) return;
  try {
    const result = await getControllerSubmitApi().submitChoice(actionId, optionIndex, cardId);
    if (result.lobby) renderControllerState(result.lobby);
  } catch (error) {
    setControllerText(controllerChoicePrompt, error.message);
  }
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
    setControllerText(controllerInvalidBanner, error.message);
    controllerInvalidBanner.classList.remove("hidden");
    controllerTextInput.value = "";
    controllerTextSubmitButton.disabled = true;
    controllerVoiceButton.disabled = false;
    setControllerText(controllerVoiceStatus, error.message);
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
    setControllerText(controllerVoiceStatus, error.message);
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
  const renderedState = getControllerStateRuntime().render(lobby, me);
  controllerState.controllerViewStateId = renderedState.id;
  controllerCountdownTimer = renderedState.countdownTimer;
}

function reloadControllerArtAssets() {
  loadArtAssets().then(() => {
    if (controllerState?.player) setControllerAvatar(controllerState.player);
    if (controllerState?.lobby) renderControllerState(controllerState.lobby);
    else applyControllerLayoutForPhase(controllerState?.phase || "join");
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
  playerNameInput.value = getPlayerNameFromUrl() || getSessionValue("partyTemplatePlayerName") || getLocalValue("partyTemplatePlayerName") || "";
  updateJoinButton();
  initializeControllerButtonText();
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
    setButtonText: setControllerButtonText,
    setLocalValue,
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
    setButtonText: setControllerButtonText,
    setMetaText: (value) => {
      setControllerText(controllerMeta, value);
    }
  }).bindAll();
}
