// Typed port of the legacy client/controller-voice-input.js IIFE. Imports the
// ported recording lifecycle + controller text directly and installs
// window.createControllerVoiceInput for the legacy controller runtime.

import {
  createControllerRecordingLifecycle,
  type ControllerRecordingLifecycle,
  type ControllerRecordingState
} from "./controllerRecordingLifecycle";
import { PartyGameControllerText } from "./controllerTextRenderer";

type Dict = Record<string, unknown>;
const BUTTON_SPEC = { width: 300, height: 64, fontSize: 24 };

export interface ControllerVoiceInputOptions {
  getButton: () => HTMLButtonElement | null;
  getReleaseBufferSeconds: () => number;
  previewText: (actionId: string, text: string) => Promise<unknown> | unknown;
  renderGlobalMessage: (lobby: Dict, message: string, options: { id: string }) => void;
  setButtonText?: (target: HTMLElement, value: unknown, spec?: Dict) => void;
  setText?: (target: HTMLElement, value: unknown) => void;
  status: HTMLElement;
  submitText: (actionId: string, text: string) => Promise<unknown> | unknown;
}

export interface ControllerVoiceInput {
  bindButton(actionId: string): void;
  isCapturing(): boolean;
  isListening(): boolean;
  renderWaiting(lobby: Dict): void;
  resetUi(): void;
  start(actionId: string): void;
  stopRecognition(): void;
}

export function shouldDeferVoiceHeartbeat(
  currentLobby: Dict | null,
  nextLobby: Dict,
  isCapturing: boolean
): boolean {
  const currentVoiceInput = currentLobby?.textInput as Dict | undefined;
  const nextVoiceInput = nextLobby?.textInput as Dict | undefined;
  return Boolean(
    isCapturing &&
      !nextLobby?.isPaused &&
      currentLobby?.phase === nextLobby?.phase &&
      currentVoiceInput?.actionId &&
      currentVoiceInput.actionId === nextVoiceInput?.actionId &&
      (nextVoiceInput?.type === "voice" || nextVoiceInput?.mode === "voiceVip")
  );
}

export function createControllerVoiceInput(options: ControllerVoiceInputOptions): ControllerVoiceInput {
  const {
    getButton,
    getReleaseBufferSeconds,
    previewText,
    renderGlobalMessage,
    setButtonText,
    setText,
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
  let activePressActionId = "";
  let activePressToken = 0;
  let renderedButton: HTMLButtonElement | null = null;
  let renderedButtonText = "";
  let renderedStatusText = "";
  const rememberedAccessKey = "partyTemplate.microphoneAccessGranted";

  function setStatusText(value: string): void {
    if (renderedStatusText === value && status.dataset?.textFitSource === value) return;
    renderedStatusText = value;
    writeText(status, value);
  }

  function setButtonPresentation(text: string, disabled: boolean): void {
    const button = getButton();
    if (!button) return;
    const currentText = button.dataset?.controllerTextValue || "";
    if (renderedButton !== button || renderedButtonText !== text || currentText !== text) {
      writeButtonText(button, text, { ...BUTTON_SPEC });
      renderedButton = button;
      renderedButtonText = text;
    }
    if (button.disabled !== disabled) button.disabled = disabled;
  }

  function renderRecordingState(state: ControllerRecordingState): void {
    if (state === "listening") {
      // Keeping the button enabled preserves pointer capture until release.
      setButtonPresentation("Release To Send", false);
      return;
    }
    if (state === "buffering" || state === "stopping" || state === "submitting") {
      setButtonPresentation("Processing", true);
      return;
    }
    setButtonPresentation("Hold To Record", false);
  }

  function getLifecycle(): ControllerRecordingLifecycle {
    if (!lifecycle) {
      lifecycle = createControllerRecordingLifecycle({
        getReleaseBufferSeconds,
        onStateChange: renderRecordingState,
        onError: () => {
          const button = getButton();
          if (button) button.disabled = false;
        },
        onStatus: (message) => {
          setStatusText(message);
        },
        previewText,
        submitText
      });
    }
    return lifecycle;
  }

  function renderWaiting(lobby: Dict): void {
    getLifecycle().cancel();
    renderGlobalMessage(lobby, "Waiting for the VIP to answer", { id: "voiceInputWaiting" });
  }

  function resetUi(): void {
    renderRecordingState("idle");
    setStatusText("Hold to record");
  }

  function hasRememberedMicrophoneAccess(): boolean {
    try {
      return localStorage.getItem(rememberedAccessKey) === "true";
    } catch {
      return false;
    }
  }

  async function canRecordWithMicrophone(): Promise<boolean> {
    // The authored microphone-access step already opened getUserMedia and
    // records that success. Trust it before querying Permissions: desktop
    // browsers may report microphone as "prompt" or not implement the query at
    // all even though SpeechRecognition can use the granted microphone.
    if (hasRememberedMicrophoneAccess()) return true;
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
    // Unknown permission state is not denial. Let SpeechRecognition start and
    // surface its native not-allowed/audio-capture error if access is unusable.
    return true;
  }

  async function beginRecording(actionId: string, expectedPressToken: number | null = null): Promise<void> {
    const button = getButton();
    if (!button) return;
    if (!(await canRecordWithMicrophone())) {
      if (expectedPressToken !== null && expectedPressToken !== activePressToken) return;
      setStatusText("Give microphone access first");
      button.disabled = false;
      return;
    }
    if (
      expectedPressToken !== null &&
      (expectedPressToken !== activePressToken || activePressActionId !== actionId)
    ) return;
    getLifecycle().begin(actionId);
  }

  function finishRecording(actionId: string): void {
    const button = getButton();
    if (!button) return;
    getLifecycle().release(actionId);
  }

  function beginPress(actionId: string): void {
    activePressActionId = actionId;
    activePressToken += 1;
    void beginRecording(actionId, activePressToken);
  }

  function finishPress(actionId: string): void {
    if (activePressActionId === actionId) activePressActionId = "";
    activePressToken += 1;
    finishRecording(actionId);
  }

  function start(actionId: string): void {
    const recorder = getLifecycle();
    if (recorder.state() === "listening") finishRecording(actionId);
    else void beginRecording(actionId);
  }

  function bindButton(actionId: string): void {
    const button = getButton();
    if (!button) return;
    button.onclick = (event) => event.preventDefault();
    button.onpointerdown = (event) => {
      event.preventDefault();
      try {
        button.setPointerCapture?.(event.pointerId);
      } catch {
        // Pointer capture is best-effort across mobile browsers.
      }
      beginPress(actionId);
    };
    button.onpointerup = (event) => {
      event.preventDefault();
      try {
        if (button.hasPointerCapture?.(event.pointerId)) button.releasePointerCapture(event.pointerId);
      } catch {
        // Pointer capture is best-effort across mobile browsers.
      }
      finishPress(actionId);
    };
    button.onpointercancel = (event) => {
      event.preventDefault();
      finishPress(actionId);
    };
    button.onkeydown = (event) => {
      if ((event.key !== " " && event.key !== "Enter") || event.repeat) return;
      event.preventDefault();
      beginPress(actionId);
    };
    button.onkeyup = (event) => {
      if (event.key !== " " && event.key !== "Enter") return;
      event.preventDefault();
      finishPress(actionId);
    };
    renderRecordingState(getLifecycle().state());
  }

  return {
    bindButton,
    isCapturing: () => getLifecycle().isCapturing(),
    isListening: () => getLifecycle().isBusy(),
    renderWaiting,
    resetUi,
    start,
    stopRecognition: () => {
      activePressActionId = "";
      activePressToken += 1;
      getLifecycle().cancel();
    }
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
