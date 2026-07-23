import type { GameServiceActiveContext, GameServiceRuntime, GameServiceRuntimeOptions } from "./game-service-runtime";

export interface GameApplicationMetadata {
  readonly game: Readonly<{
    id: string;
    displayName: string;
    version: string;
    pluginNamespace: string;
  }>;
  readonly release: Readonly<Record<string, unknown>>;
}

export function publicRuntimeMetadata(
  gameDefinition: Record<string, unknown>,
  active: GameServiceActiveContext
): GameApplicationMetadata;
export function createGameApplicationRequestHandler(options: {
  gameDefinition: Record<string, unknown>;
  active: GameServiceActiveContext;
}): (request: unknown, response: unknown) => unknown;
export function createGameApplicationRuntime(
  options: Omit<GameServiceRuntimeOptions, "createRequestHandler"> & Record<string, unknown>
): GameServiceRuntime;
