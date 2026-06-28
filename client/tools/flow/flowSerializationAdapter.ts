import { flowHistorySnapshot, parseFlowHistorySnapshot, serializeGameFlowForSave, type FlowSerializationOptions } from "./flowSerialization";
import type { GameFlow } from "../../types/game-data";

export interface PartyGameFlowSerialization {
  flowHistorySnapshot: (flow: Partial<GameFlow> | null | undefined, options?: FlowSerializationOptions) => string;
  parseFlowHistorySnapshot: (snapshot: string) => GameFlow;
  serializeGameFlowForSave: (flow: Partial<GameFlow> | null | undefined, options?: FlowSerializationOptions) => GameFlow;
}

declare global {
  interface Window {
    PartyGameFlowSerialization?: PartyGameFlowSerialization;
  }
}

export function installFlowSerializationAdapter(target: Window = window): PartyGameFlowSerialization {
  const adapter = { flowHistorySnapshot, parseFlowHistorySnapshot, serializeGameFlowForSave };
  target.PartyGameFlowSerialization = adapter;
  target.document?.documentElement?.setAttribute("data-flow-serialization-adapter", "module");
  return adapter;
}
