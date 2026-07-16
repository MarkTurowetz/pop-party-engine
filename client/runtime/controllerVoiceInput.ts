// Typed port of the legacy client/controller-voice-input.js IIFE. Imports the
// ported recording lifecycle + controller text directly and installs
// window.createControllerVoiceInput for the legacy controller runtime.

import { createControllerRecordingLifecycle, type ControllerRecordingLifecycle } from "./controllerRecordingLifecycle";
import { PartyGameControllerText } from "./controllerTextRenderer";
import { controllerLayoutStateIds } from "../../shared/controller-layout-states";

type Dict = Record<string, unknown>;
const BUTTON_SPEC = { width: 300, height: 64, fontSize: 24 };

export interface ControllerVoiceInputOptions {
  applyLayoutForPhase: (phase: string) => void;
  button: HTMLButtonElement;
  getReleaseBufferSeconds: () => number;
  hideViews: () => void;
  introMessage: HTMLElement;
  introState?: HTMLElement;
  previewText: (actionId: string, text: string) => Promise<unknown> | unknown;
  renderGlobalMessage?: (lobby: Dict, message: string, options: { id: string }) => void;
  setButtonText?: (target: HTMLElement, value: unknown, spec?: Dict) => void;
  setText?: (target: HTMLElement, value: unknown) => void;
  showView: (viewId: string) => void;
  status: HTMLElement;
  submitText: (actionId: string, text: string) => Promise<unknown> | unknown;
}

export interface ControllerVoiceInput {
  bindButton(actionId: string): void;
  isListening(): boolean;
  renderWaiting(lobby: Dict): void;
  resetUi(): void;
  start(actionId: string): void;
  stopRecognition(): void;
}

export function createControllerVoiceInput(options: ControllerVoiceInputOptions): ControllerVoiceInput {
  const {
    applyLayoutForPhase,
    button,
    getReleaseBufferSeconds,
    hideViews,
    introMessage,
    previewText,
    renderGlobalMessage,
    setButtonText,
    setText,
    showView,
    status,
    submitText
  } = options;

  const writeText =
    typeof setText === "function"
      ? setText
      : (target: HTMLElement, value: unknown) => {
          PartyGameControllerText.setText(target, value);
        };
  const writeButtonText = typeof setButtonText === "function" ? setButtonText : (writeText as (t: HTMLElement, v: unknown, s?: Dict) => void);

  let lifecycle: ControllerRecordingLifecycle | null = null;
  const rememberedAccessKey = "partyTemplate.microphoneAccessGranted";

  function setButtonState(isBusy: boolean): void {
    if (!isBusy) {
      writeButtonText(button, "Hold To Record", { ...BUTTON_SPEC });
      button.disabled = false;
      return;
    }
    button.disabled = true;
    writeButtonText(button, "Processing", { ...BUTTON_SPEC });
  }

  function getLifecycle(): ControllerRecordingLifecycle {
    if (!lifecycle) {
      lifecycle = createControllerRecordingLifecycle({
        getReleaseBufferSeconds,
        onBusyChange: setButtonState,
        onError: () => {
          button.disabled = false;
        },
        onStatus: (message) => {
          writeText(status, message);
        },
        previewText,
        submitText
      });
    }
    return lifecycle;
  }

  function renderWaiting(lobby: Dict): void {
    getLifecycle().cancel();
    if (typeof renderGlobalMessage === "function") {
      renderGlobalMessage(lobby, "Waiting for the VIP to answer", { id: "voiceInputWaiting" });
      return;
    }
    hideViews();
    applyLayoutForPhase(controllerLayoutStateIds.presentation);
    showView("intro");
    writeText(introMessage, "Waiting for the VIP to answer");
  }

  function resetUi(): void {
    writeButtonText(button, "Hold To Record", { ...BUTTON_SPEC });
    button.disabled = false;
    writeText(status, "Hold to record");
  }

  function hasRememberedMicrophoneAccess(): boolean {
    try {
      return localStorage.getItem(rememberedAccessKey) === "true";
    } catch {
      return false;
    }
  }

  async function canRecordWithMicrophone(): Promise<boolean> {
    try {
      const permission = await navigator.permissions?.query?.({ name: "microphone" as PermissionName });
      if (permission?.state === "granted") {
        try {
          localStorage.setItem(rememberedAccessKey, "true");
        } catch {
          // Storage can be unavailable in private browsing modes.
        }
        return true;
      }
      if (permission?.state === "denied") return false;
    } catch {
      // Some browsers do not expose microphone permission state.
    }
    if (hasRememberedMicrophoneAccess()) {
      try {
        localStorage.removeItem(rememberedAccessKey);
      } catch {
        // Storage can be unavailable in private browsing modes.
      }
    }
    return false;
  }

  async function beginRecording(actionId: string): Promise<void> {
    if (!(await canRecordWithMicrophone())) {
      writeText(status, "Give microphone access first");
      button.disabled = false;
      return;
    }
    if (getLifecycle().begin(actionId)) {
      writeButtonText(button, "Release To Send", { ...BUTTON_SPEC });
      button.disabled = false;
    }
  }

  function finishRecording(actionId: string): void {
    if (getLifecycle().release(actionId)) {
      button.disabled = true;
      writeButtonText(button, "Processing", { ...BUTTON_SPEC });
    }
  }

  function start(actionId: string): void {
    const recorder = getLifecycle();
    if (recorder.state() === "listening") finishRecording(actionId);
    else void beginRecording(actionId);
  }

  function bindButton(actionId: string): void {
    button.onclick = (event) => event.preventDefault();
    button.onpointerdown = (event) => {
      event.preventDefault();
      try {
        button.setPointerCapture?.(event.pointerId);
      } catch {
        // Pointer capture is best-effort across mobile browsers.
      }
      void beginRecording(actionId);
    };
    button.onpointerup = (event) => {
      event.preventDefault();
      try {
        if (button.hasPointerCapture?.(event.pointerId)) button.releasePointerCapture(event.pointerId);
      } catch {
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
      void beginRecording(actionId);
    };
    button.onkeyup = (event) => {
      if (event.key !== " " && event.key !== "Enter") return;
      event.preventDefault();
      finishRecording(actionId);
    };
  }

  return {
    bindButton,
    isListening: () => getLifecycle().isBusy(),
    renderWaiting,
    resetUi,
    start,
    stopRecognition: () => getLifecycle().cancel()
  };
}

declare global {
  interface Window {
    createControllerVoiceInput?: typeof createControllerVoiceInput;
  }
}

export function installControllerVoiceInputGlobals(target: Window | typeof globalThis = globalThis): void {
  (target as Window).createControllerVoiceInput = createControllerVoiceInput;
}

installControllerVoiceInputGlobals(typeof window !== "undefined" ? window : globalThis);
