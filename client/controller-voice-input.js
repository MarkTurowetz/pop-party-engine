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
    status,
    submitText
  }) {
    let recognition = null;
    let listening = false;
    let transcript = "";
    let shouldSubmitOnEnd = false;

    function stopRecognition() {
      if (!recognition) return;
      listening = false;
      shouldSubmitOnEnd = false;
      try {
        recognition.stop();
      } catch (error) {
        // SpeechRecognition may already be stopped.
      }
      recognition = null;
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
      button.textContent = "Start Recording";
      button.disabled = false;
      status.textContent = "Tap to record";
    }

    function start(actionId) {
      if (listening) {
        listening = false;
        button.disabled = true;
        status.textContent = "Finishing transcript";
        try {
          recognition?.stop();
        } catch (error) {
          button.disabled = false;
          status.textContent = "Could not stop recording";
        }
        return;
      }

      const Recognition = speechRecognitionConstructor();
      if (!Recognition) {
        status.textContent = "Speech recognition is not available in this browser";
        button.disabled = true;
        return;
      }

      transcript = "";
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
        shouldSubmitOnEnd = false;
        status.textContent = event.error === "not-allowed" ? "Microphone access was blocked" : "Voice capture failed";
        button.textContent = "Start Recording";
        button.disabled = false;
      };
      recognition.onend = () => {
        const finalTranscript = transcript.trim();
        const shouldSubmit = shouldSubmitOnEnd;
        listening = false;
        shouldSubmitOnEnd = false;
        recognition = null;
        if (shouldSubmit && finalTranscript) {
          button.disabled = true;
          status.textContent = "Saving transcript";
          submitText(actionId, finalTranscript);
          return;
        }
        button.textContent = "Start Recording";
        button.disabled = false;
        status.textContent = "No speech detected";
      };

      try {
        listening = true;
        shouldSubmitOnEnd = true;
        button.textContent = "Stop Recording";
        status.textContent = "Listening";
        recognition.start();
      } catch (error) {
        listening = false;
        shouldSubmitOnEnd = false;
        recognition = null;
        button.textContent = "Start Recording";
        button.disabled = false;
        status.textContent = "Could not start microphone";
      }
    }

    return {
      isListening: () => listening,
      renderWaiting,
      resetUi,
      start,
      stopRecognition
    };
  }

  window.createControllerVoiceInput = createControllerVoiceInput;
})();
