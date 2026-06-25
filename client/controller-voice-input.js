(function () {
  "use strict";

  function createControllerVoiceInput({
    applyLayoutForPhase,
    button,
    getReleaseBufferSeconds,
    hideViews,
    introMessage,
    introState,
    previewText,
    renderGlobalMessage,
    showView,
    status,
    submitText
  }) {
    let lifecycle = null;
    const rememberedAccessKey = "partyTemplate.microphoneAccessGranted";

    function setButtonState(isBusy) {
      if (!isBusy) {
        button.textContent = "Hold To Record";
        button.disabled = false;
        return;
      }
      button.disabled = true;
      button.textContent = "Processing";
    }

    function getLifecycle() {
      if (!lifecycle) {
        lifecycle = window.createControllerRecordingLifecycle({
          getReleaseBufferSeconds,
          onBusyChange: setButtonState,
          onError: () => {
            button.disabled = false;
          },
          onStatus: (message) => {
            status.textContent = message;
          },
          previewText,
          submitText
        });
      }
      return lifecycle;
    }

    function renderWaiting(lobby) {
      getLifecycle().cancel();
      if (typeof renderGlobalMessage === "function") {
        renderGlobalMessage(lobby, "Waiting for the VIP to answer", { id: "voiceInputWaiting" });
        return;
      }
      hideViews();
      applyLayoutForPhase(lobby.phase || "lobby");
      showView("intro");
      introMessage.textContent = "Waiting for the VIP to answer";
    }

    function resetUi() {
      button.textContent = "Hold To Record";
      button.disabled = false;
      status.textContent = "Hold to record";
    }

    function hasRememberedMicrophoneAccess() {
      try {
        return localStorage.getItem(rememberedAccessKey) === "true";
      } catch (error) {
        return false;
      }
    }

    async function canRecordWithMicrophone() {
      try {
        const permission = await navigator.permissions?.query?.({ name: "microphone" });
        if (permission?.state === "granted") {
          try {
            localStorage.setItem(rememberedAccessKey, "true");
          } catch (error) {
            // Storage can be unavailable in private browsing modes.
          }
          return true;
        }
        if (permission?.state === "denied") return false;
      } catch (error) {
        // Some browsers do not expose microphone permission state.
      }
      if (hasRememberedMicrophoneAccess()) {
        try {
          localStorage.removeItem(rememberedAccessKey);
        } catch (error) {
          // Storage can be unavailable in private browsing modes.
        }
      }
      return false;
    }

    async function beginRecording(actionId) {
      if (!(await canRecordWithMicrophone())) {
        status.textContent = "Give microphone access first";
        button.disabled = false;
        return;
      }
      if (getLifecycle().begin(actionId)) {
        button.textContent = "Release To Send";
        button.disabled = false;
      }
    }

    function finishRecording(actionId) {
      if (getLifecycle().release(actionId)) {
        button.disabled = true;
        button.textContent = "Processing";
      }
    }

    function start(actionId) {
      const recorder = getLifecycle();
      if (recorder.state() === "listening") finishRecording(actionId);
      else beginRecording(actionId);
    }

    function bindButton(actionId) {
      button.onclick = (event) => event.preventDefault();
      button.onpointerdown = (event) => {
        event.preventDefault();
        try {
          button.setPointerCapture?.(event.pointerId);
        } catch (error) {
          // Pointer capture is best-effort across mobile browsers.
        }
        beginRecording(actionId);
      };
      button.onpointerup = (event) => {
        event.preventDefault();
        try {
          if (button.hasPointerCapture?.(event.pointerId)) button.releasePointerCapture(event.pointerId);
        } catch (error) {
          // Pointer capture is best-effort across mobile browsers.
        }
        finishRecording(actionId);
      };
      button.onpointercancel = (event) => {
        event.preventDefault();
        finishRecording(actionId);
      };
      button.onkeydown = (event) => {
        if ((event.key !== " " && event.key !== "Enter") || event.repeat) return;
        event.preventDefault();
        beginRecording(actionId);
      };
      button.onkeyup = (event) => {
        if (event.key !== " " && event.key !== "Enter") return;
        event.preventDefault();
        finishRecording(actionId);
      };
    }

    return {
      bindButton,
      isListening: () => getLifecycle().isBusy(),
      renderWaiting,
      resetUi,
      start,
      stopRecognition: () => getLifecycle().cancel()
    };
  }

  window.createControllerVoiceInput = createControllerVoiceInput;
})();
