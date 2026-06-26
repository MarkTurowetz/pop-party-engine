import type { FlowAction, FlowRouteNode, GameFlow } from "../../types/game-data";
import { findFlowActionRef, type FindFlowActionRefOptions, type FlowActionRef } from "./flowSelectors";

export interface FlowPreviewSelection {
  selectedActionId?: string;
  selectedRouteBranchId?: string;
  selectedRouteNodeId?: string;
  selectedStateId?: string;
}

export interface FlowPreviewModel {
  actionRef: FlowActionRef | null;
  routeNodeCount: number;
  selectedActionId: string;
  selectedRouteBranch: FlowAction | null;
  selectedRouteBranchId: string;
  selectedRouteNode: FlowRouteNode | null;
  selectedRouteNodeId: string;
  selectedStateId: string;
  selectedState: GameFlow["states"][number] | null;
  stateCount: number;
}

export function createFlowPreviewModel(
  flow: GameFlow | null | undefined,
  selection: FlowPreviewSelection = {},
  options: FindFlowActionRefOptions = {}
): FlowPreviewModel {
  const states = flow?.states || [];
  const selectedState = states.find((state) => state.id === selection.selectedStateId) || states[0] || null;
  const selectedStateId = selectedState?.id || selection.selectedStateId || "";
  const selectedActionId = selection.selectedActionId || "";
  const selectedRouteNodeId = selection.selectedRouteNodeId || "";
  const selectedRouteNode = (flow?.routeNodes || []).find((node) => node.id === selectedRouteNodeId) || null;
  const selectedRouteBranchId = selection.selectedRouteBranchId || "";
  const selectedRouteBranch = selectedRouteNode && selectedRouteBranchId
    ? ((Array.isArray(selectedRouteNode.branches) ? selectedRouteNode.branches : []) as FlowAction[])
      .find((branch) => branch.id === selectedRouteBranchId) || null
    : null;
  const actionRef = flow && selectedState && selectedActionId
    ? findFlowActionRef(flow, selectedState.id, selectedActionId, options)
    : null;

  return {
    actionRef,
    routeNodeCount: flow?.routeNodes?.length || 0,
    selectedActionId,
    selectedRouteBranch,
    selectedRouteBranchId,
    selectedRouteNode,
    selectedRouteNodeId,
    selectedState,
    selectedStateId,
    stateCount: states.length
  };
}
