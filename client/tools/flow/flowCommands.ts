import type { FlowState, GameFlow } from "../../types/game-data";
import { addFlowState, createDefaultFlowState, moveFlowState, renameFlowState, type RenameFlowStateOptions } from "./flowMutations";
import { assertFlowModel } from "./flowValidation";

export interface FlowCommand {
  id: string;
  label: string;
  apply: (flow: GameFlow) => void;
}

export interface FlowCommandHistoryEntry {
  command: FlowCommand;
  before: GameFlow;
  after: GameFlow;
}

export interface FlowCommandHistoryOptions {
  cloneFlow?: (flow: GameFlow) => GameFlow;
  limit?: number;
}

export interface FlowCommandHistory {
  canRedo: () => boolean;
  canUndo: () => boolean;
  execute: (command: FlowCommand) => GameFlow;
  flow: () => GameFlow;
  redo: () => GameFlow | null;
  replace: (flow: GameFlow) => void;
  undo: () => GameFlow | null;
  undoLabels: () => string[];
  redoLabels: () => string[];
}

function cloneGameFlow(flow: GameFlow): GameFlow {
  return JSON.parse(JSON.stringify(flow)) as GameFlow;
}

export function createFlowCommandHistory(initialFlow: GameFlow, options: FlowCommandHistoryOptions = {}): FlowCommandHistory {
  const cloneFlow = options.cloneFlow || cloneGameFlow;
  const limit = Math.max(1, options.limit || 30);
  let currentFlow = cloneFlow(initialFlow);
  const undoStack: FlowCommandHistoryEntry[] = [];
  const redoStack: FlowCommandHistoryEntry[] = [];

  function setFlow(flow: GameFlow): GameFlow {
    assertFlowModel(flow);
    currentFlow = cloneFlow(flow);
    return cloneFlow(currentFlow);
  }

  return {
    canRedo: () => redoStack.length > 0,
    canUndo: () => undoStack.length > 0,
    execute: (command) => {
      const before = cloneFlow(currentFlow);
      const draft = cloneFlow(currentFlow);
      command.apply(draft);
      assertFlowModel(draft);
      const after = cloneFlow(draft);
      currentFlow = after;
      undoStack.push({ command, before, after: cloneFlow(after) });
      if (undoStack.length > limit) undoStack.shift();
      redoStack.length = 0;
      return cloneFlow(currentFlow);
    },
    flow: () => cloneFlow(currentFlow),
    redo: () => {
      const entry = redoStack.pop();
      if (!entry) return null;
      currentFlow = cloneFlow(entry.after);
      undoStack.push(entry);
      return cloneFlow(currentFlow);
    },
    replace: (flow) => {
      setFlow(flow);
      undoStack.length = 0;
      redoStack.length = 0;
    },
    undo: () => {
      const entry = undoStack.pop();
      if (!entry) return null;
      currentFlow = cloneFlow(entry.before);
      redoStack.push(entry);
      return cloneFlow(currentFlow);
    },
    undoLabels: () => undoStack.map((entry) => entry.command.label),
    redoLabels: () => redoStack.map((entry) => entry.command.label)
  };
}

export function renameFlowStateCommand(stateId: string, nextName: string, options: RenameFlowStateOptions = {}): FlowCommand {
  return {
    id: `rename-flow-state:${stateId}`,
    label: "Rename flow state",
    apply: (flow) => {
      const state = (flow.states || []).find((item) => item.id === stateId);
      if (state) renameFlowState(state, nextName, options);
    }
  };
}

export function addFlowStateCommand(state?: FlowState): FlowCommand {
  return {
    id: "add-flow-state",
    label: "Add flow state",
    apply: (flow) => {
      addFlowState(flow, state || createDefaultFlowState((flow.states || []).length + 1));
    }
  };
}

export function moveFlowStateCommand(draggedStateId: string, targetStateId: string, placeAfter = false): FlowCommand {
  return {
    id: `move-flow-state:${draggedStateId}`,
    label: "Move flow state",
    apply: (flow) => {
      moveFlowState(flow, draggedStateId, targetStateId, placeAfter);
    }
  };
}
