import {
  clearFlowRouteTargetReferences,
  createMomentEntryNode,
  createRouteActionNode,
  type ClearFlowRouteTargetReferencesOptions,
  type CreateMomentEntryNodeOptions,
  type FlowNodePosition,
  type FlowRouteGraphOptions,
  type FlowRouteNodeModel
} from "./flowRouteGraph";
import type { GameFlow } from "../../types/game-data";

export interface PartyGameFlowRouteGraph {
  clearFlowRouteTargetReferences: (flow: Partial<GameFlow> | null | undefined, targetIds: string | string[], options?: ClearFlowRouteTargetReferencesOptions) => void;
  createMomentEntryNode: (flow: Partial<GameFlow> | null | undefined, selectedStateId?: string, options?: CreateMomentEntryNodeOptions) => FlowRouteNodeModel;
  createRouteActionNode: (flow: Partial<GameFlow> | null | undefined, point?: FlowNodePosition | null, options?: FlowRouteGraphOptions) => FlowRouteNodeModel;
}

declare global {
  interface Window {
    PartyGameFlowRouteGraph?: PartyGameFlowRouteGraph;
  }
}

export function installFlowRouteGraphAdapter(target: Window = window): PartyGameFlowRouteGraph {
  const adapter = {
    clearFlowRouteTargetReferences,
    createMomentEntryNode,
    createRouteActionNode
  };
  target.PartyGameFlowRouteGraph = adapter;
  target.document?.documentElement?.setAttribute("data-flow-route-graph-adapter", "module");
  return adapter;
}
