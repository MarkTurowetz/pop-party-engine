// Typed port of the legacy client/controller-session-runtime.js IIFE. Installs
// window.createControllerSessionRuntime for the legacy controller runtime.

type Dict = Record<string, unknown>;

interface ControllerState {
  stageCode?: string;
  playerId?: string;
  player?: Dict;
}

export interface ControllerSessionRuntimeOptions {
  elements: Record<string, HTMLElement>;
  getControllerState: () => ControllerState | null | undefined;
  heartbeatRuntime: { start: () => void };
  renderState: (lobby: unknown) => void;
  setControllerState: (state: ControllerState) => void;
  setLocalValue: (key: string, value: string) => void;
  setSessionValue: (key: string, value: string) => void;
  showView: (viewId: string) => void;
}

export interface ControllerSessionRuntime {
  enterLobby(stageCode: string, playerId: string, lobby: unknown, player: { name?: string }): void;
  sendLeaveBeacon(origin: string): void;
}

export function createControllerSessionRuntime(options: ControllerSessionRuntimeOptions): ControllerSessionRuntime {
  const {
    elements,
    getControllerState,
    heartbeatRuntime,
    renderState,
    setControllerState,
    setLocalValue,
    setSessionValue,
    showView
  } = options;

  function enterLobby(stageCode: string, playerId: string, lobby: unknown, player: { name?: string }): void {
    setControllerState({ stageCode, playerId, player });
    setSessionValue("partyTemplatePlayerId", playerId);
    setSessionValue("partyTemplatePlayerName", player.name || "");
    setSessionValue("partyTemplateStageCode", stageCode);
    setLocalValue("partyTemplateStageCode", stageCode);
    elements.joinState.classList.add("hidden");
    showView("lobby");
    renderState(lobby);
    heartbeatRuntime.start();
  }

  function sendLeaveBeacon(origin: string): void {
    const state = getControllerState();
    if (!state || !navigator.sendBeacon) return;
    const body = JSON.stringify({ stageCode: state.stageCode, playerId: state.playerId });
    navigator.sendBeacon(`${origin}/api/leave`, new Blob([body], { type: "application/json" }));
  }

  return { enterLobby, sendLeaveBeacon };
}

declare global {
  interface Window {
    createControllerSessionRuntime?: typeof createControllerSessionRuntime;
  }
}

export function installControllerSessionRuntimeGlobals(target: Window | typeof globalThis = globalThis): void {
  (target as Window).createControllerSessionRuntime = createControllerSessionRuntime;
}

installControllerSessionRuntimeGlobals(typeof window !== "undefined" ? window : globalThis);
