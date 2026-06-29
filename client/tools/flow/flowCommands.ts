import type { FlowAction, FlowRouteNode, FlowState, GameFlow } from "../../types/game-data";
import {
  addDefaultFlowAction,
  addDefaultFlowSubAction,
  addFlowState,
  createDefaultFlowState,
  moveFlowActionInState,
  moveFlowState,
  moveFlowSubAction,
  removeFlowRouteBranch,
  removeFlowRouteNode,
  removeFlowStates,
  removeSelectedFlowActionsFromList,
  renameFlowState,
  setFlowStateEntryTarget,
  setFlowStateNextTarget,
  setFlowStateVotingSource,
  type RemoveFlowRouteBranchOptions,
  type RenameFlowStateOptions
} from "./flowMutations";
import { ensureDecisionBranches, makeDecisionBranchId, type FlowDecisionBranch } from "./flowDecision";
import { assertFlowModel } from "./flowValidation";

function findFlowState(flow: GameFlow, stateId: string): FlowState | undefined {
  return (flow.states || []).find((state) => state.id === stateId);
}

interface FlowActionContext {
  action: FlowAction | undefined;
  isSubAction: boolean;
}

function findFlowActionContext(state: FlowState | undefined, actionId: string): FlowActionContext {
  if (state) {
    for (const action of state.actions || []) {
      if (action.id === actionId) return { action, isSubAction: false };
      for (const subAction of action.subActions || []) {
        if (subAction.id === actionId) return { action: subAction, isSubAction: true };
      }
    }
  }
  return { action: undefined, isSubAction: false };
}

function findFlowAction(state: FlowState | undefined, actionId: string): FlowAction | undefined {
  return findFlowActionContext(state, actionId).action;
}

export type ApplyFlowActionType = (action: FlowAction, type: string, isSubAction: boolean) => void;

function findFlowRouteNode(flow: GameFlow, nodeId: string): FlowRouteNode | undefined {
  return (flow.routeNodes || []).find((node) => node.id === nodeId);
}

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

export function removeFlowStatesCommand(stateIds: Iterable<string>): FlowCommand {
  const ids = [...stateIds];
  return {
    id: `remove-flow-states:${ids.join(",")}`,
    label: ids.length > 1 ? "Delete flow states" : "Delete flow state",
    apply: (flow) => {
      removeFlowStates(flow, ids);
    }
  };
}

export function addFlowActionCommand(stateId: string, selectedPrimaryActionId = ""): FlowCommand {
  return {
    id: `add-flow-action:${stateId}`,
    label: "Add flow action",
    apply: (flow) => {
      const state = findFlowState(flow, stateId);
      if (state) addDefaultFlowAction(state, selectedPrimaryActionId);
    }
  };
}

export function setFlowActionTypeCommand(
  stateId: string,
  actionId: string,
  type: string,
  applyType: ApplyFlowActionType
): FlowCommand {
  return {
    id: `set-flow-action-type:${actionId}`,
    label: "Change action type",
    apply: (flow) => {
      const context = findFlowActionContext(findFlowState(flow, stateId), actionId);
      if (context.action) applyType(context.action, type, context.isSubAction);
    }
  };
}

export interface FlowActionTimingPatch {
  mode?: string;
  seconds?: number;
}

export function setFlowActionTimingCommand(stateId: string, actionId: string, timing: FlowActionTimingPatch): FlowCommand {
  return {
    id: `set-flow-action-timing:${actionId}`,
    label: "Edit action timing",
    apply: (flow) => {
      const action = findFlowAction(findFlowState(flow, stateId), actionId);
      if (!action) return;
      const current = action.timing || { mode: "E+", seconds: 0 };
      const mode = timing.mode ?? current.mode ?? "E+";
      const secondsValue = timing.seconds ?? current.seconds ?? 0;
      const seconds = Number.isFinite(Number(secondsValue)) ? Math.max(0, Number(secondsValue)) : 0;
      action.timing = { ...current, mode, seconds };
    }
  };
}

export function setFlowActionFieldCommand(stateId: string, actionId: string, key: string, value: unknown): FlowCommand {
  return {
    id: `set-flow-action-field:${actionId}:${key}`,
    label: "Edit action field",
    apply: (flow) => {
      const action = findFlowAction(findFlowState(flow, stateId), actionId) as Record<string, unknown> | undefined;
      if (action) action[key] = value;
    }
  };
}

export function setFlowNodePositionCommand(
  depth: "moments" | "actions",
  stateId: string,
  nodeId: string,
  x: number,
  y: number
): FlowCommand {
  const position = { x: Math.round(x), y: Math.round(y) };
  return {
    id: `set-flow-node-position:${depth}:${nodeId}`,
    label: "Move node",
    apply: (flow) => {
      if (depth === "moments") {
        const state = findFlowState(flow, nodeId);
        if (state) (state as Record<string, unknown>).nodePosition = position;
        return;
      }
      const state = findFlowState(flow, stateId);
      if (!state) return;
      if (nodeId === "start") (state as Record<string, unknown>).startNodePosition = position;
      else if (nodeId === "return") (state as Record<string, unknown>).returnNodePosition = position;
      else {
        const action = findFlowAction(state, nodeId);
        if (action) (action as Record<string, unknown>).nodePosition = position;
      }
    }
  };
}

export function addDecisionBranchCommand(stateId: string, actionId: string): FlowCommand {
  return {
    id: `add-decision-branch:${actionId}`,
    label: "Add decision branch",
    apply: (flow) => {
      const action = findFlowAction(findFlowState(flow, stateId), actionId);
      if (!action) return;
      const branches = ensureDecisionBranches(action);
      const noMatchIndex = branches.findIndex((branch) => branch.type === "noMatch");
      const newBranch: FlowDecisionBranch = {
        id: makeDecisionBranchId("branch"),
        type: "hit",
        value: "",
        code: "x < 3",
        targetActionId: ""
      };
      branches.splice(noMatchIndex >= 0 ? noMatchIndex : branches.length, 0, newBranch);
      action.branches = branches as unknown as FlowAction["branches"];
    }
  };
}

export function removeDecisionBranchCommand(stateId: string, actionId: string, branchId: string): FlowCommand {
  return {
    id: `remove-decision-branch:${actionId}:${branchId}`,
    label: "Delete decision branch",
    apply: (flow) => {
      const action = findFlowAction(findFlowState(flow, stateId), actionId);
      if (!action) return;
      const branches = ensureDecisionBranches(action);
      const branch = branches.find((item) => item.id === branchId);
      if (!branch || branch.type === "noMatch") return;
      action.branches = branches.filter((item) => item.id !== branchId) as unknown as FlowAction["branches"];
    }
  };
}

export function setDecisionBranchFieldCommand(
  stateId: string,
  actionId: string,
  branchId: string,
  key: string,
  value: unknown
): FlowCommand {
  return {
    id: `set-decision-branch-field:${actionId}:${branchId}:${key}`,
    label: "Edit decision branch",
    apply: (flow) => {
      const action = findFlowAction(findFlowState(flow, stateId), actionId);
      if (!action) return;
      const branches = ensureDecisionBranches(action);
      const branch = branches.find((item) => item.id === branchId);
      if (branch) (branch as Record<string, unknown>)[key] = value;
      action.branches = branches as unknown as FlowAction["branches"];
    }
  };
}

function actionOptions(action: FlowAction): string[] {
  const value = (action as Record<string, unknown>).options;
  return Array.isArray(value) ? value.map((entry) => String(entry)) : [];
}

export function addActionOptionCommand(stateId: string, actionId: string): FlowCommand {
  return {
    id: `add-action-option:${actionId}`,
    label: "Add option",
    apply: (flow) => {
      const action = findFlowAction(findFlowState(flow, stateId), actionId);
      if (!action) return;
      const options = actionOptions(action);
      options.push(String.fromCharCode(65 + options.length));
      (action as Record<string, unknown>).options = options;
    }
  };
}

export function removeActionOptionCommand(stateId: string, actionId: string, index: number): FlowCommand {
  return {
    id: `remove-action-option:${actionId}:${index}`,
    label: "Remove option",
    apply: (flow) => {
      const action = findFlowAction(findFlowState(flow, stateId), actionId);
      if (!action) return;
      const options = actionOptions(action);
      if (index >= 0 && index < options.length) options.splice(index, 1);
      (action as Record<string, unknown>).options = options;
    }
  };
}

export function setActionOptionCommand(stateId: string, actionId: string, index: number, value: string): FlowCommand {
  return {
    id: `set-action-option:${actionId}:${index}`,
    label: "Edit option",
    apply: (flow) => {
      const action = findFlowAction(findFlowState(flow, stateId), actionId);
      if (!action) return;
      const options = actionOptions(action);
      if (index >= 0 && index < options.length) options[index] = value;
      (action as Record<string, unknown>).options = options;
    }
  };
}

export function renameFlowActionCommand(stateId: string, actionId: string, nextName: string): FlowCommand {
  return {
    id: `rename-flow-action:${actionId}`,
    label: "Rename flow action",
    apply: (flow) => {
      const action = findFlowAction(findFlowState(flow, stateId), actionId);
      if (action) action.name = nextName;
    }
  };
}

export function addFlowSubActionCommand(stateId: string, parentActionId: string, selectedSubActionId = ""): FlowCommand {
  return {
    id: `add-flow-sub-action:${parentActionId}`,
    label: "Add sub-action",
    apply: (flow) => {
      const parentAction = findFlowAction(findFlowState(flow, stateId), parentActionId);
      if (parentAction) addDefaultFlowSubAction(parentAction, selectedSubActionId, stateId);
    }
  };
}

export function moveFlowActionCommand(
  stateId: string,
  draggedActionId: string,
  targetActionId: string,
  placeAfter = false
): FlowCommand {
  return {
    id: `move-flow-action:${draggedActionId}`,
    label: "Move flow action",
    apply: (flow) => {
      moveFlowActionInState(findFlowState(flow, stateId), draggedActionId, targetActionId, placeAfter);
    }
  };
}

export function moveFlowSubActionCommand(
  stateId: string,
  parentActionId: string,
  draggedActionId: string,
  targetActionId: string,
  placeAfter = false
): FlowCommand {
  return {
    id: `move-flow-sub-action:${draggedActionId}`,
    label: "Move sub-action",
    apply: (flow) => {
      const parentAction = findFlowAction(findFlowState(flow, stateId), parentActionId);
      moveFlowSubAction(parentAction, draggedActionId, targetActionId, placeAfter);
    }
  };
}

export function removeFlowActionsCommand(stateId: string, selectedIds: Iterable<string>): FlowCommand {
  const ids = new Set(selectedIds);
  return {
    id: `remove-flow-actions:${[...ids].join(",")}`,
    label: ids.size > 1 ? "Delete flow actions" : "Delete flow action",
    apply: (flow) => {
      const state = findFlowState(flow, stateId);
      if (!state) return;
      const result = removeSelectedFlowActionsFromList(state.actions || [], ids);
      state.actions = result.actions;
    }
  };
}

export function setFlowStateNextTargetCommand(stateId: string, targetId: string): FlowCommand {
  return {
    id: `set-flow-state-next-target:${stateId}`,
    label: "Set next state target",
    apply: (flow) => {
      const state = findFlowState(flow, stateId);
      if (state) setFlowStateNextTarget(state, targetId);
    }
  };
}

export function setFlowStateEntryTargetCommand(stateId: string, targetId: string): FlowCommand {
  return {
    id: `set-flow-state-entry-target:${stateId}`,
    label: "Set entry action target",
    apply: (flow) => {
      const state = findFlowState(flow, stateId);
      if (state) setFlowStateEntryTarget(state, targetId);
    }
  };
}

export function setFlowStateVotingSourceCommand(stateId: string, sourceStateId: string): FlowCommand {
  return {
    id: `set-flow-state-voting-source:${stateId}`,
    label: "Set voting source",
    apply: (flow) => {
      const state = findFlowState(flow, stateId);
      if (state) setFlowStateVotingSource(state, sourceStateId);
    }
  };
}

export function removeFlowRouteBranchCommand(
  nodeId: string,
  branchId: string,
  options: RemoveFlowRouteBranchOptions = {}
): FlowCommand {
  return {
    id: `remove-flow-route-branch:${nodeId}:${branchId}`,
    label: "Delete route branch",
    apply: (flow) => {
      removeFlowRouteBranch(findFlowRouteNode(flow, nodeId), branchId, options);
    }
  };
}

export function removeFlowRouteNodeCommand(nodeId: string): FlowCommand {
  return {
    id: `remove-flow-route-node:${nodeId}`,
    label: "Delete route node",
    apply: (flow) => {
      removeFlowRouteNode(flow, nodeId);
    }
  };
}
