export interface WebServiceStartup {
  readonly host: string;
  readonly port: number;
  readonly localUrl: string;
  readonly lanUrls: readonly string[];
}

export interface WebServiceRuntime {
  readonly server: Readonly<Record<string, unknown>>;
  readonly lifecycle: "created" | "starting" | "running" | "failed" | "stopped";
  readonly startup: WebServiceStartup | null;
  start(): Promise<WebServiceStartup>;
  stop(): Promise<void>;
}

export interface WebServiceRuntimeOptions {
  requestHandler?: (...args: unknown[]) => unknown;
  router?: (...args: unknown[]) => unknown;
  host?: string;
  port?: number;
  initialize?: () => unknown | Promise<unknown>;
  sweep?: () => unknown;
  sweepIntervalMs?: number;
  onStarted?: (startup: WebServiceStartup) => unknown | Promise<unknown>;
  onError?: (error: unknown) => void;
}

export function createWebServiceRuntime(options: WebServiceRuntimeOptions): WebServiceRuntime;
export function resolveLanUrls(networkInterfaces: () => Record<string, readonly Record<string, unknown>[]>, port: number): readonly string[];
