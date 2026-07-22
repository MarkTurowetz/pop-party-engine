"use strict";

const MAX_CAPTURED_TRANSCRIPT_CHARACTERS = 4096;
const MAX_CAPTURED_RESULT_SEGMENTS = 256;

function browserHost() {
  return globalThis.window || globalThis;
}

function defaultSpeechRecognitionConstructor() {
  const host = browserHost();
  return host.SpeechRecognition || host.webkitSpeechRecognition || null;
}

function createControllerRecordingLifecycle(options) {
  const {
    clearTimeoutImpl = (timer) => browserHost().clearTimeout(timer),
    getReleaseBufferSeconds = () => 1,
    onBusyChange = () => {},
    onError = () => {},
    onStateChange = () => {},
    onStatus = () => {},
    recognitionConstructor = defaultSpeechRecognitionConstructor,
    setTimeoutImpl = (callback, delay) => browserHost().setTimeout(callback, delay),
    submitText
  } = options;

  let recognition = null;
  let state = "idle";
  let committedTranscriptSegments = [];
  let finalTranscriptSegments = [];
  let interimTranscriptSegments = [];
  let activeActionId = "";
  let releaseBufferTimer = null;

  function isBusy() {
    return state !== "idle";
  }

  function isCapturing() {
    return state === "listening" || state === "buffering" || state === "stopping";
  }

  function setState(nextState) {
    if (state === nextState) return;
    state = nextState;
    onBusyChange(isBusy());
    onStateChange(state);
  }

  function releaseBufferMs() {
    const seconds = Number(getReleaseBufferSeconds());
    return Math.max(0, Math.min(10, Number.isFinite(seconds) ? seconds : 1)) * 1000;
  }

  function clearReleaseBufferTimer() {
    if (releaseBufferTimer === null) return;
    clearTimeoutImpl(releaseBufferTimer);
    releaseBufferTimer = null;
  }

  function clearCaptureText() {
    committedTranscriptSegments = [];
    finalTranscriptSegments = [];
    interimTranscriptSegments = [];
  }

  function clearCurrentRecognitionText() {
    finalTranscriptSegments = [];
    interimTranscriptSegments = [];
  }

  function currentRecognitionTranscript() {
    const segmentCount = Math.max(finalTranscriptSegments.length, interimTranscriptSegments.length);
    const segments = [];
    for (let index = 0; index < segmentCount; index += 1) {
      const segment = finalTranscriptSegments[index] || interimTranscriptSegments[index] || "";
      if (segment) segments.push(segment);
    }
    return segments.join(" ").trim();
  }

  function capturedTranscript() {
    return [...committedTranscriptSegments, currentRecognitionTranscript()]
      .filter(Boolean)
      .join(" ")
      .slice(0, MAX_CAPTURED_TRANSCRIPT_CHARACTERS)
      .trim();
  }

  function commitCurrentRecognitionTranscript() {
    const currentTranscript = currentRecognitionTranscript();
    if (currentTranscript) committedTranscriptSegments.push(currentTranscript);
    if (committedTranscriptSegments.length > MAX_CAPTURED_RESULT_SEGMENTS) {
      committedTranscriptSegments = committedTranscriptSegments.slice(-MAX_CAPTURED_RESULT_SEGMENTS);
    }
    clearCurrentRecognitionText();
  }

  function updateTranscriptFromResults(results, resultIndex = 0) {
    const startIndex = Math.max(0, Math.min(results.length, Number.isFinite(resultIndex) ? Math.floor(resultIndex) : 0));
    for (let index = startIndex; index < results.length; index += 1) {
      const resultTranscript = (results[index]?.[0]?.transcript || "").trim();
      if (results[index]?.isFinal) {
        finalTranscriptSegments[index] = resultTranscript;
        interimTranscriptSegments[index] = "";
      } else {
        interimTranscriptSegments[index] = resultTranscript;
      }
    }
    if (finalTranscriptSegments.length > MAX_CAPTURED_RESULT_SEGMENTS) {
      finalTranscriptSegments.length = MAX_CAPTURED_RESULT_SEGMENTS;
    }
    if (interimTranscriptSegments.length > MAX_CAPTURED_RESULT_SEGMENTS) {
      interimTranscriptSegments.length = MAX_CAPTURED_RESULT_SEGMENTS;
    }
  }

  function stopActiveRecognition() {
    if (!recognition) return;
    try {
      recognition.stop();
    } catch {
      finishWithoutSubmit("Could not stop recording");
    }
  }

  function detachRecognition(activeRecognition) {
    if (!activeRecognition) return;
    activeRecognition.onresult = null;
    activeRecognition.onerror = null;
    activeRecognition.onend = null;
  }

  function finishWithoutSubmit(message = "No speech detected") {
    clearReleaseBufferTimer();
    detachRecognition(recognition);
    recognition = null;
    activeActionId = "";
    clearCaptureText();
    setState("idle");
    onStatus(message);
  }

  async function submitCapturedTranscript(actionId, text) {
    onStatus("Saving transcript");
    await submitText(actionId, text);
  }

  function configureRecognition(activeRecognition) {
    activeRecognition.continuous = true;
    activeRecognition.interimResults = true;
    activeRecognition.maxAlternatives = 1;
    activeRecognition.lang = "en-US";
    activeRecognition.onresult = (event) => {
      updateTranscriptFromResults(event.results, event.resultIndex);
    };
    activeRecognition.onerror = (event) => handleRecognitionError(event);
    activeRecognition.onend = () => handleRecognitionEnd(activeRecognition);
  }

  function startRecognitionSession(Recognition = recognitionConstructor()) {
    if (!Recognition) return false;
    const nextRecognition = new Recognition();
    configureRecognition(nextRecognition);
    recognition = nextRecognition;
    try {
      nextRecognition.start();
      return true;
    } catch {
      detachRecognition(nextRecognition);
      if (recognition === nextRecognition) recognition = null;
      return false;
    }
  }

  function handleRecognitionEnd(activeRecognition) {
    if (recognition !== activeRecognition) return;
    clearReleaseBufferTimer();
    commitCurrentRecognitionTranscript();
    const finalTranscript = capturedTranscript();
    const actionIdToSubmit = activeActionId;
    const shouldSubmit = (state === "buffering" || state === "stopping") && Boolean(actionIdToSubmit);
    detachRecognition(activeRecognition);
    recognition = null;
    if (state === "listening" && actionIdToSubmit) {
      if (startRecognitionSession()) {
        onStatus("Listening");
        return;
      }
      finishWithoutSubmit("Could not restart microphone");
      return;
    }
    activeActionId = "";
    if (shouldSubmit && finalTranscript) {
      clearCaptureText();
      setState("submitting");
      Promise.resolve(submitCapturedTranscript(actionIdToSubmit, finalTranscript)).finally(() => {
        setState("idle");
      });
      return;
    }
    finishWithoutSubmit();
  }

  function handleRecognitionError(event) {
    const fatalError = event.error === "not-allowed" || event.error === "service-not-allowed" || event.error === "audio-capture";
    if (state === "listening" && event.error === "no-speech") {
      onStatus("Listening");
      return;
    }
    if ((state === "buffering" || state === "stopping") && !fatalError) {
      onStatus("Finishing transcript");
      return;
    }
    const message = event.error === "not-allowed" ? "Microphone access was blocked" : "Voice capture failed";
    cancel({ abort: true, message });
    onError(message);
  }

  function cancel({ abort = true, message = "" } = {}) {
    const activeRecognition = recognition;
    clearReleaseBufferTimer();
    recognition = null;
    activeActionId = "";
    clearCaptureText();
    setState("idle");
    detachRecognition(activeRecognition);
    if (activeRecognition && abort) {
      try {
        if (activeRecognition.abort) activeRecognition.abort();
        else activeRecognition.stop?.();
      } catch {
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
    setState("listening");
    onStatus("Listening");
    if (startRecognitionSession(Recognition)) return true;
    activeActionId = "";
    clearCaptureText();
    setState("idle");
    onStatus("Could not start microphone");
    return false;
  }

  function release(actionId) {
    if (state !== "listening" || activeActionId !== actionId) return false;
    setState("buffering");
    onStatus("Processing speech");
    const waitMs = releaseBufferMs();
    releaseBufferTimer = setTimeoutImpl(() => {
      releaseBufferTimer = null;
      if (state !== "buffering") return;
      setState("stopping");
      stopActiveRecognition();
    }, waitMs);
    return true;
  }

  return Object.freeze({ begin, cancel, isBusy, isCapturing, release, state: () => state });
}

module.exports = Object.freeze({
  MAX_CAPTURED_RESULT_SEGMENTS,
  MAX_CAPTURED_TRANSCRIPT_CHARACTERS,
  createControllerRecordingLifecycle,
  defaultSpeechRecognitionConstructor
});
