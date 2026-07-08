import type { FlowAction, FlowRouteNode, FlowState, GameFlow } from "../../types/game-data";
import {
  addDefaultFlowAction,
  addDefaultFlowActionToSubroutine,
  addDefaultFlowSubroutine,
  addDefaultFlowSubAction,
  addFlowState,
  createDefaultFlowState,
  moveFlowActionInState,
  moveFlowState,
  moveFlowSubAction,
  refreshFlowActionName,
  removeFlowRouteBranch,
  removeFlowRouteNode,
  removeFlowStates,
  removeSelectedFlowActionsFromList,
  renameFlowState,
  setFlowStateEntryTarget,
  setFlowStateNextTarget,
  setFlowStateVotingSource,
  type AddFlowSubActionOptions,
  type RemoveFlowRouteBranchOptions,
  type RenameFlowStateOptions
} from "./flowMutations";
import { flowActionNameForType, type FlowActionTypeNamer } from "./flowActions";
import {
  ensureDecisionBranches,
  makeDecisionBranchId,
  type FlowDecisionBranch
} from "./flowDecision";
import type { FlowNodeExit, FlowNodePoint, FlowNodePositionUpdate } from "./flowNodeGraph";
import { assertFlowModel } from "./flowValidation";
import {
  findFlowAction,
  findFlowActionContext,
  findFlowSubroutine,
  flowSubroutineActions,
  type FlowSubroutine
} from "./flowSubroutines";
import {
  createRouteActionNode,
  isFlowRouteDecisionNode,
  type FlowRouteNodeModel
} from "./flowRouteGraph";

export type { FlowNodePositionUpdate } from "./flowNodeGraph";

function findFlowState(flow: GameFlow, stateId: string): FlowState | undefined {
  return (flow.states || []).find((state) => state.id === stateId);
}

export type ApplyFlowActionType = (action: FlowAction, type: string, isSubAction: boolean) => void;

export interface FlowActionTypeCommandOptions {
  nameForType?: FlowActionTypeNamer;
}

function assignFlowActionTypeName(
  action: FlowAction,
  type: string,
  options: FlowActionTypeCommandOptions = {}
): void {
  action.name = flowActionNameForType(type, options.nameForType);
}

function findFlowRouteNode(flow: GameFlow, nodeId: string): FlowRouteNode | undefined {
  return (flow.routeNodes || []).find((node) => node.id === nodeId);
}

function flowRouteNodes(flow: GameFlow): FlowRouteNode[] {
  if (!Array.isArray(flow.routeNodes)) flow.routeNodes = [];
  return flow.routeNodes;
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

export function createFlowCommandHistory(
  initialFlow: GameFlow,
  options: FlowCommandHistoryOptions = {}
): FlowCommandHistory {
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

export function renameFlowStateCommand(
  stateId: string,
  nextName: string,
  options: RenameFlowStateOptions = {}
): FlowCommand {
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

export function moveFlowStateCommand(
  draggedStateId: string,
  targetStateId: string,
  placeAfter = false
): FlowCommand {
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

export function addFlowActionToSubroutineCommand(
  stateId: string,
  subroutinePath: Iterable<string> = [],
  selectedPrimaryActionId = ""
): FlowCommand {
  const path = [...subroutinePath].filter(Boolean);
  return {
    id: `add-flow-action:${stateId}:${path.join("/")}`,
    label: "Add flow action",
    apply: (flow) => {
      const ref = findFlowSubroutine(flow, stateId, path);
      if (ref) addDefaultFlowActionToSubroutine(ref.subroutine, selectedPrimaryActionId, stateId);
    }
  };
}

export function addFlowSubroutineCommand(
  stateId: string,
  subroutinePath: Iterable<string> = [],
  selectedPrimaryActionId = ""
): FlowCommand {
  const path = [...subroutinePath].filter(Boolean);
  return {
    id: `add-flow-subroutine:${stateId}:${path.join("/")}`,
    label: "Add subroutine",
    apply: (flow) => {
      const ref = findFlowSubroutine(flow, stateId, path);
      if (ref) addDefaultFlowSubroutine(ref.subroutine, selectedPrimaryActionId, stateId);
    }
  };
}

function canConnectNewAction(source: Pick<FlowNodeExit, "kind" | "field" | "branchId">): boolean {
  if (source.kind === "entry") return true;
  if (source.kind === "field") return Boolean(source.field);
  if (source.kind === "branch") return Boolean(source.branchId);
  return false;
}

function connectSourceToAction(
  subroutine: FlowSubroutine,
  source: Pick<FlowNodeExit, "kind" | "nodeId" | "field" | "branchId">,
  targetActionId: string
): void {
  if (source.kind === "entry") {
    subroutine.entryTargetActionId = targetActionId;
    return;
  }

  const sourceAction = flowSubroutineActions(subroutine).find(
    (action) => action.id === source.nodeId
  );
  if (!sourceAction) return;

  if (source.kind === "field" && source.field) {
    (sourceAction as Record<string, unknown>)[source.field] = targetActionId;
    return;
  }

  if (source.kind === "branch" && source.branchId) {
    const branches = ensureDecisionBranches(sourceAction);
    const branch = branches.find((item) => item.id === source.branchId);
    if (branch) branch.targetActionId = targetActionId;
    sourceAction.branches = branches as unknown as FlowAction["branches"];
  }
}

const ROOT_ROUTE_TARGET_FIELDS = new Set([
  "nextTargetActionId",
  "stageClickTargetActionId",
  "timerEndTargetActionId",
  "answersSubmittedTargetActionId",
  "microphoneAccessGrantedTargetActionId"
]);

function ensureRouteDecisionBranches(node: FlowRouteNode): FlowDecisionBranch[] {
  return ensureDecisionBranches(node as FlowAction, { targetField: "targetNodeId" });
}

function setRootRouteTarget(
  node: FlowRouteNode,
  field: string | undefined,
  targetId: string
): void {
  const record = node as Record<string, unknown>;
  const routeNodeType = String(record.routeNodeType || "");
  if (routeNodeType === "momentEntry") {
    record.targetStateId = targetId;
    return;
  }
  if (field === "jumpTargetActionId") {
    record.jumpTargetActionId = targetId;
    return;
  }
  record.nextTargetNodeId = targetId;
  record.nextTargetActionId = targetId;
}

function connectRootSourceToTarget(
  flow: GameFlow,
  source: Pick<FlowNodeExit, "kind" | "nodeId" | "field" | "branchId">,
  targetId: string
): void {
  if (!source.nodeId || source.kind === "entry") return;

  const state = findFlowState(flow, source.nodeId);
  if (state) {
    if (source.kind === "field") setFlowStateNextTarget(state, targetId);
    return;
  }

  const node = findFlowRouteNode(flow, source.nodeId);
  if (!node) return;

  if (source.kind === "branch" && source.branchId) {
    const branches = ensureRouteDecisionBranches(node);
    const branch = branches.find((item) => item.id === source.branchId);
    if (branch) {
      branch.targetNodeId = targetId;
      branch.targetActionId = targetId;
    }
    (node as FlowAction).branches = branches as unknown as FlowAction["branches"];
    return;
  }

  if (source.kind === "field") setRootRouteTarget(node, source.field, targetId);
}

function createRootRouteAction(
  flow: GameFlow,
  position: FlowNodePoint | null,
  newNodeId?: string
): FlowRouteNodeModel {
  const nodePosition = position
    ? { x: Math.max(0, Math.round(position.x)), y: Math.max(0, Math.round(position.y)) }
    : null;
  const node = createRouteActionNode(flow, nodePosition);
  if (newNodeId) node.id = newNodeId;
  flowRouteNodes(flow).push(node);
  return node;
}

export function addConnectedFlowActionCommand(
  stateId: string,
  source: Pick<FlowNodeExit, "kind" | "nodeId" | "field" | "branchId">,
  position: FlowNodePoint,
  subroutinePath: Iterable<string> = []
): FlowCommand {
  const nodePosition = {
    x: Math.max(0, Math.round(position.x)),
    y: Math.max(0, Math.round(position.y))
  };
  const path = [...subroutinePath].filter(Boolean);
  return {
    id: `add-connected-flow-action:${stateId}:${source.nodeId}`,
    label: "Add connected action",
    apply: (flow) => {
      if (!canConnectNewAction(source)) return;
      const ref = findFlowSubroutine(flow, stateId, path);
      if (!ref) return;
      const insertAfterActionId =
        source.kind === "field" || source.kind === "branch" ? source.nodeId : "";
      const result = addDefaultFlowActionToSubroutine(ref.subroutine, insertAfterActionId, stateId);
      (result.action as Record<string, unknown>).nodePosition = nodePosition;
      connectSourceToAction(ref.subroutine, source, result.action.id);
    }
  };
}

export function addRootFlowActionCommand(
  position: FlowNodePoint | null = null,
  newNodeId?: string
): FlowCommand {
  return {
    id: `add-root-flow-action:${newNodeId || "auto"}`,
    label: "Add root action",
    apply: (flow) => {
      createRootRouteAction(flow, position, newNodeId);
    }
  };
}

export function connectRootFlowActionCommand(
  source: Pick<FlowNodeExit, "kind" | "nodeId" | "field" | "branchId">,
  targetId: string
): FlowCommand {
  return {
    id: `connect-root-flow-action:${source.nodeId}:${targetId}`,
    label: "Connect root action",
    apply: (flow) => {
      connectRootSourceToTarget(flow, source, targetId);
    }
  };
}

export function addConnectedRootFlowActionCommand(
  source: Pick<FlowNodeExit, "kind" | "nodeId" | "field" | "branchId">,
  position: FlowNodePoint,
  newNodeId?: string
): FlowCommand {
  return {
    id: `add-connected-root-flow-action:${source.nodeId}:${newNodeId || "auto"}`,
    label: "Add connected root action",
    apply: (flow) => {
      if (!canConnectNewAction(source)) return;
      const node = createRootRouteAction(flow, position, newNodeId);
      connectRootSourceToTarget(flow, source, String(node.id || ""));
    }
  };
}

export function setFlowActionTypeCommand(
  stateId: string,
  actionId: string,
  type: string,
  applyType: ApplyFlowActionType,
  options: FlowActionTypeCommandOptions = {}
): FlowCommand {
  return {
    id: `set-flow-action-type:${actionId}`,
    label: "Change action type",
    apply: (flow) => {
      const context = findFlowActionContext(findFlowState(flow, stateId), actionId);
      if (!context.action) return;
      applyType(context.action, type, context.isSubAction);
      assignFlowActionTypeName(context.action, type, options);
    }
  };
}

export interface FlowActionTimingPatch {
  mode?: string;
  seconds?: number;
}

export function setFlowActionTimingCommand(
  stateId: string,
  actionId: string,
  timing: FlowActionTimingPatch
): FlowCommand {
  return {
    id: `set-flow-action-timing:${actionId}`,
    label: "Edit action timing",
    apply: (flow) => {
      const actionContext = findFlowActionContext(findFlowState(flow, stateId), actionId);
      const action = actionContext.action;
      if (!action) return;
      const current = action.timing || { mode: "E+", seconds: 0 };
      const mode = actionContext.isSubAction ? "S+" : (timing.mode ?? current.mode ?? "E+");
      const secondsValue = timing.seconds ?? current.seconds ?? 0;
      const seconds = Number.isFinite(Number(secondsValue)) ? Math.max(0, Number(secondsValue)) : 0;
      action.timing = { ...current, mode, seconds };
    }
  };
}

export function setFlowActionFieldCommand(
  stateId: string,
  actionId: string,
  key: string,
  value: unknown
): FlowCommand {
  return {
    id: `set-flow-action-field:${actionId}:${key}`,
    label: "Edit action field",
    apply: (flow) => {
      const action = findFlowAction(findFlowState(flow, stateId), actionId) as
        Record<string, unknown> | undefined;
      if (action) action[key] = value;
    }
  };
}

export function setFlowActionFieldsCommand(
  stateId: string,
  actionId: string,
  patch: Record<string, unknown>
): FlowCommand {
  const keys = Object.keys(patch).sort();
  return {
    id: `set-flow-action-fields:${actionId}:${keys.join(",")}`,
    label: "Edit action fields",
    apply: (flow) => {
      const action = findFlowAction(findFlowState(flow, stateId), actionId) as
        Record<string, unknown> | undefined;
      if (!action) return;
      for (const key of keys) action[key] = patch[key];
    }
  };
}

export function setFlowNodePositionCommand(
  depth: "subroutines" | "subroutine",
  stateId: string,
  nodeId: string,
  x: number,
  y: number,
  subroutinePath: Iterable<string> = []
): FlowCommand {
  const position = { x: Math.round(x), y: Math.round(y) };
  const path = [...subroutinePath].filter(Boolean);
  return {
    id: `set-flow-node-position:${depth}:${nodeId}`,
    label: "Move node",
    apply: (flow) => {
      applyFlowNodePosition(flow, depth, stateId, nodeId, position, path);
    }
  };
}

function applyFlowNodePosition(
  flow: GameFlow,
  depth: "subroutines" | "subroutine",
  stateId: string,
  nodeId: string,
  position: { x: number; y: number },
  subroutinePath: Iterable<string> = []
): void {
  if (depth === "subroutines") {
    const state = findFlowState(flow, nodeId);
    if (state) (state as Record<string, unknown>).nodePosition = position;
    const routeNode = findFlowRouteNode(flow, nodeId);
    if (routeNode) (routeNode as Record<string, unknown>).nodePosition = position;
    return;
  }
  const ref = findFlowSubroutine(flow, stateId, subroutinePath);
  const subroutine = ref?.subroutine;
  if (!subroutine) return;
  if (nodeId === "start") (subroutine as Record<string, unknown>).startNodePosition = position;
  else if (nodeId === "return")
    (subroutine as Record<string, unknown>).returnNodePosition = position;
  else {
    const action = flowSubroutineActions(subroutine).find((item) => item.id === nodeId);
    if (action) (action as Record<string, unknown>).nodePosition = position;
  }
}

export function setFlowNodePositionsCommand(
  depth: "subroutines" | "subroutine",
  stateId: string,
  updates: FlowNodePositionUpdate[],
  subroutinePath: Iterable<string> = []
): FlowCommand {
  const positions = updates.map((update) => ({
    nodeId: update.nodeId,
    x: Math.round(update.x),
    y: Math.round(update.y)
  }));
  const path = [...subroutinePath].filter(Boolean);
  return {
    id: `set-flow-node-positions:${depth}:${positions.map((position) => position.nodeId).join(",")}`,
    label: "Optimize node layout",
    apply: (flow) => {
      for (const position of positions) {
        applyFlowNodePosition(
          flow,
          depth,
          stateId,
          position.nodeId,
          {
            x: position.x,
            y: position.y
          },
          path
        );
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

export function removeDecisionBranchCommand(
  stateId: string,
  actionId: string,
  branchId: string
): FlowCommand {
  return {
    id: `remove-decision-branch:${actionId}:${branchId}`,
    label: "Delete decision branch",
    apply: (flow) => {
      const action = findFlowAction(findFlowState(flow, stateId), actionId);
      if (!action) return;
      const branches = ensureDecisionBranches(action);
      const branch = branches.find((item) => item.id === branchId);
      if (!branch || branch.type === "noMatch") return;
      action.branches = branches.filter(
        (item) => item.id !== branchId
      ) as unknown as FlowAction["branches"];
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

export function renameFlowRouteActionCommand(nodeId: string, nextName: string): FlowCommand {
  return {
    id: `rename-flow-route-action:${nodeId}`,
    label: "Rename root action",
    apply: (flow) => {
      const node = findFlowRouteNode(flow, nodeId);
      if (node) (node as Record<string, unknown>).name = nextName;
    }
  };
}

export function setFlowRouteActionTypeCommand(
  nodeId: string,
  type: string,
  applyType: ApplyFlowActionType,
  options: FlowActionTypeCommandOptions = {}
): FlowCommand {
  return {
    id: `set-flow-route-action-type:${nodeId}`,
    label: "Change root action type",
    apply: (flow) => {
      const node = findFlowRouteNode(flow, nodeId);
      if (!node) return;
      const record = node as FlowRouteNodeModel;
      record.routeNodeType = "action";
      applyType(record as FlowAction, type, false);
      assignFlowActionTypeName(record as FlowAction, type, options);
      if (type === "decision" || isFlowRouteDecisionNode(record)) {
        record.nextTargetNodeId = "";
        record.branches = ensureRouteDecisionBranches(record) as unknown as FlowAction["branches"];
      }
    }
  };
}

export function setFlowRouteActionFieldCommand(
  nodeId: string,
  key: string,
  value: unknown
): FlowCommand {
  return {
    id: `set-flow-route-action-field:${nodeId}:${key}`,
    label: "Edit root action field",
    apply: (flow) => {
      const node = findFlowRouteNode(flow, nodeId);
      if (!node) return;
      applyFlowRouteActionField(node, key, value);
    }
  };
}

function applyFlowRouteActionField(node: FlowRouteNode, key: string, value: unknown): void {
  const record = node as Record<string, unknown>;
  record[key] = value;
  if (key === "jumpTargetActionId") {
    setRootRouteTarget(node, key, String(value || ""));
  } else if (ROOT_ROUTE_TARGET_FIELDS.has(key)) {
    setRootRouteTarget(node, key, String(value || ""));
  }
}

export function setFlowRouteActionFieldsCommand(
  nodeId: string,
  patch: Record<string, unknown>
): FlowCommand {
  const keys = Object.keys(patch).sort();
  return {
    id: `set-flow-route-action-fields:${nodeId}:${keys.join(",")}`,
    label: "Edit root action fields",
    apply: (flow) => {
      const node = findFlowRouteNode(flow, nodeId);
      if (!node) return;
      for (const key of keys) applyFlowRouteActionField(node, key, patch[key]);
    }
  };
}

export function setFlowRouteActionTimingCommand(
  nodeId: string,
  timing: FlowActionTimingPatch
): FlowCommand {
  return {
    id: `set-flow-route-action-timing:${nodeId}`,
    label: "Edit root action timing",
    apply: (flow) => {
      const node = findFlowRouteNode(flow, nodeId) as FlowAction | undefined;
      if (!node) return;
      const current = node.timing || { mode: "E+", seconds: 0 };
      const mode = timing.mode ?? current.mode ?? "E+";
      const secondsValue = timing.seconds ?? current.seconds ?? 0;
      const seconds = Number.isFinite(Number(secondsValue)) ? Math.max(0, Number(secondsValue)) : 0;
      node.timing = { ...current, mode, seconds };
    }
  };
}

export function addFlowRouteDecisionBranchCommand(nodeId: string): FlowCommand {
  return {
    id: `add-flow-route-decision-branch:${nodeId}`,
    label: "Add root decision branch",
    apply: (flow) => {
      const node = findFlowRouteNode(flow, nodeId);
      if (!node) return;
      const branches = ensureRouteDecisionBranches(node);
      const noMatchIndex = branches.findIndex((branch) => branch.type === "noMatch");
      const newBranch: FlowDecisionBranch = {
        id: makeDecisionBranchId("branch"),
        type: "hit",
        value: "",
        code: "x < 3",
        targetNodeId: "",
        targetActionId: ""
      };
      branches.splice(noMatchIndex >= 0 ? noMatchIndex : branches.length, 0, newBranch);
      (node as FlowAction).branches = branches as unknown as FlowAction["branches"];
    }
  };
}

export function setFlowRouteDecisionBranchFieldCommand(
  nodeId: string,
  branchId: string,
  key: string,
  value: unknown
): FlowCommand {
  return {
    id: `set-flow-route-decision-branch-field:${nodeId}:${branchId}:${key}`,
    label: "Edit root decision branch",
    apply: (flow) => {
      const node = findFlowRouteNode(flow, nodeId);
      if (!node) return;
      const branches = ensureRouteDecisionBranches(node);
      const branch = branches.find((item) => item.id === branchId);
      if (branch) {
        if (key === "targetActionId" || key === "targetNodeId") {
          branch.targetNodeId = String(value || "");
          branch.targetActionId = String(value || "");
        } else {
          (branch as Record<string, unknown>)[key] = value;
        }
      }
      (node as FlowAction).branches = branches as unknown as FlowAction["branches"];
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

export function removeActionOptionCommand(
  stateId: string,
  actionId: string,
  index: number
): FlowCommand {
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

export function setActionOptionCommand(
  stateId: string,
  actionId: string,
  index: number,
  value: string
): FlowCommand {
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

export function renameFlowActionCommand(
  stateId: string,
  actionId: string,
  nextName: string
): FlowCommand {
  return {
    id: `rename-flow-action:${actionId}`,
    label: "Rename flow action",
    apply: (flow) => {
      const action = findFlowAction(findFlowState(flow, stateId), actionId);
      if (action) action.name = nextName;
    }
  };
}

export function refreshFlowActionTypeNameCommand(
  stateId: string,
  actionId: string,
  options: FlowActionTypeCommandOptions = {}
): FlowCommand {
  return {
    id: `refresh-flow-action-type-name:${actionId}`,
    label: "Refresh action name",
    apply: (flow) => {
      const state = findFlowState(flow, stateId);
      const context = findFlowActionContext(state, actionId);
      if (!context.action) return;
      refreshFlowActionName(state || {}, context.action, {
        nameForAction: (_state, action) =>
          flowActionNameForType(String(action.type || ""), options.nameForType)
      });
    }
  };
}

export function refreshFlowRouteActionTypeNameCommand(
  nodeId: string,
  options: FlowActionTypeCommandOptions = {}
): FlowCommand {
  return {
    id: `refresh-flow-route-action-type-name:${nodeId}`,
    label: "Refresh root action name",
    apply: (flow) => {
      const node = findFlowRouteNode(flow, nodeId);
      if (!node) return;
      const record = node as FlowRouteNodeModel;
      if (record.routeNodeType !== "action") return;
      assignFlowActionTypeName(record as FlowAction, String(record.type || ""), options);
    }
  };
}

export function addFlowSubActionCommand(
  stateId: string,
  parentActionId: string,
  selectedSubActionId = "",
  options: AddFlowSubActionOptions = {}
): FlowCommand {
  return {
    id: `add-flow-sub-action:${parentActionId}`,
    label: "Add sub-action",
    apply: (flow) => {
      const parentAction = findFlowAction(findFlowState(flow, stateId), parentActionId);
      if (parentAction)
        addDefaultFlowSubAction(parentAction, selectedSubActionId, stateId, options);
    }
  };
}

export function moveFlowActionCommand(
  stateId: string,
  draggedActionId: string,
  targetActionId: string,
  placeAfter = false,
  subroutinePath: Iterable<string> = []
): FlowCommand {
  const path = [...subroutinePath].filter(Boolean);
  return {
    id: `move-flow-action:${draggedActionId}`,
    label: "Move flow action",
    apply: (flow) => {
      const ref = findFlowSubroutine(flow, stateId, path);
      if (ref) moveFlowActionInState(ref.subroutine, draggedActionId, targetActionId, placeAfter);
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

export function removeFlowActionsCommand(
  stateId: string,
  selectedIds: Iterable<string>,
  subroutinePath: Iterable<string> = []
): FlowCommand {
  const ids = new Set(selectedIds);
  const path = [...subroutinePath].filter(Boolean);
  return {
    id: `remove-flow-actions:${[...ids].join(",")}`,
    label: ids.size > 1 ? "Delete flow actions" : "Delete flow action",
    apply: (flow) => {
      const ref = findFlowSubroutine(flow, stateId, path);
      if (!ref) return;
      const result = removeSelectedFlowActionsFromList(flowSubroutineActions(ref.subroutine), ids);
      ref.subroutine.actions = result.actions;
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

export function setFlowSubroutineEntryTargetCommand(
  stateId: string,
  subroutinePath: Iterable<string>,
  targetId: string
): FlowCommand {
  const path = [...subroutinePath].filter(Boolean);
  return {
    id: `set-flow-subroutine-entry-target:${stateId}:${path.join("/")}`,
    label: "Set subroutine entry target",
    apply: (flow) => {
      const ref = findFlowSubroutine(flow, stateId, path);
      if (ref) setFlowStateEntryTarget(ref.subroutine, targetId);
    }
  };
}

export function setFlowStateVotingSourceCommand(
  stateId: string,
  sourceStateId: string
): FlowCommand {
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
