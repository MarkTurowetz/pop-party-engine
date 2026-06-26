import type { ToolAppContext, ToolSurface } from "./createToolAppContext";
import type { GameDataApi } from "../../api/gameDataApi";

export interface PartyGameToolContextAdapter {
  surface: ToolSurface;
  api: GameDataApi;
}

declare global {
  interface Window {
    PartyGameToolContext?: PartyGameToolContextAdapter;
  }
}

export function installToolContextAdapter(context: ToolAppContext, target: Window = window): PartyGameToolContextAdapter {
  const adapter = {
    surface: context.surface,
    api: context.api
  };
  target.PartyGameToolContext = adapter;
  target.document?.documentElement?.setAttribute("data-tool-context-adapter", context.surface);
  return adapter;
}
