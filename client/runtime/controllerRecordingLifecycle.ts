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
  onresult: ((event: { results: RecognitionResults }) => void) | null;
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
  onStatus?: (message: string) => void;
  placeholderText?: string;
  previewText: (actionId: string, text: string) => Promise<unknown> | unknown;
  recognitionConstructor?: () => SpeechRecognitionConstructor | null;
  submitText: (actionId: string, text: string) => Promise<unknown> | unknown;
}

export interface ControllerRecordingLifecycle {
  begin(actionId: string): boolean;
  cancel(options?: { abort?: boolean; message?: string }): void;
  isBusy(): boolean;
  release(actionId: string): boolean;
  state(): string;
}

export function createControllerRecordingLifecycle(options: ControllerRecordingLifecycleOptions): ControllerRecordingLifecycle {
  const {
    getReleaseBufferSeconds = () => 1,
    onBusyChange = () => {},
    onError = () => {},
    onStatus = () => {},
    placeholderText = "T",
    previewText,
    recognitionConstructor = defaultSpeechRecognitionConstructor,
    submitText
  } = options;

  let recognition: SpeechRecognitionLike | null = null;
  let state = "idle";
  let transcript = "";
  let interimTranscript = "";
  let activeActionId = "";
  let previewPromise: Promise<unknown> = Promise.resolve(null);
  let releaseBufferTimer: number | null = null;

  function isBusy(): boolean {
    return state !== "idle";
  }

  function setState(nextState: string): void {
    state = nextState;
    onBusyChange(isBusy());
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
    transcript = "";
    interimTranscript = "";
  }

  function capturedTranscript(): string {
    return (transcript.trim() || interimTranscript.trim()).trim();
  }

  function updateTranscriptFromResults(results: RecognitionResults): void {
    const finalParts: string[] = [];
    const interimParts: string[] = [];
    for (let index = 0; index < results.length; index += 1) {
      const resultTranscript = results[index]?.[0]?.transcript || "";
      if (!resultTranscript.trim()) continue;
      if (results[index]?.isFinal) finalParts.push(resultTranscript);
      else interimParts.push(resultTranscript);
    }
    transcript = finalParts.join(" ").trim();
    interimTranscript = interimParts.join(" ").trim();
  }

  function stopActiveRecognition(): void {
    if (!recognition) return;
    try {
      recognition.stop();
    } catch {
      finishWithoutSubmit("Could not stop recording");
    }
  }

  function finishWithoutSubmit(message = "No speech detected"): void {
    clearReleaseBufferTimer();
    recognition = null;
    activeActionId = "";
    clearCaptureText();
    previewPromise = Promise.resolve(null);
    setState("idle");
    onStatus(message);
  }

  async function submitCapturedTranscript(actionId: string, text: string): Promise<void> {
    onStatus("Finishing transcript");
    try {
      await previewPromise;
    } catch {
      // The final transcript can still update the stage if the temporary preview failed.
    }
    onStatus("Saving transcript");
    await submitText(actionId, text);
  }

  function handleRecognitionEnd(): void {
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

  function handleRecognitionError(event: { error: string }): void {
    const fatalError = event.error === "not-allowed" || event.error === "service-not-allowed" || event.error === "audio-capture";
    if ((state === "buffering" || state === "stopping") && !fatalError) {
      onStatus("Finishing transcript");
      return;
    }
    const message = event.error === "not-allowed" ? "Microphone access was blocked" : "Voice capture failed";
    cancel({ abort: false, message });
    onError(message);
  }

  function cancel({ abort = true, message = "" }: { abort?: boolean; message?: string } = {}): void {
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
    } catch {
      recognition = null;
      activeActionId = "";
      clearCaptureText();
      setState("idle");
      onStatus("Could not start microphone");
      return false;
    }
  }

  function release(actionId: string): boolean {
    if (state !== "listening" || activeActionId !== actionId) return false;
    setState("buffering");
    onStatus("Processing speech");
    previewPromise = Promise.resolve(previewText(actionId, placeholderText))
      .then(() => {
        if (state === "buffering" || state === "stopping") onStatus("Finishing transcript");
      })
      .catch((error: Error) => {
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

export function installControllerRecordingLifecycleGlobals(target: Window | typeof globalThis = globalThis): void {
  (target as Window).createControllerRecordingLifecycle = createControllerRecordingLifecycle;
}

installControllerRecordingLifecycleGlobals(typeof window !== "undefined" ? window : globalThis);
