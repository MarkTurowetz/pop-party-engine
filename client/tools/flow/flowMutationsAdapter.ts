import {
  addDefaultFlowAction,
  addDefaultFlowSubAction,
  addFlowState,
  createDefaultFlowState,
  flattenedFlowActionIds,
  flowStateIdsForDelete,
  moveFlowActionInState,
  moveFlowState,
  moveFlowSubAction,
  refreshFlowActionName,
  renameFlowState,
  removeFlowRouteBranch,
  removeFlowRouteNode,
  removeFlowStates,
  removeLayoutState,
  removeSelectedFlowActionsFromList,
  setFlowStateEntryTarget,
  setFlowStateNextTarget,
  setFlowStateVotingSource,
  type AddFlowActionResult,
  type AddFlowStateResult,
  type AddFlowSubActionResult,
  type FlowActionBranchOptions,
  type FlowStateIdsForDeleteOptions,
  type MoveFlowItemResult,
  type RefreshFlowActionNameOptions,
  type RenameFlowStateOptions,
  type RenameFlowStateResult,
  type RemoveFlowRouteBranchOptions,
  type RemoveFlowRouteBranchResult,
  type RemoveFlowRouteNodeResult,
  type RemoveFlowStatesResult,
  type RemoveSelectedFlowActionsResult
} from "./flowMutations";
import type { FlowAction, FlowRouteNode, FlowState, GameFlow, StageLayoutCollection } from "../../types/game-data";

export interface PartyGameFlowMutations {
  addDefaultFlowAction: (state: FlowState, selectedPrimaryActionId?: string) => AddFlowActionResult;
  addDefaultFlowSubAction: (parentAction: FlowAction, selectedSubActionId?: string, stateId?: string) => AddFlowSubActionResult;
  addFlowState: (flow: Partial<GameFlow>, state?: FlowState) => AddFlowStateResult;
  createDefaultFlowState: (nextNumber: number) => FlowState;
  flattenedFlowActionIds: (actions?: FlowAction[], options?: FlowActionBranchOptions, output?: string[]) => string[];
  flowStateIdsForDelete: (flow: Partial<GameFlow> | null | undefined, options?: FlowStateIdsForDeleteOptions) => string[];
  moveFlowActionInState: (state: Partial<FlowState> | null | undefined, draggedActionId: string, targetActionId: string, placeAfter?: boolean) => MoveFlowItemResult<FlowAction>;
  moveFlowState: (flow: Partial<GameFlow>, draggedStateId: string, targetStateId: string, placeAfter?: boolean) => MoveFlowItemResult<FlowState>;
  moveFlowSubAction: (parentAction: Partial<FlowAction> | null | undefined, draggedActionId: string, targetActionId: string, placeAfter?: boolean) => MoveFlowItemResult<FlowAction>;
  refreshFlowActionName: (state: Partial<FlowState>, action: Partial<FlowAction>, options?: RefreshFlowActionNameOptions) => string;
  renameFlowState: (state: Partial<FlowState>, nextName: string, options?: RenameFlowStateOptions) => RenameFlowStateResult;
  removeFlowRouteBranch: (node: FlowRouteNode | null | undefined, branchId: string, options?: RemoveFlowRouteBranchOptions) => RemoveFlowRouteBranchResult;
  removeFlowRouteNode: (flow: Partial<GameFlow>, nodeId: string, nodes?: FlowRouteNode[]) => RemoveFlowRouteNodeResult;
  removeFlowStates: (flow: Partial<GameFlow>, stateIds: Iterable<string>) => RemoveFlowStatesResult;
  removeLayoutState: (layouts: Partial<StageLayoutCollection> | null | undefined, stateId: string) => boolean;
  removeSelectedFlowActionsFromList: (actions: FlowAction[], selectedIds: Set<string>) => RemoveSelectedFlowActionsResult;
  setFlowStateEntryTarget: (state: Partial<FlowState>, targetId: string) => void;
  setFlowStateNextTarget: (state: Partial<FlowState>, targetId: string) => void;
  setFlowStateVotingSource: (state: Partial<FlowState>, sourceStateId: string) => void;
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
    flowStateIdsForDelete,
    moveFlowActionInState,
    moveFlowState,
    moveFlowSubAction,
    refreshFlowActionName,
    renameFlowState,
    removeFlowRouteBranch,
    removeFlowRouteNode,
    removeFlowStates,
    removeLayoutState,
    removeSelectedFlowActionsFromList,
    setFlowStateEntryTarget,
    setFlowStateNextTarget,
    setFlowStateVotingSource
  };
  target.PartyGameFlowMutations = adapter;
  target.document?.documentElement?.setAttribute("data-flow-mutations-adapter", "module");
  return adapter;
}
