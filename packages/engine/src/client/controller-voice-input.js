"use strict";

const { createControllerRecordingLifecycle } = require("./controller-recording-lifecycle");

const BUTTON_SPEC = Object.freeze({ width: 300, height: 64, fontSize: 24 });

function shouldDeferVoiceHeartbeat(currentLobby, nextLobby, isCapturing) {
  const currentVoiceInput = currentLobby?.textInput;
  const nextVoiceInput = nextLobby?.textInput;
  return Boolean(
    isCapturing &&
      !nextLobby?.isPaused &&
      currentLobby?.phase === nextLobby?.phase &&
      currentVoiceInput?.actionId &&
      currentVoiceInput.actionId === nextVoiceInput?.actionId &&
      (nextVoiceInput?.type === "voice" || nextVoiceInput?.mode === "voiceVip")
  );
}

function defaultQueryMicrophonePermission() {
  try {
    return globalThis.navigator?.permissions?.query?.({ name: "microphone" }) || Promise.resolve(null);
  } catch {
    return Promise.resolve(null);
  }
}

function createControllerVoiceInput(options) {
  const {
    getButton,
    getReleaseBufferSeconds,
    queryMicrophonePermission = defaultQueryMicrophonePermission,
    renderGlobalMessage,
    setButtonText,
    setText,
    status,
    submitText
  } = options;

  const writeText = typeof setText === "function"
    ? setText
    : (target, value) => { target.textContent = String(value ?? ""); };
  const writeButtonText = typeof setButtonText === "function" ? setButtonText : writeText;

  let lifecycle = null;
  let activePressActionId = "";
  let activePressToken = 0;
  let renderedButton = null;
  let renderedButtonText = "";
  let renderedStatusText = "";

  function setStatusText(value) {
    if (renderedStatusText === value && status.dataset?.textFitSource === value) return;
    renderedStatusText = value;
    writeText(status, value);
  }

  function setButtonPresentation(text, disabled) {
    const button = getButton();
    if (!button) return;
    const currentText = button.dataset?.controllerTextValue || "";
    if (renderedButton !== button || renderedButtonText !== text || currentText !== text) {
      writeButtonText(button, text, { ...BUTTON_SPEC });
      renderedButton = button;
      renderedButtonText = text;
    }
    if (button.disabled !== disabled) button.disabled = disabled;
  }

  function renderRecordingState(state) {
    if (state === "listening") {
      setButtonPresentation("Release To Send", false);
      return;
    }
    if (state === "buffering" || state === "stopping" || state === "submitting") {
      setButtonPresentation("Processing", true);
      return;
    }
    setButtonPresentation("Hold To Record", false);
  }

  function getLifecycle() {
    if (!lifecycle) {
      lifecycle = createControllerRecordingLifecycle({
        getReleaseBufferSeconds,
        onStateChange: renderRecordingState,
        onError: () => {
          const button = getButton();
          if (button) button.disabled = false;
        },
        onStatus: setStatusText,
        submitText
      });
    }
    return lifecycle;
  }

  function renderWaiting(lobby) {
    getLifecycle().cancel();
    renderGlobalMessage(lobby, "Waiting for the VIP to answer", { id: "voiceInputWaiting" });
  }

  function resetUi() {
    renderRecordingState("idle");
    setStatusText("Hold to record");
  }

  async function canRecordWithMicrophone() {
    const permission = await queryMicrophonePermission();
    const permissionState = typeof permission === "string" ? permission : permission?.state;
    if (permissionState === "granted") return true;
    if (permissionState === "denied") return false;
    return true;
  }

  async function beginRecording(actionId, expectedPressToken = null) {
    const button = getButton();
    if (!button) return;
    if (!(await canRecordWithMicrophone())) {
      if (expectedPressToken !== null && expectedPressToken !== activePressToken) return;
      setStatusText("Give microphone access first");
      button.disabled = false;
      return;
    }
    if (expectedPressToken !== null && (expectedPressToken !== activePressToken || activePressActionId !== actionId)) return;
    getLifecycle().begin(actionId);
  }

  function finishRecording(actionId) {
    const button = getButton();
    if (!button) return;
    getLifecycle().release(actionId);
  }

  function beginPress(actionId) {
    activePressActionId = actionId;
    activePressToken += 1;
    void beginRecording(actionId, activePressToken);
  }

  function finishPress(actionId) {
    if (activePressActionId === actionId) activePressActionId = "";
    activePressToken += 1;
    finishRecording(actionId);
  }

  function start(actionId) {
    const recorder = getLifecycle();
    if (recorder.state() === "listening") finishRecording(actionId);
    else void beginRecording(actionId);
  }

  function bindButton(actionId) {
    const button = getButton();
    if (!button) return;
    button.onclick = (event) => event.preventDefault();
    button.onpointerdown = (event) => {
      event.preventDefault();
      try {
        button.setPointerCapture?.(event.pointerId);
      } catch {
        // Pointer capture is best-effort across mobile browsers.
      }
      beginPress(actionId);
    };
    button.onpointerup = (event) => {
      event.preventDefault();
      try {
        if (button.hasPointerCapture?.(event.pointerId)) button.releasePointerCapture(event.pointerId);
      } catch {
        // Pointer capture is best-effort across mobile browsers.
      }
      finishPress(actionId);
    };
    button.onpointercancel = (event) => {
      event.preventDefault();
      finishPress(actionId);
    };
    button.onkeydown = (event) => {
      if ((event.key !== " " && event.key !== "Enter") || event.repeat) return;
      event.preventDefault();
      beginPress(actionId);
    };
    button.onkeyup = (event) => {
      if (event.key !== " " && event.key !== "Enter") return;
      event.preventDefault();
      finishPress(actionId);
    };
    renderRecordingState(getLifecycle().state());
  }

  return Object.freeze({
    bindButton,
    isCapturing: () => getLifecycle().isCapturing(),
    isListening: () => getLifecycle().isBusy(),
    renderWaiting,
    resetUi,
    start,
    stopRecognition: () => {
      activePressActionId = "";
      activePressToken += 1;
      getLifecycle().cancel();
    }
  });
}

module.exports = Object.freeze({ BUTTON_SPEC, createControllerVoiceInput, defaultQueryMicrophonePermission, shouldDeferVoiceHeartbeat });
