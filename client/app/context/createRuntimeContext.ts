import { createGameDataApi, type GameDataApi } from "../../api/gameDataApi";

export type RuntimeSurface = "stage" | "controller";

export interface RuntimeContextOptions {
  surface: RuntimeSurface;
  baseUrl?: string;
}

export interface RuntimeContext {
  surface: RuntimeSurface;
  api: GameDataApi;
}

export function createRuntimeContext(options: RuntimeContextOptions): RuntimeContext {
  return {
    surface: options.surface,
    api: createGameDataApi({ baseUrl: options.baseUrl })
  };
}
