// Typed port of the legacy client/controller-action-bindings.js IIFE. Installs
// window.createControllerActionBindings for the controller runtime.

type Dict = Record<string, unknown>;

interface SubmitApi {
  startOrCancelGame(options: { isCancel: boolean; startToken?: string }): Promise<{ lobby?: unknown }>;
}

export interface ControllerActionBindingsOptions {
  applyLayoutForPhase: (phase: string) => void;
  closeAvatarPicker: (options: { commit: boolean }) => void;
  elements: Record<string, HTMLButtonElement & HTMLElement> & Record<string, HTMLElement>;
  getStartButton: () => HTMLButtonElement | null;
  getControllerState: () => Dict | null | undefined;
  getSessionRuntime: () => { sendLeaveBeacon: (origin: string) => void };
  getSubmitApi: () => SubmitApi;
  openAvatarPicker: () => void;
  origin: string;
  renderState: (lobby: unknown) => void;
  setMetaText: (message: string) => void;
}

export function createControllerActionBindings(options: ControllerActionBindingsOptions) {
  const {
    applyLayoutForPhase,
    closeAvatarPicker,
    elements,
    getStartButton,
    getControllerState,
    getSessionRuntime,
    getSubmitApi,
    openAvatarPicker,
    origin,
    renderState,
    setMetaText
  } = options;

  function bindStartButton(): void {
    elements.startButtonContainer.addEventListener("click", async (event) => {
      const button = (event.target as HTMLElement | null)?.closest?.("button") as HTMLButtonElement | null;
      if (!button || button !== getStartButton()) return;
      const state = getControllerState();
      if (!(state?.player as Dict)?.isVip) return;
      const isCancel = button.dataset.optionId === "lobby.cancelStart";
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
