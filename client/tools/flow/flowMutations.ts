import type {
  FlowAction,
  FlowRouteNode,
  FlowState,
  GameFlow,
  StageLayoutCollection
} from "../../types/game-data";
import {
  DEFAULT_FLOW_SUB_ACTION_TYPE,
  createDefaultFlowAction,
  createDefaultFlowSubroutineAction,
  flowActionNameForType,
  type FlowActionTypeNamer
} from "./flowActions";
import { flowSubroutineActions, type FlowSubroutine } from "./flowSubroutines";

export interface AddFlowStateResult {
  state: FlowState;
  index: number;
}

export interface AddFlowActionResult {
  action: FlowAction;
  index: number;
}

export interface AddFlowSubActionResult {
  action: FlowAction;
  parentAction: FlowAction;
  index: number;
}

export interface AddFlowSubroutineResult {
  action: FlowAction;
  index: number;
}

export interface AddFlowSubActionOptions {
  nameForType?: FlowActionTypeNamer;
}

export interface RemoveSelectedFlowActionsResult {
  actions: FlowAction[];
  removedIds: string[];
}

export interface MoveFlowItemResult<TItem> {
  moved: boolean;
  item: TItem | null;
  fromIndex: number;
  toIndex: number;
}

export interface RenameFlowStateOptions {
  makeFlowId?: (label: unknown, fallback: string) => string;
  protectedStateIds?: Iterable<string>;
}

export interface RenameFlowStateResult {
  oldId: string;
  newId: string;
  name: string;
}

export interface RefreshFlowActionNameOptions {
  nameForAction?: (state: Partial<FlowState>, action: Partial<FlowAction>) => string;
}

export interface FlowActionBranchOptions {
  ensureDecisionBranches?: (action: FlowAction) => FlowAction[];
}

export interface FlowStateIdsForDeleteOptions {
  flowNodeDepth?: string;
  selectedFlowActionId?: string;
  selectedFlowActionIds?: Iterable<string>;
  selectedFlowStateId?: string;
  protectedStateIds?: Iterable<string>;
}

export interface RemoveFlowStatesResult {
  removedIds: string[];
  firstDeletedIndex: number;
  nextStateId: string;
}

export interface RemoveFlowRouteBranchOptions {
  ensureDecisionBranches?: (
    node: FlowRouteNode,
    options?: { targetField?: string }
  ) => FlowAction[];
  targetField?: string;
}

export interface RemoveFlowRouteBranchResult {
  removed: boolean;
  blocked: boolean;
  branchMissing: boolean;
  branchId: string;
}

export interface RemoveFlowRouteNodeResult {
  removed: boolean;
  nodeId: string;
}

type FlowRouteNodeWithBranches = FlowRouteNode & {
  branches?: FlowAction[];
};

function moveItemById<TItem extends { id?: string }>(
  items: TItem[] = [],
  draggedId: string,
  targetId: string,
  placeAfter = false
): MoveFlowItemResult<TItem> {
  if (!draggedId || !targetId || draggedId === targetId) {
    return { moved: false, item: null, fromIndex: -1, toIndex: -1 };
  }
  const fromIndex = items.findIndex((item) => item.id === draggedId);
  const originalTargetIndex = items.findIndex((item) => item.id === targetId);
  if (fromIndex < 0 || originalTargetIndex < 0) {
    return { moved: false, item: null, fromIndex, toIndex: originalTargetIndex };
  }

  const [item] = items.splice(fromIndex, 1);
  const targetIndexAfterRemoval = items.findIndex((entry) => entry.id === targetId);
  const toIndex = targetIndexAfterRemoval + (placeAfter ? 1 : 0);
  items.splice(toIndex, 0, item);
  return { moved: true, item, fromIndex, toIndex };
}

export function createDefaultFlowState(nextNumber: number): FlowState {
  return {
    id: `state-${nextNumber}`,
    name: `New Game State ${nextNumber}`,
    actions: []
  };
}

export function addFlowState(
  flow: Partial<GameFlow>,
  state: FlowState = createDefaultFlowState((flow.states || []).length + 1)
): AddFlowStateResult {
  if (!Array.isArray(flow.states)) flow.states = [];
  const index = flow.states.length;
  flow.states.push(state);
  return { state, index };
}

export function addDefaultFlowAction(
  state: FlowState,
  selectedPrimaryActionId = ""
): AddFlowActionResult {
  return addDefaultFlowActionToSubroutine(state, selectedPrimaryActionId, state.id);
}

export function addDefaultFlowActionToSubroutine(
  subroutine: FlowSubroutine,
  selectedPrimaryActionId = "",
  stateId = ""
): AddFlowActionResult {
  if (!Array.isArray(subroutine.actions)) subroutine.actions = [];
  const nextNumber = subroutine.actions.length + 1;
  const prefixId = stateId || String(subroutine.id || "subroutine");
  const action = createDefaultFlowAction(prefixId, `Game Action ${nextNumber}`, false);
  const selectedIndex = selectedPrimaryActionId
    ? subroutine.actions.findIndex((item) => item.id === selectedPrimaryActionId)
    : -1;
  const index = selectedIndex >= 0 ? selectedIndex + 1 : subroutine.actions.length;
  subroutine.actions.splice(index, 0, action);
  return { action, index };
}

export function addDefaultFlowSubroutine(
  subroutine: FlowSubroutine,
  selectedPrimaryActionId = "",
  stateId = ""
): AddFlowSubroutineResult {
  if (!Array.isArray(subroutine.actions)) subroutine.actions = [];
  const nextNumber = subroutine.actions.length + 1;
  const action = createDefaultFlowSubroutineAction(
    stateId || String(subroutine.id || "subroutine"),
    `Subroutine ${nextNumber}`
  );
  const selectedIndex = selectedPrimaryActionId
    ? subroutine.actions.findIndex((item) => item.id === selectedPrimaryActionId)
    : -1;
  const index = selectedIndex >= 0 ? selectedIndex + 1 : subroutine.actions.length;
  subroutine.actions.splice(index, 0, action);
  return { action, index };
}

export function addDefaultFlowSubAction(
  parentAction: FlowAction,
  selectedSubActionId = "",
  stateId = "",
  options: AddFlowSubActionOptions = {}
): AddFlowSubActionResult {
  if (!Array.isArray(parentAction.subActions)) parentAction.subActions = [];
  const action = createDefaultFlowAction(
    stateId,
    flowActionNameForType(DEFAULT_FLOW_SUB_ACTION_TYPE, options.nameForType),
    true
  );
  const selectedIndex = selectedSubActionId
    ? parentAction.subActions.findIndex((item) => item.id === selectedSubActionId)
    : -1;
  const index = selectedIndex >= 0 ? selectedIndex + 1 : parentAction.subActions.length;
  parentAction.subActions.splice(index, 0, action);
  return { action, parentAction, index };
}

export function flattenedFlowActionIds(
  actions: FlowAction[] = [],
  options: FlowActionBranchOptions = {},
  output: string[] = []
): string[] {
  for (const action of actions || []) {
    output.push(action.id);
    flattenedFlowActionIds(flowSubroutineActions(action), options, output);
    for (const subAction of action.subActions || []) output.push(subAction.id);
    if (action.type === "decision") {
      const branches = options.ensureDecisionBranches?.(action) || action.branches || [];
      for (const branch of branches) output.push(branch.id);
    }
  }
  return output;
}

export function removeSelectedFlowActionsFromList(
  actions: FlowAction[] = [],
  selectedIds: Set<string>
): RemoveSelectedFlowActionsResult {
  const removedIds: string[] = [];
  const filteredActions = (actions || []).filter((action) => {
    if (selectedIds.has(action.id)) {
      removedIds.push(action.id);
      return false;
    }
    if (Array.isArray(action.subActions)) {
      action.subActions = action.subActions.filter((subAction) => {
        if (!selectedIds.has(subAction.id)) return true;
        removedIds.push(subAction.id);
        return false;
      });
    }
    if (Array.isArray(action.actions)) {
      const nested = removeSelectedFlowActionsFromList(action.actions, selectedIds);
      action.actions = nested.actions;
      removedIds.push(...nested.removedIds);
    }
    if (action.type === "decision" && Array.isArray(action.branches)) {
      action.branches = action.branches.filter((branch) => {
        if (!selectedIds.has(branch.id)) return true;
        removedIds.push(branch.id);
        return false;
      });
    }
    return true;
  });
  return { actions: filteredActions, removedIds };
}

export function moveFlowState(
  flow: Partial<GameFlow>,
  draggedStateId: string,
  targetStateId: string,
  placeAfter = false
): MoveFlowItemResult<FlowState> {
  if (!Array.isArray(flow.states)) flow.states = [];
  return moveItemById(flow.states, draggedStateId, targetStateId, placeAfter);
}

export function moveFlowActionInState(
  state: Partial<FlowSubroutine> | null | undefined,
  draggedActionId: string,
  targetActionId: string,
  placeAfter = false
): MoveFlowItemResult<FlowAction> {
  if (!state || !Array.isArray(state.actions))
    return { moved: false, item: null, fromIndex: -1, toIndex: -1 };
  return moveItemById(state.actions, draggedActionId, targetActionId, placeAfter);
}

export function moveFlowSubAction(
  parentAction: Partial<FlowAction> | null | undefined,
  draggedActionId: string,
  targetActionId: string,
  placeAfter = false
): MoveFlowItemResult<FlowAction> {
  if (!parentAction || !Array.isArray(parentAction.subActions))
    return { moved: false, item: null, fromIndex: -1, toIndex: -1 };
  return moveItemById(parentAction.subActions, draggedActionId, targetActionId, placeAfter);
}

export function renameFlowState(
  state: Partial<FlowState>,
  nextName: string,
  options: RenameFlowStateOptions = {}
): RenameFlowStateResult {
  const oldId = String(state.id || "");
  const name = nextName || String(state.name || "");
  state.name = name;
  const protectedIds = new Set(options.protectedStateIds || ["lobby", "intro"]);
  if (!protectedIds.has(oldId)) {
    state.id = options.makeFlowId?.(name, oldId) || oldId;
  }
  return {
    oldId,
    newId: String(state.id || ""),
    name: String(state.name || "")
  };
}

export function setFlowStateNextTarget(state: Partial<FlowState>, targetId: string): void {
  state.nextStateTargetId = targetId;
}

export function setFlowStateEntryTarget(state: Partial<FlowSubroutine>, targetId: string): void {
  state.entryTargetActionId = targetId;
}

export function setFlowStateVotingSource(state: Partial<FlowState>, sourceStateId: string): void {
  state.votingSourceStateId = sourceStateId || undefined;
}

export function refreshFlowActionName(
  state: Partial<FlowState>,
  action: Partial<FlowAction>,
  options: RefreshFlowActionNameOptions = {}
): string {
  const nextName = options.nameForAction?.(state, action) || String(action.name || "");
  action.name = nextName;
  return nextName;
}

export function flowStateIdsForDelete(
  flow: Partial<GameFlow> | null | undefined,
  options: FlowStateIdsForDeleteOptions = {}
): string[] {
  const ids = new Set<string>();
  if (options.flowNodeDepth === "subroutines" && !options.selectedFlowActionId) {
    for (const id of options.selectedFlowActionIds || []) ids.add(id);
  }
  if (options.selectedFlowStateId) ids.add(options.selectedFlowStateId);

  const protectedIds = new Set(options.protectedStateIds || ["lobby", "intro"]);
  const existingIds = new Set((flow?.states || []).map((state) => state.id));
  return [...ids].filter((id) => id && !protectedIds.has(id) && existingIds.has(id));
}

export function removeFlowStates(
  flow: Partial<GameFlow>,
  stateIds: Iterable<string>
): RemoveFlowStatesResult {
  if (!Array.isArray(flow.states)) flow.states = [];
  const stateIdSet = new Set(stateIds);
  const firstDeletedIndex = flow.states.findIndex((state) => stateIdSet.has(state.id));
  const removedIds = flow.states
    .filter((state) => stateIdSet.has(state.id))
    .map((state) => state.id);
  if (!removedIds.length) {
    return { removedIds: [], firstDeletedIndex: -1, nextStateId: "" };
  }

  flow.states = flow.states.filter((state) => !stateIdSet.has(state.id));
  const nextStateId =
    flow.states[Math.min(firstDeletedIndex, flow.states.length - 1)]?.id ||
    flow.states[firstDeletedIndex - 1]?.id ||
    flow.states[0]?.id ||
    "";
  return { removedIds, firstDeletedIndex, nextStateId };
}

export function removeLayoutState(
  layouts: Partial<StageLayoutCollection> | null | undefined,
  stateId: string
): boolean {
  if (!layouts?.states?.length) return false;
  const beforeCount = layouts.states.length;
  layouts.states = layouts.states.filter((state) => state.id !== stateId);
  return layouts.states.length !== beforeCount;
}

export function removeFlowRouteBranch(
  node: FlowRouteNode | null | undefined,
  branchId: string,
  options: RemoveFlowRouteBranchOptions = {}
): RemoveFlowRouteBranchResult {
  if (!node || !branchId) return { removed: false, blocked: false, branchMissing: true, branchId };
  const routeNode = node as FlowRouteNodeWithBranches;
  const branches =
    options.ensureDecisionBranches?.(routeNode, { targetField: options.targetField }) ||
    routeNode.branches ||
    [];
  const branch = branches.find((item) => item.id === branchId);
  if (!branch) return { removed: false, blocked: false, branchMissing: true, branchId };
  if (branch.type === "noMatch")
    return { removed: false, blocked: true, branchMissing: false, branchId };

  routeNode.branches = branches.filter((item) => item.id !== branchId);
  options.ensureDecisionBranches?.(routeNode, { targetField: options.targetField });
  return { removed: true, blocked: false, branchMissing: false, branchId };
}

export function removeFlowRouteNode(
  flow: Partial<GameFlow>,
  nodeId: string,
  nodes: FlowRouteNode[] = flow.routeNodes || []
): RemoveFlowRouteNodeResult {
  const node = nodes.find((item) => item.id === nodeId) || null;
  if (!node) return { removed: false, nodeId };
  flow.routeNodes = nodes.filter((item) => item.id !== nodeId);
  return { removed: true, nodeId };
}
