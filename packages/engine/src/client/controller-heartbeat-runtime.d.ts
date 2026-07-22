export interface ControllerHeartbeatOptions {
  applyLayoutForPhase: (phase: string) => void;
  clearIntervalImpl?: (timer: unknown) => void;
  closeAvatarPicker: (options: { commit: boolean }) => void;
  elements: { meta: HTMLElement } & Record<string, HTMLElement>;
  getJoinButton: () => HTMLButtonElement;
  getControllerState: () => unknown;
  hideViews: () => void;
  intervalMs?: number;
  renderState: (lobby: unknown) => void;
  sendHeartbeat: () => Promise<{ lobby: unknown }>;
  setControllerState: (state: unknown) => void;
  setIntervalImpl?: (callback: () => void, intervalMs: number) => unknown;
  setText?: (target: HTMLElement, value: unknown) => void;
  showView: (viewId: string) => void;
}

export interface ControllerHeartbeatRuntime {
  poll(): Promise<void>;
  start(): void;
  stop(): void;
}

export function createControllerHeartbeatRuntime(options: ControllerHeartbeatOptions): ControllerHeartbeatRuntime;
