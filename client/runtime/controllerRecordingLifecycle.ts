// Typed port of the legacy client/controller-recording-lifecycle.js IIFE — a
// SpeechRecognition capture state machine. Installs
// window.createControllerRecordingLifecycle for the legacy controller runtime.

interface RecognitionAlternative {
  transcript?: string;
}
interface RecognitionResult {
  isFinal?: boolean;
  [index: number]: RecognitionAlternative | undefined;
}
interface RecognitionResults {
  length: number;
  [index: number]: RecognitionResult | undefined;
}
interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives?: number;
  onresult: ((event: { resultIndex?: number; results: RecognitionResults }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort?(): void;
}
type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
    createControllerRecordingLifecycle?: typeof createControllerRecordingLifecycle;
  }
}

function defaultSpeechRecognitionConstructor(): SpeechRecognitionConstructor | null {
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

export interface ControllerRecordingLifecycleOptions {
  getReleaseBufferSeconds?: () => number;
  onBusyChange?: (busy: boolean) => void;
  onError?: (message: string) => void;
  onStateChange?: (state: ControllerRecordingState) => void;
  onStatus?: (message: string) => void;
  recognitionConstructor?: () => SpeechRecognitionConstructor | null;
  submitText: (actionId: string, text: string) => Promise<unknown> | unknown;
}

export type ControllerRecordingState = "idle" | "listening" | "buffering" | "stopping" | "submitting";

export interface ControllerRecordingLifecycle {
  begin(actionId: string): boolean;
  cancel(options?: { abort?: boolean; message?: string }): void;
  isBusy(): boolean;
  isCapturing(): boolean;
  release(actionId: string): boolean;
  state(): ControllerRecordingState;
}

const MAX_CAPTURED_TRANSCRIPT_CHARACTERS = 4096;
const MAX_CAPTURED_RESULT_SEGMENTS = 256;

export function createControllerRecordingLifecycle(options: ControllerRecordingLifecycleOptions): ControllerRecordingLifecycle {
  const {
    getReleaseBufferSeconds = () => 1,
    onBusyChange = () => {},
    onError = () => {},
    onStateChange = () => {},
    onStatus = () => {},
    recognitionConstructor = defaultSpeechRecognitionConstructor,
    submitText
  } = options;

  let recognition: SpeechRecognitionLike | null = null;
  let state: ControllerRecordingState = "idle";
  let committedTranscriptSegments: string[] = [];
  let finalTranscriptSegments: string[] = [];
  let interimTranscriptSegments: string[] = [];
  let activeActionId = "";
  let releaseBufferTimer: number | null = null;

  function isBusy(): boolean {
    return state !== "idle";
  }

  function isCapturing(): boolean {
    return state === "listening" || state === "buffering" || state === "stopping";
  }

  function setState(nextState: ControllerRecordingState): void {
    if (state === nextState) return;
    state = nextState;
    onBusyChange(isBusy());
    onStateChange(state);
  }

  function releaseBufferMs(): number {
    const seconds = Number(getReleaseBufferSeconds());
    return Math.max(0, Math.min(10, Number.isFinite(seconds) ? seconds : 1)) * 1000;
  }

  function clearReleaseBufferTimer(): void {
    if (releaseBufferTimer === null) return;
    window.clearTimeout(releaseBufferTimer);
    releaseBufferTimer = null;
  }

  function clearCaptureText(): void {
    committedTranscriptSegments = [];
    finalTranscriptSegments = [];
    interimTranscriptSegments = [];
  }

  function clearCurrentRecognitionText(): void {
    finalTranscriptSegments = [];
    interimTranscriptSegments = [];
  }

  function currentRecognitionTranscript(): string {
    const segmentCount = Math.max(finalTranscriptSegments.length, interimTranscriptSegments.length);
    const segments: string[] = [];
    for (let index = 0; index < segmentCount; index += 1) {
      const segment = finalTranscriptSegments[index] || interimTranscriptSegments[index] || "";
      if (segment) segments.push(segment);
    }
    return segments.join(" ").trim();
  }

  function capturedTranscript(): string {
    return [...committedTranscriptSegments, currentRecognitionTranscript()]
      .filter(Boolean)
      .join(" ")
      .slice(0, MAX_CAPTURED_TRANSCRIPT_CHARACTERS)
      .trim();
  }

  function commitCurrentRecognitionTranscript(): void {
    const currentTranscript = currentRecognitionTranscript();
    if (currentTranscript) committedTranscriptSegments.push(currentTranscript);
    if (committedTranscriptSegments.length > MAX_CAPTURED_RESULT_SEGMENTS) {
      committedTranscriptSegments = committedTranscriptSegments.slice(-MAX_CAPTURED_RESULT_SEGMENTS);
    }
    clearCurrentRecognitionText();
  }

  function updateTranscriptFromResults(results: RecognitionResults, resultIndex = 0): void {
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

  function stopActiveRecognition(): void {
    if (!recognition) return;
    try {
      recognition.stop();
    } catch {
      finishWithoutSubmit("Could not stop recording");
    }
  }

  function detachRecognition(activeRecognition: SpeechRecognitionLike | null): void {
    if (!activeRecognition) return;
    activeRecognition.onresult = null;
    activeRecognition.onerror = null;
    activeRecognition.onend = null;
  }

  function finishWithoutSubmit(message = "No speech detected"): void {
    clearReleaseBufferTimer();
    detachRecognition(recognition);
    recognition = null;
    activeActionId = "";
    clearCaptureText();
    setState("idle");
    onStatus(message);
  }

  async function submitCapturedTranscript(actionId: string, text: string): Promise<void> {
    onStatus("Saving transcript");
    await submitText(actionId, text);
  }

  function configureRecognition(activeRecognition: SpeechRecognitionLike): void {
    activeRecognition.continuous = true;
    // Bluetooth microphones can finalize late or only when recognition stops.
    // Keep interim snapshots as a capture-only fallback; they are reconciled
    // by result index and never submitted until the user releases the button.
    activeRecognition.interimResults = true;
    activeRecognition.maxAlternatives = 1;
    activeRecognition.lang = "en-US";
    activeRecognition.onresult = (event) => {
      updateTranscriptFromResults(event.results, event.resultIndex);
    };
    activeRecognition.onerror = (event) => handleRecognitionError(event);
    activeRecognition.onend = () => handleRecognitionEnd(activeRecognition);
  }

  function startRecognitionSession(Recognition = recognitionConstructor()): boolean {
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

  function handleRecognitionEnd(activeRecognition: SpeechRecognitionLike): void {
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

  function handleRecognitionError(event: { error: string }): void {
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

  function cancel({ abort = true, message = "" }: { abort?: boolean; message?: string } = {}): void {
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

  function begin(actionId: string): boolean {
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
    if (startRecognitionSession(Recognition)) {
      return true;
    }
    activeActionId = "";
    clearCaptureText();
    setState("idle");
    onStatus("Could not start microphone");
    return false;
  }

  function release(actionId: string): boolean {
    if (state !== "listening" || activeActionId !== actionId) return false;
    setState("buffering");
    onStatus("Processing speech");
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
    isCapturing,
    release,
    state: () => state
  };
}

export function installControllerRecordingLifecycleGlobals(target: Window | typeof globalThis = globalThis): void {
  (target as Window).createControllerRecordingLifecycle = createControllerRecordingLifecycle;
}

installControllerRecordingLifecycleGlobals(typeof window !== "undefined" ? window : globalThis);
