import type { FlowAction, FlowRouteNode, GameFlow } from "../../types/game-data";

export interface FlowSerializationOptions {
  serializeRouteNode?: (node: FlowRouteNode) => FlowRouteNode;
}

export function serializeFlowActionForSave(action: FlowAction): FlowAction {
  const serialized: FlowAction = {
    ...action,
    subActions: (action.subActions || []).map(serializeFlowActionForSave)
  };
  if (action.type === "subroutine" || Array.isArray(action.actions)) {
    serialized.actions = (action.actions || []).map(serializeFlowActionForSave);
  } else {
    delete serialized.actions;
  }
  return serialized;
}

export function serializeGameFlowForSave(flow: Partial<GameFlow> | null | undefined, options: FlowSerializationOptions = {}): GameFlow {
  const serializeRouteNode = options.serializeRouteNode || ((node: FlowRouteNode) => node);
  return {
    states: (flow?.states || []).map((state) => ({
      ...state,
      actions: (state.actions || []).map(serializeFlowActionForSave)
    })),
    routeNodes: (flow?.routeNodes || []).map(serializeRouteNode)
  };
}

export function flowHistorySnapshot(flow: Partial<GameFlow> | null | undefined, options: FlowSerializationOptions = {}): string {
  return JSON.stringify(serializeGameFlowForSave(flow, options));
}

export function parseFlowHistorySnapshot(snapshot: string): GameFlow {
  return JSON.parse(snapshot) as GameFlow;
}
