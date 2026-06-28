import {
  clearFlowActionSelectionState,
  clearFlowRouteNodeSelectionState,
  flowActionIsSelected,
  normalizeFlowActionSelection,
  selectFlowActionState,
  selectFlowMomentState,
  setFlowActionSelectionState,
  setFlowMomentSelectionState,
  setFlowRouteBranchSelectionState,
  setFlowRouteNodeSelectionState,
  type FlowActionSelectionResult,
  type FlowMomentSelectionResult,
  type FlowRouteNodeSelectionResult,
  type FlowSelectionSnapshot,
  type SelectFlowActionOptions,
  type SelectFlowMomentOptions
} from "./flowSelection";

export interface PartyGameFlowSelection {
  clearFlowActionSelectionState: () => Pick<FlowActionSelectionResult, "selectedFlowActionIds" | "selectedFlowActionId">;
  clearFlowRouteNodeSelectionState: () => Pick<FlowRouteNodeSelectionResult, "selectedFlowRouteNodeId" | "selectedFlowRouteBranchId">;
  flowActionIsSelected: (snapshot: FlowSelectionSnapshot, actionId: string) => boolean;
  normalizeFlowActionSelection: (ids: Iterable<string> | string | null | undefined, validIds: Iterable<string> | null | undefined) => { selectedFlowActionIds: Set<string>; selectedFlowActionId: string };
  selectFlowActionState: (snapshot: FlowSelectionSnapshot, actionId: string, options: SelectFlowActionOptions | undefined, validIds: Iterable<string> | null | undefined) => FlowActionSelectionResult;
  selectFlowMomentState: (snapshot: FlowSelectionSnapshot, stateId: string, options: SelectFlowMomentOptions | undefined, validStateIds: Iterable<string> | null | undefined) => FlowMomentSelectionResult;
  setFlowActionSelectionState: (ids: Iterable<string> | string | null | undefined, validIds: Iterable<string> | null | undefined) => FlowActionSelectionResult;
  setFlowMomentSelectionState: (ids: Iterable<string> | string | null | undefined, validStateIds: Iterable<string> | null | undefined) => FlowMomentSelectionResult;
  setFlowRouteBranchSelectionState: (routeNodeId: string, branchId: string) => FlowRouteNodeSelectionResult;
  setFlowRouteNodeSelectionState: (routeNodeId: string) => FlowRouteNodeSelectionResult;
}

declare global {
  interface Window {
    PartyGameFlowSelection?: PartyGameFlowSelection;
  }
}

export function installFlowSelectionAdapter(target: Window = window): PartyGameFlowSelection {
  const adapter = {
    clearFlowActionSelectionState,
    clearFlowRouteNodeSelectionState,
    flowActionIsSelected,
    normalizeFlowActionSelection,
    selectFlowActionState,
    selectFlowMomentState,
    setFlowActionSelectionState,
    setFlowMomentSelectionState,
    setFlowRouteBranchSelectionState,
    setFlowRouteNodeSelectionState
  };
  target.PartyGameFlowSelection = adapter;
  target.document?.documentElement?.setAttribute("data-flow-selection-adapter", "module");
  return adapter;
}
