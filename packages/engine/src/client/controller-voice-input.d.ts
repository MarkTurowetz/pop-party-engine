export type ControllerVoiceDictionary = Record<string, unknown>;
export type MicrophonePermissionState = "granted" | "denied" | "prompt" | null;
export type MicrophonePermissionResult = MicrophonePermissionState | { state?: MicrophonePermissionState };

export interface ControllerVoiceInputOptions {
  getButton: () => HTMLButtonElement | null;
  getReleaseBufferSeconds: () => number;
  queryMicrophonePermission?: () => Promise<MicrophonePermissionResult>;
  renderGlobalMessage: (lobby: ControllerVoiceDictionary, message: string, options: { id: string }) => void;
  setButtonText?: (target: HTMLElement, value: unknown, spec?: ControllerVoiceDictionary) => void;
  setText?: (target: HTMLElement, value: unknown) => void;
  status: HTMLElement;
  submitText: (actionId: string, text: string) => Promise<unknown> | unknown;
}

export interface ControllerVoiceInput {
  bindButton(actionId: string): void;
  isCapturing(): boolean;
  isListening(): boolean;
  renderWaiting(lobby: ControllerVoiceDictionary): void;
  resetUi(): void;
  start(actionId: string): void;
  stopRecognition(): void;
}

export const BUTTON_SPEC: Readonly<{ width: 300; height: 64; fontSize: 24 }>;
export function defaultQueryMicrophonePermission(): Promise<MicrophonePermissionResult>;
export function shouldDeferVoiceHeartbeat(currentLobby: ControllerVoiceDictionary | null, nextLobby: ControllerVoiceDictionary, isCapturing: boolean): boolean;
export function createControllerVoiceInput(options: ControllerVoiceInputOptions): ControllerVoiceInput;
