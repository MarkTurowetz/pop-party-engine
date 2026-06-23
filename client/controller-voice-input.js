(function () {
  "use strict";

  function speechRecognitionConstructor() {
    return window.SpeechRecognition || window.webkitSpeechRecognition || null;
  }

  function createControllerVoiceInput({
    applyLayoutForPhase,
    button,
    hideViews,
    introMessage,
    introState,
    previewText,
    status,
    submitText
  }) {
    let recognition = null;
    let listening = false;
    let processing = false;
    let submitting = false;
    let transcript = "";
    let activeActionId = "";
    let previewSent = false;

    function stopRecognition() {
      const activeRecognition = recognition;
      listening = false;
      processing = false;
      submitting = false;
      activeActionId = "";
      previewSent = false;
      transcript = "";
      recognition = null;
      if (!activeRecognition) return;
      try {
        if (activeRecognition.abort) activeRecognition.abort();
        else activeRecognition.stop?.();
      } catch (error) {
        // SpeechRecognition may already be stopped.
      }
    }

    function renderWaiting(lobby) {
      stopRecognition();
      hideViews();
      introState.classList.remove("hidden");
      introMessage.textContent = "Waiting for the VIP to answer";
      applyLayoutForPhase(lobby.phase || "lobby");
    }

    function resetUi() {
      transcript = "";
      button.textContent = "Hold To Record";
      button.disabled = false;
      status.textContent = "Hold to record";
    }

    function finishRecording(actionId) {
      if (!listening || activeActionId !== actionId) return;
      listening = false;
      processing = true;
      previewSent = true;
      button.disabled = true;
      button.textContent = "Processing";
      status.textContent = "Sending placeholder";
      previewText(actionId, "T").then(() => {
        if (processing) status.textContent = "Finishing transcript";
      }).catch((error) => {
        status.textContent = error.message || "Could not show voice preview";
      });
      try {
        recognition?.stop();
      } catch (error) {
        processing = false;
        activeActionId = "";
        button.disabled = false;
        button.textContent = "Hold To Record";
        status.textContent = "Could not stop recording";
      }
    }

    function beginRecording(actionId) {
      if (listening || processing || submitting) return;
      const Recognition = speechRecognitionConstructor();
      if (!Recognition) {
        status.textContent = "Speech recognition is not available in this browser";
        button.disabled = true;
        return;
      }

      transcript = "";
      activeActionId = actionId;
      previewSent = false;
      recognition = new Recognition();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = "en-US";
      recognition.onresult = (event) => {
        let finalText = "";
        let interimText = "";
        for (let index = event.resultIndex; index < event.results.length; index += 1) {
          const resultTranscript = event.results[index]?.[0]?.transcript || "";
          if (event.results[index]?.isFinal) finalText += resultTranscript;
          else interimText += resultTranscript;
        }
        if (finalText.trim()) transcript = `${transcript} ${finalText}`.trim();
        status.textContent = (transcript || interimText || "Listening").trim();
      };
      recognition.onerror = (event) => {
        listening = false;
        processing = false;
        previewSent = false;
        activeActionId = "";
        status.textContent = event.error === "not-allowed" ? "Microphone access was blocked" : "Voice capture failed";
        button.textContent = "Hold To Record";
        button.disabled = false;
      };
      recognition.onend = () => {
        const finalTranscript = transcript.trim();
        const actionIdToSubmit = activeActionId;
        const shouldSubmit = processing && previewSent;
        listening = false;
        processing = false;
        previewSent = false;
        activeActionId = "";
        recognition = null;
        if (shouldSubmit && finalTranscript) {
          submitting = true;
          button.disabled = true;
          status.textContent = "Saving transcript";
          Promise.resolve(submitText(actionIdToSubmit, finalTranscript)).finally(() => {
            submitting = false;
          });
          return;
        }
        button.textContent = "Hold To Record";
        button.disabled = false;
        status.textContent = "No speech detected";
      };

      try {
        listening = true;
        button.textContent = "Release To Send";
        status.textContent = "Listening";
        recognition.start();
      } catch (error) {
        listening = false;
        processing = false;
        activeActionId = "";
        previewSent = false;
        recognition = null;
        button.textContent = "Hold To Record";
        button.disabled = false;
        status.textContent = "Could not start microphone";
      }
    }

    function start(actionId) {
      if (listening) finishRecording(actionId);
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
      isListening: () => listening || processing || submitting,
      renderWaiting,
      resetUi,
      start,
      stopRecognition
    };
  }

  window.createControllerVoiceInput = createControllerVoiceInput;
})();
