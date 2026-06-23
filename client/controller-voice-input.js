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
    status,
    submitText
  }) {
    let lifecycle = null;

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
      introState.classList.remove("hidden");
      introMessage.textContent = "Waiting for the VIP to answer";
      applyLayoutForPhase(lobby.phase || "lobby");
    }

    function resetUi() {
      button.textContent = "Hold To Record";
      button.disabled = false;
      status.textContent = "Hold to record";
    }

    function beginRecording(actionId) {
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
