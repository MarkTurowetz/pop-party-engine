export interface FlowSelectionSnapshot {
  selectedFlowActionId?: string;
  selectedFlowActionIds?: Iterable<string>;
  selectedFlowRouteNodeId?: string;
  selectedFlowRouteBranchId?: string;
  selectedFlowStateId?: string;
}

export interface FlowActionSelectionResult {
  selectedFlowActionIds: Set<string>;
  selectedFlowActionId: string;
  selectedFlowRouteNodeId: string;
  selectedFlowRouteBranchId: string;
}

export interface FlowMomentSelectionResult {
  selectedFlowActionIds: Set<string>;
  selectedFlowActionId: string;
  selectedFlowStateId: string;
  selectedFlowRouteNodeId: string;
  selectedFlowRouteBranchId: string;
}

export interface FlowRouteNodeSelectionResult {
  selectedFlowRouteNodeId: string;
  selectedFlowRouteBranchId: string;
  selectedFlowActionIds: Set<string>;
  selectedFlowActionId: string;
}

export interface SelectFlowActionOptions {
  additive?: boolean;
}

export interface SelectFlowMomentOptions {
  additive?: boolean;
}

function asArray(ids: Iterable<string> | string | null | undefined): string[] {
  if (!ids) return [];
  if (typeof ids === "string") return [ids];
  return [...ids];
}

function validIdSet(validIds: Iterable<string> | null | undefined): Set<string> {
  return new Set(asArray(validIds).filter(Boolean));
}

export function normalizeFlowActionSelection(
  ids: Iterable<string> | string | null | undefined,
  validIds: Iterable<string> | null | undefined
): { selectedFlowActionIds: Set<string>; selectedFlowActionId: string } {
  const valid = validIdSet(validIds);
  const nextIds = asArray(ids).filter((id) => valid.has(id));
  return {
    selectedFlowActionIds: new Set(nextIds),
    selectedFlowActionId: nextIds[nextIds.length - 1] || ""
  };
}

export function setFlowActionSelectionState(
  ids: Iterable<string> | string | null | undefined,
  validIds: Iterable<string> | null | undefined
): FlowActionSelectionResult {
  const selection = normalizeFlowActionSelection(ids, validIds);
  return {
    ...selection,
    selectedFlowRouteNodeId: "",
    selectedFlowRouteBranchId: ""
  };
}

export function clearFlowActionSelectionState(): Pick<FlowActionSelectionResult, "selectedFlowActionIds" | "selectedFlowActionId"> {
  return {
    selectedFlowActionIds: new Set(),
    selectedFlowActionId: ""
  };
}

export function selectFlowActionState(
  snapshot: FlowSelectionSnapshot,
  actionId: string,
  options: SelectFlowActionOptions = {},
  validIds: Iterable<string> | null | undefined
): FlowActionSelectionResult {
  if (!options.additive) return setFlowActionSelectionState([actionId], validIds);
  const nextIds = new Set(asArray(snapshot.selectedFlowActionIds));
  if (nextIds.has(actionId)) {
    nextIds.delete(actionId);
  } else {
    nextIds.add(actionId);
  }
  return setFlowActionSelectionState(nextIds, validIds);
}

export function flowActionIsSelected(snapshot: FlowSelectionSnapshot, actionId: string): boolean {
  return asArray(snapshot.selectedFlowActionIds).includes(actionId) || snapshot.selectedFlowActionId === actionId;
}

export function setFlowMomentSelectionState(
  ids: Iterable<string> | string | null | undefined,
  validStateIds: Iterable<string> | null | undefined
): FlowMomentSelectionResult {
  const valid = validIdSet(validStateIds);
  const nextIds = asArray(ids).filter((id) => valid.has(id));
  return {
    selectedFlowActionIds: new Set(nextIds),
    selectedFlowActionId: "",
    selectedFlowStateId: nextIds[nextIds.length - 1] || "",
    selectedFlowRouteNodeId: "",
    selectedFlowRouteBranchId: ""
  };
}

export function selectFlowMomentState(
  snapshot: FlowSelectionSnapshot,
  stateId: string,
  options: SelectFlowMomentOptions = {},
  validStateIds: Iterable<string> | null | undefined
): FlowMomentSelectionResult {
  if (!options.additive) return setFlowMomentSelectionState([stateId], validStateIds);
  const nextIds = new Set(asArray(snapshot.selectedFlowActionIds));
  if (nextIds.has(stateId)) {
    nextIds.delete(stateId);
  } else {
    nextIds.add(stateId);
  }
  return setFlowMomentSelectionState(nextIds, validStateIds);
}

export function setFlowRouteNodeSelectionState(routeNodeId: string): FlowRouteNodeSelectionResult {
  return {
    selectedFlowRouteNodeId: routeNodeId || "",
    selectedFlowRouteBranchId: "",
    selectedFlowActionIds: new Set(),
    selectedFlowActionId: ""
  };
}

export function setFlowRouteBranchSelectionState(routeNodeId: string, branchId: string): FlowRouteNodeSelectionResult {
  return {
    selectedFlowRouteNodeId: routeNodeId || "",
    selectedFlowRouteBranchId: routeNodeId && branchId ? branchId : "",
    selectedFlowActionIds: new Set(),
    selectedFlowActionId: ""
  };
}

export function clearFlowRouteNodeSelectionState(): Pick<FlowRouteNodeSelectionResult, "selectedFlowRouteNodeId" | "selectedFlowRouteBranchId"> {
  return {
    selectedFlowRouteNodeId: "",
    selectedFlowRouteBranchId: ""
  };
}
