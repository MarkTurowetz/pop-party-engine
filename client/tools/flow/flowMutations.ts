import type { FlowAction, FlowState, GameFlow } from "../../types/game-data";
import { createDefaultFlowAction } from "./flowActions";

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

export interface RemoveSelectedFlowActionsResult {
  actions: FlowAction[];
  removedIds: string[];
}

export interface FlowActionBranchOptions {
  ensureDecisionBranches?: (action: FlowAction) => FlowAction[];
}

export function createDefaultFlowState(nextNumber: number): FlowState {
  return {
    id: `state-${nextNumber}`,
    name: `New Game State ${nextNumber}`,
    actions: []
  };
}

export function addFlowState(flow: Partial<GameFlow>, state: FlowState = createDefaultFlowState((flow.states || []).length + 1)): AddFlowStateResult {
  if (!Array.isArray(flow.states)) flow.states = [];
  const index = flow.states.length;
  flow.states.push(state);
  return { state, index };
}

export function addDefaultFlowAction(state: FlowState, selectedPrimaryActionId = ""): AddFlowActionResult {
  if (!Array.isArray(state.actions)) state.actions = [];
  const nextNumber = state.actions.length + 1;
  const action = createDefaultFlowAction(state.id, `Game Action ${nextNumber}`, false);
  const selectedIndex = selectedPrimaryActionId
    ? state.actions.findIndex((item) => item.id === selectedPrimaryActionId)
    : -1;
  const index = selectedIndex >= 0 ? selectedIndex + 1 : state.actions.length;
  state.actions.splice(index, 0, action);
  return { action, index };
}

export function addDefaultFlowSubAction(parentAction: FlowAction, selectedSubActionId = "", stateId = ""): AddFlowSubActionResult {
  if (!Array.isArray(parentAction.subActions)) parentAction.subActions = [];
  const nextNumber = parentAction.subActions.length + 1;
  const action = createDefaultFlowAction(stateId, `Sub-Action ${nextNumber}`, true);
  const selectedIndex = selectedSubActionId
    ? parentAction.subActions.findIndex((item) => item.id === selectedSubActionId)
    : -1;
  const index = selectedIndex >= 0 ? selectedIndex + 1 : parentAction.subActions.length;
  parentAction.subActions.splice(index, 0, action);
  return { action, parentAction, index };
}

export function flattenedFlowActionIds(actions: FlowAction[] = [], options: FlowActionBranchOptions = {}, output: string[] = []): string[] {
  for (const action of actions || []) {
    output.push(action.id);
    for (const subAction of action.subActions || []) output.push(subAction.id);
    if (action.type === "decision") {
      const branches = options.ensureDecisionBranches?.(action) || action.branches || [];
      for (const branch of branches) output.push(branch.id);
    }
  }
  return output;
}

export function removeSelectedFlowActionsFromList(actions: FlowAction[] = [], selectedIds: Set<string>): RemoveSelectedFlowActionsResult {
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
