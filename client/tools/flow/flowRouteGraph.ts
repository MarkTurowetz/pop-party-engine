import type { FlowAction, FlowRouteNode, FlowState, FlowTiming, GameFlow } from "../../types/game-data";

export interface FlowNodePosition {
  x: number;
  y: number;
}

export interface FlowRouteGraphOptions {
  defaultNodePosition?: (index: number, columns?: number, startX?: number, startY?: number, gapX?: number, gapY?: number) => FlowNodePosition | null;
  idFactory?: (prefix: string) => string;
}

export interface CreateMomentEntryNodeOptions extends FlowRouteGraphOptions {
  flowState?: (stateId: string) => Partial<FlowState> | null | undefined;
}

export interface ClearFlowRouteTargetReferencesOptions {
  ensureDecisionBranches?: (node: FlowRouteNode, options?: { targetField?: string }) => FlowAction[];
  isRouteDecisionNode?: (node: FlowRouteNode) => boolean;
  routeBranchTargetField?: string;
}

export interface FlowRouteNodeModel extends FlowRouteNode {
  id: string;
  routeNodeType?: string;
  name?: string;
  targetStateId?: string;
  nodePosition?: FlowNodePosition | null;
  type?: string;
  timing?: FlowTiming;
  text?: string;
  textTarget?: string;
  instant?: boolean;
  isShown?: boolean;
  subActions?: FlowAction[];
  nextTargetNodeId?: string;
  branches?: FlowAction[];
}

type FlowRouteNodeWithBranches = FlowRouteNode & {
  branches?: FlowAction[];
};

function routeNodes(flow: Partial<GameFlow> | null | undefined): FlowRouteNode[] {
  if (!flow) return [];
  if (!Array.isArray(flow.routeNodes)) flow.routeNodes = [];
  return flow.routeNodes;
}

function defaultIdFactory(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function createMomentEntryNode(flow: Partial<GameFlow> | null | undefined, selectedStateId = "", options: CreateMomentEntryNodeOptions = {}): FlowRouteNodeModel {
  const nodes = routeNodes(flow);
  const nextNumber = nodes.length + 1;
  const targetStateId = options.flowState?.(selectedStateId)?.id || flow?.states?.[0]?.id || "";
  return {
    id: (options.idFactory || defaultIdFactory)("moment-entry"),
    routeNodeType: "momentEntry",
    name: `Moment Entry ${nextNumber}`,
    targetStateId,
    nodePosition: options.defaultNodePosition?.(nextNumber - 1, 2, 860, 80, 320, 190) || null
  };
}

export function createRouteActionNode(flow: Partial<GameFlow> | null | undefined, point: FlowNodePosition | null = null, options: FlowRouteGraphOptions = {}): FlowRouteNodeModel {
  const nodes = routeNodes(flow);
  const nextNumber = nodes.filter((node) => node.routeNodeType === "action").length + 1;
  return {
    id: (options.idFactory || defaultIdFactory)("route-action"),
    routeNodeType: "action",
    name: `Action ${nextNumber}`,
    type: "presentText",
    timing: { mode: "E+", seconds: 0 },
    text: "Presented text",
    textTarget: "",
    instant: false,
    isShown: true,
    subActions: [],
    nextTargetNodeId: "",
    nodePosition: point || options.defaultNodePosition?.(nextNumber - 1, 2, 860, 600, 360, 220) || null
  };
}

export function clearFlowRouteTargetReferences(
  flow: Partial<GameFlow> | null | undefined,
  targetIds: string | string[],
  options: ClearFlowRouteTargetReferencesOptions = {}
): void {
  const targetSet = new Set((Array.isArray(targetIds) ? targetIds : [targetIds]).filter(Boolean));
  if (!targetSet.size) return;
  const targetField = options.routeBranchTargetField || "targetNodeId";

  for (const state of flow?.states || []) {
    if (targetSet.has(String(state.nextStateTargetId || ""))) state.nextStateTargetId = "";
  }
  for (const node of routeNodes(flow)) {
    if (targetSet.has(String(node.targetStateId || ""))) node.targetStateId = "";
    const isDecision = options.isRouteDecisionNode?.(node)
      || node.routeNodeType === "decision"
      || (node.routeNodeType === "action" && node.type === "decision");
    if (isDecision) {
      const routeNode = node as FlowRouteNodeWithBranches;
      const branches = options.ensureDecisionBranches?.(routeNode, { targetField }) || routeNode.branches || [];
      for (const branch of branches) {
        if (targetSet.has(String(branch[targetField] || ""))) branch[targetField] = "";
      }
    }
    if (node.routeNodeType === "action" && node.type !== "decision" && targetSet.has(String(node.nextTargetNodeId || ""))) {
      node.nextTargetNodeId = "";
    }
  }
}
