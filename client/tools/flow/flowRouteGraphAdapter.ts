import {
  appendFlowRouteTargets,
  clearFlowRouteTargetReferences,
  createMomentEntryNode,
  createRouteActionNode,
  flowRouteNodeTypeName,
  flowRouteTargetName,
  isFlowRouteDecisionNode,
  momentEntryTargetOptions,
  routeGraphTargetOptions,
  serializeFlowRouteNodeForSave,
  type ClearFlowRouteTargetReferencesOptions,
  type CreateMomentEntryNodeOptions,
  type FlowRouteDisplayOptions,
  type FlowRouteOption,
  type FlowNodePosition,
  type FlowRouteGraphOptions,
  type FlowRouteNodeModel,
  type SerializeFlowRouteNodeOptions
} from "./flowRouteGraph";
import type { FlowRouteNode, GameFlow } from "../../types/game-data";

export interface PartyGameFlowRouteGraph {
  appendFlowRouteTargets: (flow: Partial<GameFlow> | null | undefined, options: FlowRouteOption[], currentStateId?: string, display?: FlowRouteDisplayOptions) => FlowRouteOption[];
  clearFlowRouteTargetReferences: (flow: Partial<GameFlow> | null | undefined, targetIds: string | string[], options?: ClearFlowRouteTargetReferencesOptions) => void;
  createMomentEntryNode: (flow: Partial<GameFlow> | null | undefined, selectedStateId?: string, options?: CreateMomentEntryNodeOptions) => FlowRouteNodeModel;
  createRouteActionNode: (flow: Partial<GameFlow> | null | undefined, point?: FlowNodePosition | null, options?: FlowRouteGraphOptions) => FlowRouteNodeModel;
  flowRouteNodeTypeName: (node: Partial<FlowRouteNodeModel> | null | undefined, options?: FlowRouteDisplayOptions) => string;
  flowRouteTargetName: (flow: Partial<GameFlow> | null | undefined, targetId: string, options?: FlowRouteDisplayOptions) => string;
  isFlowRouteDecisionNode: (node: Partial<FlowRouteNodeModel> | null | undefined) => boolean;
  momentEntryTargetOptions: (flow: Partial<GameFlow> | null | undefined, selectedStateId?: string) => FlowRouteOption[];
  routeGraphTargetOptions: (flow: Partial<GameFlow> | null | undefined, selectedTargetId?: string, currentNodeId?: string, options?: FlowRouteDisplayOptions) => FlowRouteOption[];
  serializeFlowRouteNodeForSave: (node: Partial<FlowRouteNodeModel>, options?: SerializeFlowRouteNodeOptions) => FlowRouteNode;
}

declare global {
  interface Window {
    PartyGameFlowRouteGraph?: PartyGameFlowRouteGraph;
  }
}

export function installFlowRouteGraphAdapter(target: Window = window): PartyGameFlowRouteGraph {
  const adapter = {
    appendFlowRouteTargets,
    clearFlowRouteTargetReferences,
    createMomentEntryNode,
    createRouteActionNode,
    flowRouteNodeTypeName,
    flowRouteTargetName,
    isFlowRouteDecisionNode,
    momentEntryTargetOptions,
    routeGraphTargetOptions,
    serializeFlowRouteNodeForSave
  };
  target.PartyGameFlowRouteGraph = adapter;
  target.document?.documentElement?.setAttribute("data-flow-route-graph-adapter", "module");
  return adapter;
}
