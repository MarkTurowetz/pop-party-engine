export type ControllerSessionDictionary = Record<string, unknown>;

export interface ControllerSessionState {
  stageCode?: string;
  playerId?: string;
  playerCapability?: string;
  player?: ControllerSessionDictionary;
}

export interface ControllerSessionPlayer extends ControllerSessionDictionary {
  name?: string;
}

export interface ControllerSessionRuntimeOptions {
  elements: { joinState: HTMLElement } & Record<string, HTMLElement>;
  fetchImpl?: typeof fetch;
  getControllerState: () => ControllerSessionState | null | undefined;
  heartbeatRuntime: { start: () => void };
  renderState: (lobby: unknown) => void;
  setControllerState: (state: ControllerSessionState) => void;
  setLocalValue: (key: string, value: string) => void;
  setSessionValue: (key: string, value: string) => void;
}

export interface ControllerSessionRuntime {
  activateLobby(lobby: unknown): void;
  enterLobby(
    stageCode: string,
    playerId: string,
    playerCapability: string,
    lobby: unknown,
    player: ControllerSessionPlayer,
    options?: { deferActivation?: boolean }
  ): void;
  sendLeaveBeacon(origin: string): void;
}

export function createControllerSessionRuntime(options: ControllerSessionRuntimeOptions): ControllerSessionRuntime;
