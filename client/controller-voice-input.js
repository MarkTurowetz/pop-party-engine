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
    let interimTranscript = "";
    let activeActionId = "";
    let previewSent = false;
    let previewPromise = Promise.resolve(null);

    function stopRecognition() {
      const activeRecognition = recognition;
      listening = false;
      processing = false;
      submitting = false;
      activeActionId = "";
      previewSent = false;
      transcript = "";
      interimTranscript = "";
      previewPromise = Promise.resolve(null);
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
      interimTranscript = "";
      button.textContent = "Hold To Record";
      button.disabled = false;
      status.textContent = "Hold to record";
    }

    function capturedTranscript() {
      return (transcript.trim() || interimTranscript.trim()).trim();
    }

    function updateTranscriptFromResults(results) {
      const finalParts = [];
      const interimParts = [];
      for (let index = 0; index < results.length; index += 1) {
        const resultTranscript = results[index]?.[0]?.transcript || "";
        if (!resultTranscript.trim()) continue;
        if (results[index]?.isFinal) finalParts.push(resultTranscript);
        else interimParts.push(resultTranscript);
      }
      transcript = finalParts.join(" ").trim();
      interimTranscript = interimParts.join(" ").trim();
    }

    async function submitCapturedTranscript(actionId, text) {
      status.textContent = "Finishing transcript";
      try {
        await previewPromise;
      } catch (error) {
        // The final transcript can still update the stage if the temporary preview failed.
      }
      status.textContent = "Saving transcript";
      await submitText(actionId, text);
    }

    function finishRecording(actionId) {
      if (!listening || activeActionId !== actionId) return;
      listening = false;
      processing = true;
      previewSent = true;
      button.disabled = true;
      button.textContent = "Processing";
      status.textContent = "Processing speech";
      previewPromise = Promise.resolve(previewText(actionId, "T")).then(() => {
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
      interimTranscript = "";
      activeActionId = actionId;
      previewSent = false;
      previewPromise = Promise.resolve(null);
      recognition = new Recognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = "en-US";
      recognition.onresult = (event) => {
        updateTranscriptFromResults(event.results);
        status.textContent = listening ? "Listening" : "Processing speech";
      };
      recognition.onerror = (event) => {
        const fatalError = event.error === "not-allowed"
          || event.error === "service-not-allowed"
          || event.error === "audio-capture";
        if (processing && !fatalError) {
          status.textContent = "Finishing transcript";
          return;
        }
        listening = false;
        processing = false;
        previewSent = false;
        activeActionId = "";
        interimTranscript = "";
        previewPromise = Promise.resolve(null);
        status.textContent = event.error === "not-allowed" ? "Microphone access was blocked" : "Voice capture failed";
        button.textContent = "Hold To Record";
        button.disabled = false;
      };
      recognition.onend = () => {
        const finalTranscript = capturedTranscript();
        const actionIdToSubmit = activeActionId;
        const shouldSubmit = processing && previewSent;
        listening = false;
        processing = false;
        previewSent = false;
        activeActionId = "";
        transcript = "";
        interimTranscript = "";
        recognition = null;
        if (shouldSubmit && finalTranscript) {
          submitting = true;
          button.disabled = true;
          Promise.resolve(submitCapturedTranscript(actionIdToSubmit, finalTranscript)).finally(() => {
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
        interimTranscript = "";
        previewPromise = Promise.resolve(null);
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
