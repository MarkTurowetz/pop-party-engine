import type { GameFlow } from "../../types/game-data";
import { findFlowActionRef, type FindFlowActionRefOptions, type FlowActionRef } from "./flowSelectors";

export interface FlowPreviewSelection {
  selectedActionId?: string;
  selectedStateId?: string;
}

export interface FlowPreviewModel {
  actionRef: FlowActionRef | null;
  routeNodeCount: number;
  selectedActionId: string;
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
  const actionRef = flow && selectedState && selectedActionId
    ? findFlowActionRef(flow, selectedState.id, selectedActionId, options)
    : null;

  return {
    actionRef,
    routeNodeCount: flow?.routeNodes?.length || 0,
    selectedActionId,
    selectedState,
    selectedStateId,
    stateCount: states.length
  };
}
