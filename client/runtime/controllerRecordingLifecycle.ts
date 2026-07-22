export {
  createControllerRecordingLifecycle,
  defaultSpeechRecognitionConstructor,
  MAX_CAPTURED_RESULT_SEGMENTS,
  MAX_CAPTURED_TRANSCRIPT_CHARACTERS,
  type ControllerRecordingLifecycle,
  type ControllerRecordingLifecycleOptions,
  type ControllerRecordingState,
  type RecognitionAlternative,
  type RecognitionResult,
  type RecognitionResults,
  type SpeechRecognitionConstructor,
  type SpeechRecognitionLike
} from "@pop-party/engine/client";

import {
  createControllerRecordingLifecycle,
  type SpeechRecognitionConstructor
} from "@pop-party/engine/client";

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
    createControllerRecordingLifecycle?: typeof createControllerRecordingLifecycle;
  }
}

export function installControllerRecordingLifecycleGlobals(target: Window | typeof globalThis = globalThis): void {
  (target as Window).createControllerRecordingLifecycle = createControllerRecordingLifecycle;
}

installControllerRecordingLifecycleGlobals(typeof window !== "undefined" ? window : globalThis);
