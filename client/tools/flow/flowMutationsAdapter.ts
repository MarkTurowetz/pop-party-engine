import {
  addDefaultFlowAction,
  addDefaultFlowSubAction,
  addFlowState,
  createDefaultFlowState,
  flattenedFlowActionIds,
  removeSelectedFlowActionsFromList,
  type AddFlowActionResult,
  type AddFlowStateResult,
  type AddFlowSubActionResult,
  type FlowActionBranchOptions,
  type RemoveSelectedFlowActionsResult
} from "./flowMutations";
import type { FlowAction, FlowState, GameFlow } from "../../types/game-data";

export interface PartyGameFlowMutations {
  addDefaultFlowAction: (state: FlowState, selectedPrimaryActionId?: string) => AddFlowActionResult;
  addDefaultFlowSubAction: (parentAction: FlowAction, selectedSubActionId?: string, stateId?: string) => AddFlowSubActionResult;
  addFlowState: (flow: Partial<GameFlow>, state?: FlowState) => AddFlowStateResult;
  createDefaultFlowState: (nextNumber: number) => FlowState;
  flattenedFlowActionIds: (actions?: FlowAction[], options?: FlowActionBranchOptions, output?: string[]) => string[];
  removeSelectedFlowActionsFromList: (actions: FlowAction[], selectedIds: Set<string>) => RemoveSelectedFlowActionsResult;
}

declare global {
  interface Window {
    PartyGameFlowMutations?: PartyGameFlowMutations;
  }
}

export function installFlowMutationsAdapter(target: Window = window): PartyGameFlowMutations {
  const adapter = {
    addDefaultFlowAction,
    addDefaultFlowSubAction,
    addFlowState,
    createDefaultFlowState,
    flattenedFlowActionIds,
    removeSelectedFlowActionsFromList
  };
  target.PartyGameFlowMutations = adapter;
  target.document?.documentElement?.setAttribute("data-flow-mutations-adapter", "module");
  return adapter;
}
