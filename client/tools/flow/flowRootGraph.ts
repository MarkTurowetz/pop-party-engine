import type { FlowAction, FlowRouteNode, FlowState, GameFlow } from "../../types/game-data";
import { decisionBranchName, decisionBranchWireLabel, ensureDecisionBranches } from "./flowDecision";
import {
  decisionBranchConnectionKind,
  decisionBranchGraphNodeId,
  decisionBranchTargetAnchor,
  subroutineGraphNodes,
  type FlowGraphConnection,
  type FlowGraphNode,
  type FlowGraphSelection,
  type FlowNodeExit
} from "./flowNodeGraph";
import { flowRouteNodeTypeName, isFlowRouteDecisionNode, type FlowRouteNodeModel } from "./flowRouteGraph";

export const ROOT_FLOW_SUBROUTINE_ID = "root-flow";

export interface RootFlowSubroutine extends FlowAction {
  id: typeof ROOT_FLOW_SUBROUTINE_ID;
  name: string;
  type: "subroutine";
  actions: FlowAction[];
}

export type RootFlowNodeSource = "state" | "routeNode";

export interface RootFlowAction extends FlowAction {
  rootNodeSource: RootFlowNodeSource;
}

function rootTargetIsEmpty(value: unknown): boolean {
  const target = String(value || "");
  return !target || target === "none" || target === "noFlow";
}

function rootActionTarget(action: RootFlowAction): string {
  if (action.type === "jumpNode") {
    return String(action.jumpTargetActionId || action.nextTargetActionId || "");
  }
  return String(action.nextTargetActionId || "");
}

function routeDecisionBranches(node: FlowRouteNode): FlowAction[] {
  const normalized = ensureDecisionBranches(
    {
      ...(node as FlowAction),
      branches: Array.isArray(node.branches) ? [...node.branches] : undefined
    },
    { targetField: "targetNodeId" }
  );
  return normalized.map((branch) => ({
    ...branch,
    targetActionId: String(branch.targetNodeId || branch.targetActionId || "")
  })) as FlowAction[];
}

function stateAsRootAction(state: FlowState): RootFlowAction {
  return {
    id: state.id,
    name: state.name || state.id,
    type: "subroutine",
    actions: state.actions || [],
    entryTargetActionId: String(state.entryTargetActionId || ""),
    nextTargetActionId: String(state.nextStateTargetId || ""),
    nodePosition: state.nodePosition,
    rootNodeSource: "state",
    subActions: []
  };
}

function routeNodeAsRootAction(node: FlowRouteNode, index: number): RootFlowAction {
  const routeNode = node as FlowRouteNodeModel;
  const routeNodeType = routeNode.routeNodeType || "momentEntry";
  const type = isFlowRouteDecisionNode(routeNode)
    ? "decision"
    : routeNodeType === "momentEntry"
      ? "momentEntry"
      : routeNode.type || "presentText";
  const nextTargetActionId =
    routeNodeType === "momentEntry"
      ? String(routeNode.targetStateId || "")
      : String(routeNode.nextTargetNodeId || routeNode.nextTargetActionId || "");
  return {
    ...(routeNode as FlowAction),
    id: String(routeNode.id || `route-node-${index + 1}`),
    name: routeNode.name || `${flowRouteNodeTypeName(routeNode)} ${index + 1}`,
    type,
    branches: type === "decision" ? routeDecisionBranches(routeNode) : routeNode.branches,
    nextTargetActionId,
    rootNodeSource: "routeNode",
    subActions: routeNode.subActions || []
  };
}

export function rootFlowActions(flow: Partial<GameFlow> | null | undefined): RootFlowAction[] {
  const stateActions = (flow?.states || []).map(stateAsRootAction);
  const routeActions = (flow?.routeNodes || []).map(routeNodeAsRootAction);
  return [...stateActions, ...routeActions];
}

export function rootFlowSubroutine(flow: Partial<GameFlow> | null | undefined): RootFlowSubroutine {
  return {
    id: ROOT_FLOW_SUBROUTINE_ID,
    name: "Root Flow",
    type: "subroutine",
    actions: rootFlowActions(flow),
    subActions: []
  };
}

export function rootFlowActionById(
  flow: Partial<GameFlow> | null | undefined,
  actionId: string
): RootFlowAction | null {
  return rootFlowActions(flow).find((action) => action.id === actionId) || null;
}

export function rootFlowNodeSource(
  flow: Partial<GameFlow> | null | undefined,
  nodeId: string
): RootFlowNodeSource | null {
  const action = rootFlowActionById(flow, nodeId);
  return action?.rootNodeSource || null;
}

export function rootFlowTargetOptions(
  flow: Partial<GameFlow> | null | undefined,
  currentNodeId = ""
): { id: string; label: string }[] {
  const options = [{ id: "none", label: "None / Halt" }];
  for (const action of rootFlowActions(flow)) {
    if (action.id === currentNodeId) continue;
    const prefix = action.rootNodeSource === "state" ? "Subroutine" : flowRouteNodeTypeName(action);
    options.push({ id: action.id, label: `${prefix}: ${action.name || action.id}` });
  }
  return options;
}

export function rootFlowGraphNodes(
  flow: Partial<GameFlow> | null | undefined,
  selection: FlowGraphSelection = {}
): FlowGraphNode[] {
  const selectedRouteBranchNodeId =
    selection.selectedRouteNodeId && selection.selectedRouteBranchId
      ? decisionBranchGraphNodeId(selection.selectedRouteNodeId, selection.selectedRouteBranchId)
      : "";
  const selectedActionId =
    selectedRouteBranchNodeId ||
    selection.selectedRouteNodeId ||
    selection.selectedActionId ||
    selection.selectedStateId ||
    "";
  return subroutineGraphNodes(rootFlowSubroutine(flow), {
    ...selection,
    selectedActionId
  }).filter((node) => node.kind !== "system");
}

export function rootFlowNodeExits(flow: Partial<GameFlow> | null | undefined): FlowNodeExit[] {
  const exits: FlowNodeExit[] = [];
  for (const action of rootFlowActions(flow)) {
    if (action.type === "decision") {
      for (const branch of routeDecisionBranches(action)) {
        const viewNodeId = decisionBranchGraphNodeId(action.id, branch.id);
        exits.push({
          id: `${viewNodeId}:target`,
          nodeId: action.id,
          viewNodeId,
          label: "Target",
          kind: "branch",
          branchId: branch.id,
          currentTarget: String(branch.targetActionId || ""),
          portSide: "right"
        });
      }
      continue;
    }
    if (action.type === "jumpNode") {
      exits.push({
        id: `${action.id}:jumpTargetActionId`,
        nodeId: action.id,
        label: "Jump",
        kind: "field",
        field: "jumpTargetActionId",
        currentTarget: rootActionTarget(action)
      });
      continue;
    }
    exits.push({
      id: `${action.id}:nextTargetActionId`,
      nodeId: action.id,
      label: "Next",
      kind: "field",
      field: "nextTargetActionId",
      currentTarget: String(action.nextTargetActionId || "")
    });
  }
  return exits;
}

export function rootFlowGraphConnections(
  flow: Partial<GameFlow> | null | undefined
): FlowGraphConnection[] {
  const actions = rootFlowActions(flow);
  const graphNodes = rootFlowGraphNodes(flow);
  const nodeIds = new Set(graphNodes.map((node) => node.id));
  const connections: FlowGraphConnection[] = [];
  for (const action of actions) {
    if (action.type === "decision") {
      const branchAnchor = decisionBranchTargetAnchor(graphNodes, action.id);
      routeDecisionBranches(action).forEach((branch, index) => {
        const branchNodeId = decisionBranchGraphNodeId(action.id, branch.id);
        if (nodeIds.has(branchNodeId)) {
          connections.push({
            id: `${action.id}->${branchNodeId}`,
            from: action.id,
            to: branchNodeId,
            label: decisionBranchName(branch, index)
          });
        }
        const target = String(branch.targetActionId || "");
        if (rootTargetIsEmpty(target) || !nodeIds.has(target)) return;
        connections.push({
          id: `${branchNodeId}->${target}`,
          from: branchNodeId,
          to: target,
          label: decisionBranchWireLabel(branch, index),
          labelKind: decisionBranchConnectionKind(branch as FlowAction),
          fromPoint: branchAnchor
        });
      });
      continue;
    }
    const target = rootActionTarget(action);
    if (rootTargetIsEmpty(target) || !nodeIds.has(target)) continue;
    connections.push({
      id: `${action.id}->${target}:${action.type === "jumpNode" ? "Jump" : "Next"}`,
      from: action.id,
      to: target,
      label: action.type === "jumpNode" ? "Jump" : "Next",
      labelKind: action.type === "jumpNode" ? "jump-preview" : undefined,
      visibleWhenSelected: action.type === "jumpNode" ? true : undefined
    });
  }
  return connections;
}

export function rootRouteNodeIds(flow: Partial<GameFlow> | null | undefined): string[] {
  return rootFlowActions(flow)
    .filter((action) => action.rootNodeSource === "routeNode")
    .map((action) => action.id);
}

export function rootStateIds(flow: Partial<GameFlow> | null | undefined): string[] {
  return rootFlowActions(flow)
    .filter((action) => action.rootNodeSource === "state")
    .map((action) => action.id);
}
