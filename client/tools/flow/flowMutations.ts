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
