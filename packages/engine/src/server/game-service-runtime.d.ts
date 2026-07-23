import type { GameReadinessRuntime } from "./game-readiness-runtime";
import type { WebServiceStartup } from "./web-service-runtime";

export class GameServiceError extends Error {
  readonly code: string;
  readonly details: Readonly<Record<string, unknown>>;
}

export type GameServiceActiveContext = Readonly<Record<string, unknown>> & {
  readonly release: Readonly<Record<string, unknown>>;
};

export interface GameServiceState {
  readonly status: "pending" | "starting" | "running" | "failed" | "stopped";
  readonly diagnostic: Readonly<Record<string, unknown>> | null;
  readonly release: Readonly<Record<string, unknown>> | null;
}

export interface GameServiceRuntime {
  readonly readiness: GameReadinessRuntime;
  readonly server: Readonly<Record<string, unknown>>;
  readonly lifecycle: "created" | "starting" | "running" | "failed" | "stopped";
  readonly startup: WebServiceStartup | null;
  readonly active: GameServiceActiveContext | null;
  readonly state: GameServiceState;
  start(): Promise<WebServiceStartup>;
  stop(): Promise<void>;
}

export interface GameServiceRuntimeOptions {
  gameDefinition: Record<string, unknown>;
  engineVersion: string;
  contentSchemaVersion?: string;
  createRequestHandler(active: GameServiceActiveContext):
    | ((request: unknown, response: unknown) => unknown)
    | Promise<(request: unknown, response: unknown) => unknown>;
  host?: string;
  port?: number;
  initialize?: (active: GameServiceActiveContext) => unknown | Promise<unknown>;
  sweep?: () => unknown;
  sweepIntervalMs?: number;
  onStarted?: (startup: WebServiceStartup, active: GameServiceActiveContext) => unknown | Promise<unknown>;
  onError?: (error: unknown) => void;
}

export function createGameServiceRuntime(options: GameServiceRuntimeOptions): GameServiceRuntime;
