(function () {
  "use strict";

  function defaultSpeechRecognitionConstructor() {
    return window.SpeechRecognition || window.webkitSpeechRecognition || null;
  }

  function createControllerRecordingLifecycle({
    getReleaseBufferSeconds = () => 1,
    onBusyChange = () => {},
    onError = () => {},
    onStatus = () => {},
    placeholderText = "T",
    previewText,
    recognitionConstructor = defaultSpeechRecognitionConstructor,
    submitText
  }) {
    let recognition = null;
    let state = "idle";
    let transcript = "";
    let interimTranscript = "";
    let activeActionId = "";
    let previewPromise = Promise.resolve(null);
    let releaseBufferTimer = null;

    function setState(nextState) {
      state = nextState;
      onBusyChange(isBusy());
    }

    function isBusy() {
      return state !== "idle";
    }

    function releaseBufferMs() {
      const seconds = Number(getReleaseBufferSeconds());
      return Math.max(0, Math.min(10, Number.isFinite(seconds) ? seconds : 1)) * 1000;
    }

    function clearReleaseBufferTimer() {
      if (!releaseBufferTimer) return;
      window.clearTimeout(releaseBufferTimer);
      releaseBufferTimer = null;
    }

    function clearCaptureText() {
      transcript = "";
      interimTranscript = "";
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

    function stopActiveRecognition() {
      if (!recognition) return;
      try {
        recognition.stop();
      } catch (error) {
        finishWithoutSubmit("Could not stop recording");
      }
    }

    function finishWithoutSubmit(message = "No speech detected") {
      clearReleaseBufferTimer();
      recognition = null;
      activeActionId = "";
      clearCaptureText();
      previewPromise = Promise.resolve(null);
      setState("idle");
      onStatus(message);
    }

    async function submitCapturedTranscript(actionId, text) {
      onStatus("Finishing transcript");
      try {
        await previewPromise;
      } catch (error) {
        // The final transcript can still update the stage if the temporary preview failed.
      }
      onStatus("Saving transcript");
      await submitText(actionId, text);
    }

    function handleRecognitionEnd() {
      clearReleaseBufferTimer();
      const finalTranscript = capturedTranscript();
      const actionIdToSubmit = activeActionId;
      const shouldSubmit = (state === "buffering" || state === "stopping") && Boolean(actionIdToSubmit);
      recognition = null;
      activeActionId = "";
      clearCaptureText();
      if (shouldSubmit && finalTranscript) {
        setState("submitting");
        Promise.resolve(submitCapturedTranscript(actionIdToSubmit, finalTranscript)).finally(() => {
          setState("idle");
        });
        return;
      }
      finishWithoutSubmit();
    }

    function handleRecognitionError(event) {
      const fatalError = event.error === "not-allowed"
        || event.error === "service-not-allowed"
        || event.error === "audio-capture";
      if ((state === "buffering" || state === "stopping") && !fatalError) {
        onStatus("Finishing transcript");
        return;
      }
      const message = event.error === "not-allowed" ? "Microphone access was blocked" : "Voice capture failed";
      cancel({ abort: false, message });
      onError(message);
    }

    function cancel({ abort = true, message = "" } = {}) {
      const activeRecognition = recognition;
      clearReleaseBufferTimer();
      recognition = null;
      activeActionId = "";
      clearCaptureText();
      previewPromise = Promise.resolve(null);
      setState("idle");
      if (activeRecognition && abort) {
        try {
          if (activeRecognition.abort) activeRecognition.abort();
          else activeRecognition.stop?.();
        } catch (error) {
          // SpeechRecognition may already be stopped.
        }
      }
      if (message) onStatus(message);
    }

    function begin(actionId) {
      if (isBusy()) return false;
      const Recognition = recognitionConstructor();
      if (!Recognition) {
        const message = "Speech recognition is not available in this browser";
        onStatus(message);
        onError(message);
        return false;
      }

      clearCaptureText();
      activeActionId = actionId;
      previewPromise = Promise.resolve(null);
      recognition = new Recognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = "en-US";
      recognition.onresult = (event) => {
        updateTranscriptFromResults(event.results);
        onStatus(state === "listening" ? "Listening" : "Processing speech");
      };
      recognition.onerror = handleRecognitionError;
      recognition.onend = handleRecognitionEnd;

      try {
        setState("listening");
        onStatus("Listening");
        recognition.start();
        return true;
      } catch (error) {
        recognition = null;
        activeActionId = "";
        clearCaptureText();
        setState("idle");
        onStatus("Could not start microphone");
        return false;
      }
    }

    function release(actionId) {
      if (state !== "listening" || activeActionId !== actionId) return false;
      setState("buffering");
      onStatus("Processing speech");
      previewPromise = Promise.resolve(previewText(actionId, placeholderText)).then(() => {
        if (state === "buffering" || state === "stopping") onStatus("Finishing transcript");
      }).catch((error) => {
        onStatus(error.message || "Could not show voice preview");
      });
      const waitMs = releaseBufferMs();
      releaseBufferTimer = window.setTimeout(() => {
        releaseBufferTimer = null;
        if (state !== "buffering") return;
        setState("stopping");
        stopActiveRecognition();
      }, waitMs);
      return true;
    }

    return {
      begin,
      cancel,
      isBusy,
      release,
      state: () => state
    };
  }

  window.createControllerRecordingLifecycle = createControllerRecordingLifecycle;
})();
