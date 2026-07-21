// Typed port of the legacy client/controller-heartbeat-runtime.js IIFE. Installs
// window.createControllerHeartbeatRuntime for the legacy controller runtime.

type Dict = Record<string, unknown>;

export interface ControllerHeartbeatOptions {
  applyLayoutForPhase: (phase: string) => void;
  closeAvatarPicker: (options: { commit: boolean }) => void;
  elements: { meta: HTMLElement } & Record<string, HTMLElement>;
  getJoinButton: () => HTMLButtonElement;
  getControllerState: () => unknown;
  hideViews: () => void;
  renderState: (lobby: unknown) => void;
  sendHeartbeat: () => Promise<{ lobby: unknown }>;
  setText?: (target: HTMLElement, value: unknown) => void;
  setControllerState: (state: unknown) => void;
  showView: (viewId: string) => void;
}

export interface ControllerHeartbeatRuntime {
  poll(): Promise<void>;
  start(): void;
  stop(): void;
}

export function createControllerHeartbeatRuntime(options: ControllerHeartbeatOptions): ControllerHeartbeatRuntime {
  const {
    applyLayoutForPhase,
    closeAvatarPicker,
    elements,
    getJoinButton,
    getControllerState,
    hideViews,
    renderState,
    sendHeartbeat,
    setText,
    setControllerState,
    showView
  } = options;

  const writeText =
    typeof setText === "function"
      ? setText
      : (target: HTMLElement, value: unknown) => {
          window.PartyGameControllerText?.setText(target, value);
        };

  let timer: number | null = null;
  let polling = false;
  let runId = 0;

  function stop(): void {
    if (timer !== null) window.clearInterval(timer);
    timer = null;
    runId += 1;
  }

  async function pollHeartbeat(): Promise<void> {
    const state = getControllerState();
    if (!state || polling) return;
    const activeRunId = runId;
    polling = true;
    try {
      const result = await sendHeartbeat();
      if (activeRunId !== runId) return;
      renderState(result.lobby);
    } catch (error) {
      if ((error as Dict)?.code === "KICKED_TO_LOBBY") {
        stop();
        setControllerState(null);
        closeAvatarPicker({ commit: false });
        hideViews();
        showView("join");
        applyLayoutForPhase("join");
        getJoinButton().disabled = false;
        return;
      }
      writeText(elements.meta, "Reconnecting to lobby");
    } finally {
      polling = false;
    }
  }

  function start(): void {
    stop();
    timer = window.setInterval(pollHeartbeat, 1000);
  }

  return { poll: pollHeartbeat, start, stop };
}

declare global {
  interface Window {
    createControllerHeartbeatRuntime?: typeof createControllerHeartbeatRuntime;
  }
}

export function installControllerHeartbeatGlobals(target: Window | typeof globalThis = globalThis): void {
  (target as Window).createControllerHeartbeatRuntime = createControllerHeartbeatRuntime;
}

installControllerHeartbeatGlobals(typeof window !== "undefined" ? window : globalThis);
