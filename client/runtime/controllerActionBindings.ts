// Typed port of the legacy client/controller-action-bindings.js IIFE. Imports the
// ported PartyGameControllerText directly and installs
// window.createControllerActionBindings for the legacy controller runtime.

import { PartyGameControllerText } from "./controllerTextRenderer";

type Dict = Record<string, unknown>;

interface SubmitApi {
  startOrCancelGame(options: { isCancel: boolean; startToken?: string }): Promise<{ lobby?: unknown }>;
  presentIntro(options: { startToken?: string }): Promise<{ lobby?: unknown }>;
}

export interface ControllerActionBindingsOptions {
  applyLayoutForPhase: (phase: string) => void;
  closeAvatarPicker: (options: { commit: boolean }) => void;
  elements: Record<string, HTMLButtonElement & HTMLElement> & Record<string, HTMLElement>;
  getControllerState: () => Dict | null | undefined;
  getSessionRuntime: () => { sendLeaveBeacon: (origin: string) => void };
  getSubmitApi: () => SubmitApi;
  openAvatarPicker: () => void;
  origin: string;
  renderState: (lobby: unknown) => void;
  setButtonText?: (target: HTMLElement, value: unknown, spec?: Dict) => void;
  setMetaText: (message: string) => void;
}

export function createControllerActionBindings(options: ControllerActionBindingsOptions) {
  const {
    applyLayoutForPhase,
    closeAvatarPicker,
    elements,
    getControllerState,
    getSessionRuntime,
    getSubmitApi,
    openAvatarPicker,
    origin,
    renderState,
    setButtonText,
    setMetaText
  } = options;

  const writeButtonText =
    typeof setButtonText === "function"
      ? setButtonText
      : (target: HTMLElement, value: unknown, spec?: Dict) => {
          PartyGameControllerText.setButtonText(target, value, spec);
        };

  function bindStartButton(): void {
    elements.startButton.addEventListener("click", async () => {
      const state = getControllerState();
      if (!(state?.player as Dict)?.isVip) return;
      const isCancel = (elements.startButton as HTMLButtonElement).dataset.optionId === "lobby.cancelStart";
      try {
        const result = await getSubmitApi().startOrCancelGame({ isCancel, startToken: state?.startToken as string });
        if (result.lobby) renderState(result.lobby);
      } catch (error) {
        setMetaText((error as Error).message);
      }
    });
  }

  function bindAvatarPicker(): void {
    elements.avatar.addEventListener("click", openAvatarPicker);
    elements.avatarPicker.addEventListener("click", (event) => {
      if (event.target === elements.avatarPicker) closeAvatarPicker({ commit: true });
    });
    elements.avatarPickerPanel.addEventListener("click", (event) => {
      event.stopPropagation();
    });
    elements.avatarPickerDoneButton.addEventListener("click", () => closeAvatarPicker({ commit: true }));
  }

  function bindIntroButton(): void {
    elements.introPresentButton.addEventListener("click", async () => {
      const state = getControllerState();
      if (!(state?.player as Dict)?.isVip) return;
      (elements.introPresentButton as HTMLButtonElement).disabled = true;
      try {
        const result = await getSubmitApi().presentIntro({ startToken: state?.startToken as string });
        if (result.lobby) renderState(result.lobby);
      } catch (error) {
        writeButtonText(elements.introPresentButton, (error as Error).message, { width: 300, height: 64, fontSize: 22 });
        window.setTimeout(() => {
          writeButtonText(elements.introPresentButton, "Present HI THERE", { width: 300, height: 64, fontSize: 24 });
        }, 1800);
      } finally {
        (elements.introPresentButton as HTMLButtonElement).disabled = false;
      }
    });
  }

  function bindWindowLifecycle(): void {
    window.addEventListener("pagehide", () => {
      getSessionRuntime().sendLeaveBeacon(origin);
    });
    window.addEventListener("resize", () => {
      if (!elements.controllerScreen.classList.contains("hidden")) {
        const state = getControllerState();
        applyLayoutForPhase(state ? (state.phase as string) || "lobby" : "join");
      }
    });
  }

  function bindAll(): void {
    bindStartButton();
    bindAvatarPicker();
    bindIntroButton();
    bindWindowLifecycle();
  }

  return { bindAll };
}

declare global {
  interface Window {
    createControllerActionBindings?: typeof createControllerActionBindings;
  }
}

export function installControllerActionBindingsGlobals(target: Window | typeof globalThis = globalThis): void {
  (target as Window).createControllerActionBindings = createControllerActionBindings;
}

installControllerActionBindingsGlobals(typeof window !== "undefined" ? window : globalThis);
