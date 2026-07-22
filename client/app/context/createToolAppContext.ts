import { createGameDataApi, type GameDataApi } from "../../api/gameDataApi";

export type ToolSurface = "tools" | "flow" | "layout" | "art" | "constants" | "host-audio";

export interface ToolAppContextOptions {
  surface: ToolSurface;
  baseUrl?: string;
}

export interface ToolAppContext {
  surface: ToolSurface;
  api: GameDataApi;
}

export function createToolAppContext(options: ToolAppContextOptions): ToolAppContext {
  return {
    surface: options.surface,
    api: createGameDataApi({ baseUrl: options.baseUrl, adminCsrf: true })
  };
}
