export interface RecognitionAlternative {
  transcript?: string;
}
export interface RecognitionResult {
  isFinal?: boolean;
  [index: number]: RecognitionAlternative | undefined;
}
export interface RecognitionResults {
  length: number;
  [index: number]: RecognitionResult | undefined;
}
export interface SpeechRecognitionLike {
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
export type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;
export type ControllerRecordingState = "idle" | "listening" | "buffering" | "stopping" | "submitting";

export interface ControllerRecordingLifecycleOptions {
  clearTimeoutImpl?: (timer: unknown) => void;
  getReleaseBufferSeconds?: () => number;
  onBusyChange?: (busy: boolean) => void;
  onError?: (message: string) => void;
  onStateChange?: (state: ControllerRecordingState) => void;
  onStatus?: (message: string) => void;
  recognitionConstructor?: () => SpeechRecognitionConstructor | null;
  setTimeoutImpl?: (callback: () => void, delay: number) => unknown;
  submitText: (actionId: string, text: string) => Promise<unknown> | unknown;
}

export interface ControllerRecordingLifecycle {
  begin(actionId: string): boolean;
  cancel(options?: { abort?: boolean; message?: string }): void;
  isBusy(): boolean;
  isCapturing(): boolean;
  release(actionId: string): boolean;
  state(): ControllerRecordingState;
}

export const MAX_CAPTURED_TRANSCRIPT_CHARACTERS: 4096;
export const MAX_CAPTURED_RESULT_SEGMENTS: 256;
export function defaultSpeechRecognitionConstructor(): SpeechRecognitionConstructor | null;
export function createControllerRecordingLifecycle(options: ControllerRecordingLifecycleOptions): ControllerRecordingLifecycle;
