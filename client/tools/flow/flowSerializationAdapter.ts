import { serializeGameFlowForSave, type FlowSerializationOptions } from "./flowSerialization";
import type { GameFlow } from "../../types/game-data";

export interface PartyGameFlowSerialization {
  serializeGameFlowForSave: (flow: Partial<GameFlow> | null | undefined, options?: FlowSerializationOptions) => GameFlow;
}

declare global {
  interface Window {
    PartyGameFlowSerialization?: PartyGameFlowSerialization;
  }
}

export function installFlowSerializationAdapter(target: Window = window): PartyGameFlowSerialization {
  const adapter = { serializeGameFlowForSave };
  target.PartyGameFlowSerialization = adapter;
  target.document?.documentElement?.setAttribute("data-flow-serialization-adapter", "module");
  return adapter;
}
