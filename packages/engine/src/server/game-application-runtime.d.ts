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
export function createGameApplicationRuntime(
  options: Omit<GameServiceRuntimeOptions, "createRequestHandler"> & Readonly<{
    workspaceRoot?: string;
    contentRoot?: string;
    authoringRoot?: string;
    authoringRepository?: string;
    sessionContentMode?: "published-release" | "latest-saved-authoring";
    webRoot?: string;
  }> & Record<string, unknown>
): GameServiceRuntime;
