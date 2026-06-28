import type { GameFlow } from "../../types/game-data";
import { createFlowCommandHistory, type FlowCommand, type FlowCommandHistory, type FlowCommandHistoryOptions } from "./flowCommands";
import {
  clearFlowActionSelectionState,
  clearFlowRouteNodeSelectionState,
  setFlowActionSelectionState,
  setFlowMomentSelectionState,
  setFlowRouteBranchSelectionState,
  setFlowRouteNodeSelectionState,
  type FlowSelectionSnapshot
} from "./flowSelection";

export interface FlowStoreSelection {
  selectedFlowActionIds: Set<string>;
  selectedFlowActionId: string;
  selectedFlowRouteNodeId: string;
  selectedFlowRouteBranchId: string;
  selectedFlowStateId: string;
}

export interface FlowStoreSnapshot {
  flow: GameFlow;
  selection: FlowStoreSelection;
  canUndo: boolean;
  canRedo: boolean;
  undoLabels: string[];
  redoLabels: string[];
  version: number;
}

export interface FlowStore {
  clearActionSelection: () => FlowStoreSnapshot;
  clearRouteSelection: () => FlowStoreSnapshot;
  execute: (command: FlowCommand) => FlowStoreSnapshot;
  replaceFlow: (flow: GameFlow) => FlowStoreSnapshot;
  selectActions: (ids: Iterable<string> | string | null | undefined, validIds: Iterable<string> | null | undefined) => FlowStoreSnapshot;
  selectMoments: (ids: Iterable<string> | string | null | undefined, validStateIds?: Iterable<string> | null | undefined) => FlowStoreSnapshot;
  selectRouteBranch: (routeNodeId: string, branchId: string) => FlowStoreSnapshot;
  selectRouteNode: (routeNodeId: string) => FlowStoreSnapshot;
  snapshot: () => FlowStoreSnapshot;
  subscribe: (listener: FlowStoreListener) => () => void;
  redo: () => FlowStoreSnapshot | null;
  undo: () => FlowStoreSnapshot | null;
}

export type FlowStoreListener = (snapshot: FlowStoreSnapshot) => void;

export interface FlowStoreOptions extends FlowCommandHistoryOptions {
  selection?: FlowSelectionSnapshot;
}

function cloneFlow(flow: GameFlow): GameFlow {
  return JSON.parse(JSON.stringify(flow)) as GameFlow;
}

function cloneSelection(selection: FlowStoreSelection): FlowStoreSelection {
  return {
    ...selection,
    selectedFlowActionIds: new Set(selection.selectedFlowActionIds)
  };
}

function normalizeSelection(selection: FlowSelectionSnapshot = {}): FlowStoreSelection {
  return {
    selectedFlowActionIds: new Set(selection.selectedFlowActionIds || []),
    selectedFlowActionId: selection.selectedFlowActionId || "",
    selectedFlowRouteNodeId: selection.selectedFlowRouteNodeId || "",
    selectedFlowRouteBranchId: selection.selectedFlowRouteBranchId || "",
    selectedFlowStateId: selection.selectedFlowStateId || ""
  };
}

function flowStateIds(flow: GameFlow): string[] {
  return (flow.states || []).map((state) => state.id).filter(Boolean);
}

function snapshotFrom(history: FlowCommandHistory, selection: FlowStoreSelection, version: number): FlowStoreSnapshot {
  return {
    flow: history.flow(),
    selection: cloneSelection(selection),
    canUndo: history.canUndo(),
    canRedo: history.canRedo(),
    undoLabels: history.undoLabels(),
    redoLabels: history.redoLabels(),
    version
  };
}

export function createFlowStore(initialFlow: GameFlow, options: FlowStoreOptions = {}): FlowStore {
  const history = createFlowCommandHistory(initialFlow, options);
  const listeners = new Set<FlowStoreListener>();
  let selection = normalizeSelection(options.selection);
  let version = 0;

  function emit(): FlowStoreSnapshot {
    version += 1;
    const next = snapshotFrom(history, selection, version);
    listeners.forEach((listener) => listener(next));
    return next;
  }

  return {
    clearActionSelection: () => {
      selection = { ...selection, ...clearFlowActionSelectionState() };
      return emit();
    },
    clearRouteSelection: () => {
      selection = { ...selection, ...clearFlowRouteNodeSelectionState() };
      return emit();
    },
    execute: (command) => {
      history.execute(command);
      return emit();
    },
    replaceFlow: (flow) => {
      history.replace(flow);
      selection = normalizeSelection({
        ...selection,
        selectedFlowStateId: flowStateIds(flow).includes(selection.selectedFlowStateId)
          ? selection.selectedFlowStateId
          : flow.states[0]?.id || ""
      });
      return emit();
    },
    redo: () => {
      const flow = history.redo();
      return flow ? emit() : null;
    },
    selectActions: (ids, validIds) => {
      selection = { ...selection, ...setFlowActionSelectionState(ids, validIds) };
      return emit();
    },
    selectMoments: (ids, validStateIds) => {
      selection = {
        ...selection,
        ...setFlowMomentSelectionState(ids, validStateIds || flowStateIds(history.flow()))
      };
      return emit();
    },
    selectRouteBranch: (routeNodeId, branchId) => {
      selection = { ...selection, ...setFlowRouteBranchSelectionState(routeNodeId, branchId) };
      return emit();
    },
    selectRouteNode: (routeNodeId) => {
      selection = { ...selection, ...setFlowRouteNodeSelectionState(routeNodeId) };
      return emit();
    },
    snapshot: () => snapshotFrom(history, selection, version),
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    undo: () => {
      const flow = history.undo();
      return flow ? emit() : null;
    }
  };
}
