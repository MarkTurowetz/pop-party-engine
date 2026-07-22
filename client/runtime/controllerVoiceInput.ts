export {
  BUTTON_SPEC,
  createControllerVoiceInput,
  defaultQueryMicrophonePermission,
  shouldDeferVoiceHeartbeat,
  type ControllerVoiceDictionary,
  type ControllerVoiceInput,
  type ControllerVoiceInputOptions,
  type MicrophonePermissionResult,
  type MicrophonePermissionState
} from "@pop-party/engine/client";

import { createControllerVoiceInput } from "@pop-party/engine/client";

declare global {
  interface Window {
    createControllerVoiceInput?: typeof createControllerVoiceInput;
  }
}

export function installControllerVoiceInputGlobals(target: Window | typeof globalThis = globalThis): void {
  (target as Window).createControllerVoiceInput = createControllerVoiceInput;
}

installControllerVoiceInputGlobals(typeof window !== "undefined" ? window : globalThis);
