import type {
  FlowGraphConnection,
  FlowGraphNode,
  FlowNodeDepth,
  FlowNodePositionUpdate
} from "./flowNodeGraph";

function isVisualChildNode(node: FlowGraphNode): boolean {
  return node.kind === "branch" || node.kind === "subAction";
}

function layoutChildNodes(nodes: FlowGraphNode[], actionId: string): FlowGraphNode[] {
  return nodes.filter((node) => isVisualChildNode(node) && node.parentNodeId === actionId);
}

function layoutDecisionBranchNodes(nodes: FlowGraphNode[], actionId: string): FlowGraphNode[] {
  return nodes.filter((node) => node.kind === "branch" && node.parentNodeId === actionId);
}

function visualBlockHeight(node: FlowGraphNode, nodes: FlowGraphNode[]): number {
  const childRows = layoutChildNodes(nodes, node.id);
  if (!childRows.length) return node.height;
  const bottom = Math.max(
    node.y + node.height,
    ...childRows.map((child) => child.y + child.height)
  );
  return bottom - node.y;
}

function orderedGraphNodesForLayout(
  nodes: FlowGraphNode[],
  connections: FlowGraphConnection[],
  depth: FlowNodeDepth
): FlowGraphNode[] {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const outgoing = new Map<string, FlowGraphConnection[]>();
  connections.forEach((connection) => {
    if (!byId.has(connection.from) || !byId.has(connection.to)) return;
    const list = outgoing.get(connection.from) || [];
    list.push(connection);
    outgoing.set(connection.from, list);
  });

  const ordered: FlowGraphNode[] = [];
  const visited = new Set<string>();
  const visit = (nodeId: string) => {
    if (visited.has(nodeId)) return;
    const node = byId.get(nodeId);
    if (!node) return;
    visited.add(nodeId);
    ordered.push(node);
    (outgoing.get(nodeId) || []).forEach((connection) => visit(connection.to));
  };

  const startId = depth === "subroutine" && byId.has("start") ? "start" : nodes[0]?.id || "";
  visit(startId);
  nodes.forEach((node) => visit(node.id));
  return ordered;
}

function connectionCreatesBacktrack(
  connection: FlowGraphConnection,
  outgoing: Map<string, FlowGraphConnection[]>,
  orderIndex: Map<string, number>
): boolean {
  const sourceIndex = orderIndex.get(connection.from) ?? -1;
  const targetIndex = orderIndex.get(connection.to) ?? -1;
  if (targetIndex > sourceIndex) return false;
  const visited = new Set<string>();
  const stack = [connection.to];
  while (stack.length) {
    const nodeId = stack.pop() || "";
    if (!nodeId || visited.has(nodeId)) continue;
    if (nodeId === connection.from) return true;
    visited.add(nodeId);
    for (const next of outgoing.get(nodeId) || []) stack.push(next.to);
  }
  return false;
}

function forwardLayoutConnections(
  nodes: FlowGraphNode[],
  connections: FlowGraphConnection[],
  orderedNodes: FlowGraphNode[]
): FlowGraphConnection[] {
  const nodeIds = new Set(nodes.map((node) => node.id));
  const orderIndex = new Map(orderedNodes.map((node, index) => [node.id, index]));
  const outgoing = new Map<string, FlowGraphConnection[]>();
  for (const connection of connections) {
    if (!nodeIds.has(connection.from) || !nodeIds.has(connection.to)) continue;
    const list = outgoing.get(connection.from) || [];
    list.push(connection);
    outgoing.set(connection.from, list);
  }
  return connections.filter((connection) => {
    if (!nodeIds.has(connection.from) || !nodeIds.has(connection.to)) return false;
    return !connectionCreatesBacktrack(connection, outgoing, orderIndex);
  });
}

function layoutLevels(
  nodes: FlowGraphNode[],
  forwardConnections: FlowGraphConnection[],
  orderedNodes: FlowGraphNode[],
  depth: FlowNodeDepth
): Map<string, number> {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const levels = new Map<string, number>();
  const firstNodeId =
    depth === "subroutine" && byId.has("start") ? "start" : orderedNodes[0]?.id || "";
  if (firstNodeId) levels.set(firstNodeId, 0);

  for (let pass = 0; pass < nodes.length; pass += 1) {
    for (const node of orderedNodes) {
      if (!levels.has(node.id)) {
        const hasIncoming = forwardConnections.some((connection) => connection.to === node.id);
        if (!hasIncoming) levels.set(node.id, Math.max(0, ...levels.values()) + 1);
      }
      const sourceLevel = levels.get(node.id);
      if (sourceLevel === undefined) continue;
      for (const connection of forwardConnections) {
        if (connection.from !== node.id) continue;
        const nextLevel = sourceLevel + 1;
        if (nextLevel > (levels.get(connection.to) ?? -1)) levels.set(connection.to, nextLevel);
      }
    }
  }

  for (const node of orderedNodes) {
    if (!levels.has(node.id)) levels.set(node.id, Math.max(0, ...levels.values()) + 1);
  }
  return levels;
}

function layoutOutgoing(connections: FlowGraphConnection[]): Map<string, FlowGraphConnection[]> {
  const outgoing = new Map<string, FlowGraphConnection[]>();
  for (const connection of connections) {
    const list = outgoing.get(connection.from) || [];
    list.push(connection);
    outgoing.set(connection.from, list);
  }
  return outgoing;
}

function layoutIncoming(connections: FlowGraphConnection[]): Map<string, FlowGraphConnection[]> {
  const incoming = new Map<string, FlowGraphConnection[]>();
  for (const connection of connections) {
    const list = incoming.get(connection.to) || [];
    list.push(connection);
    incoming.set(connection.to, list);
  }
  return incoming;
}

function distributeCentersAround(center: number, count: number, gap: number): number[] {
  return Array.from({ length: count }, (_, index) => center + (index - (count - 1) / 2) * gap);
}

interface DecisionBranchPath {
  nodeIds: string[];
  joinNodeId: string;
}

function decisionBranchPaths(
  action: FlowGraphNode,
  nodes: FlowGraphNode[],
  outgoing: Map<string, FlowGraphConnection[]>,
  incoming: Map<string, FlowGraphConnection[]>
): DecisionBranchPath[] {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const paths: DecisionBranchPath[] = [];
  const seenTargets = new Set<string>();

  for (const branch of layoutDecisionBranchNodes(nodes, action.id)) {
    for (const connection of outgoing.get(branch.id) || []) {
      if (seenTargets.has(connection.to)) continue;
      seenTargets.add(connection.to);

      const nodeIds: string[] = [];
      const visited = new Set<string>();
      let currentId = connection.to;
      let joinNodeId = "";
      while (currentId && byId.has(currentId) && !visited.has(currentId)) {
        if ((incoming.get(currentId) || []).length > 1) {
          joinNodeId = currentId;
          break;
        }
        const current = byId.get(currentId);
        if (!current || isVisualChildNode(current)) break;
        visited.add(currentId);
        nodeIds.push(currentId);
        if (current.className.includes("is-decision")) break;

        const nextConnections = (outgoing.get(currentId) || []).filter((candidate) => {
          const target = byId.get(candidate.to);
          return target && !isVisualChildNode(target);
        });
        if (nextConnections.length !== 1) break;
        currentId = nextConnections[0].to;
      }
      paths.push({ nodeIds, joinNodeId });
    }
  }
  return paths;
}

function nodeCenterX(
  node: FlowGraphNode,
  centers: Map<string, number>,
  fallbackCenter: number
): number {
  const center = centers.get(node.id);
  if (Number.isFinite(center)) return Number(center);
  const savedCenter = node.x + node.width / 2;
  return Number.isFinite(savedCenter) ? savedCenter : fallbackCenter;
}

function optimizedHorizontalCenters(
  nodes: FlowGraphNode[],
  forwardConnections: FlowGraphConnection[],
  centerX: number
): Map<string, number> {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const centers = new Map(nodes.map((node) => [node.id, centerX]));
  const outgoing = layoutOutgoing(forwardConnections);
  const incoming = layoutIncoming(forwardConnections);
  const branchGap = Math.max(360, Math.max(...nodes.map((node) => node.width), 260) + 100);
  const decisionJoinCenters = new Map<string, number>();

  for (const node of nodes) {
    if (isVisualChildNode(node) && node.parentNodeId) {
      centers.set(node.id, centers.get(node.parentNodeId) ?? centerX);
    }
  }

  for (const node of nodes) {
    if (node.className.includes("is-decision")) {
      const branchPaths = decisionBranchPaths(node, nodes, outgoing, incoming);
      const visiblePaths = branchPaths.filter((path) => path.nodeIds.length);
      const decisionCenter = centers.get(node.id) ?? centerX;
      const pathCenters =
        visiblePaths.length === 1 && branchPaths.length > 1
          ? [decisionCenter - branchGap]
          : distributeCentersAround(decisionCenter, visiblePaths.length, branchGap);
      visiblePaths.forEach((path, index) => {
        const pathCenter = pathCenters[index] ?? decisionCenter;
        path.nodeIds.forEach((nodeId) => centers.set(nodeId, pathCenter));
      });
      branchPaths.forEach((path) => {
        if (path.joinNodeId) decisionJoinCenters.set(path.joinNodeId, decisionCenter);
      });
    }
  }

  for (const node of nodes) {
    if (node.kind === "branch") continue;
    const decisionJoinCenter = decisionJoinCenters.get(node.id);
    if (decisionJoinCenter !== undefined) {
      centers.set(node.id, decisionJoinCenter);
      continue;
    }
    const sources = (incoming.get(node.id) || [])
      .map((connection) => byId.get(connection.from))
      .filter((source): source is FlowGraphNode => Boolean(source));
    if (sources.length < 2) continue;
    const average =
      sources.reduce((sum, source) => sum + nodeCenterX(source, centers, centerX), 0) /
      sources.length;
    centers.set(node.id, average);
  }

  return centers;
}

function resolveLevelCollisions(
  nodes: FlowGraphNode[],
  centers: Map<string, number>,
  levels: Map<string, number>,
  centerX: number
): void {
  const byLevel = new Map<number, FlowGraphNode[]>();
  for (const node of nodes) {
    if (isVisualChildNode(node)) continue;
    const level = levels.get(node.id) ?? 0;
    const list = byLevel.get(level) || [];
    list.push(node);
    byLevel.set(level, list);
  }

  for (const group of byLevel.values()) {
    if (group.length < 2) continue;
    const sorted = [...group].sort(
      (a, b) => nodeCenterX(a, centers, centerX) - nodeCenterX(b, centers, centerX)
    );
    const hasOverlap = sorted.some((node, index) => {
      const next = sorted[index + 1];
      if (!next) return false;
      const minimumGap = (node.width + next.width) / 2 + 80;
      return nodeCenterX(next, centers, centerX) - nodeCenterX(node, centers, centerX) < minimumGap;
    });
    if (!hasOverlap) continue;
    const average =
      sorted.reduce((sum, node) => sum + nodeCenterX(node, centers, centerX), 0) / sorted.length;
    const gap = Math.max(340, Math.max(...sorted.map((node) => node.width)) + 120);
    distributeCentersAround(average, sorted.length, gap).forEach((value, index) => {
      centers.set(sorted[index].id, value);
    });
  }
}

function optimizedLevelYPositions(
  nodes: FlowGraphNode[],
  levels: Map<string, number>,
  depth: FlowNodeDepth
): Map<number, number> {
  const layoutNodes = nodes.filter((node) => !isVisualChildNode(node));
  const byLevel = new Map<number, FlowGraphNode[]>();
  for (const node of layoutNodes) {
    const level = levels.get(node.id) ?? 0;
    const list = byLevel.get(level) || [];
    list.push(node);
    byLevel.set(level, list);
  }

  const levelGap = depth === "subroutines" ? 90 : 70;
  const yByLevel = new Map<number, number>();
  let nextY = 70;
  for (const level of [...byLevel.keys()].sort((a, b) => a - b)) {
    const group = byLevel.get(level) || [];
    yByLevel.set(level, nextY);
    const maxHeight = Math.max(...group.map((node) => visualBlockHeight(node, nodes)), 0);
    nextY += maxHeight + levelGap;
  }
  return yByLevel;
}

export function optimizedVerticalNodePositions(
  nodes: FlowGraphNode[],
  connections: FlowGraphConnection[],
  depth: FlowNodeDepth
): FlowNodePositionUpdate[] {
  if (!nodes.length) return [];
  const orderedNodes = orderedGraphNodesForLayout(nodes, connections, depth);
  const forwardConnections = forwardLayoutConnections(nodes, connections, orderedNodes);
  const levels = layoutLevels(nodes, forwardConnections, orderedNodes, depth);
  const centerX = Math.max(
    depth === "subroutines" ? 420 : 470,
    Math.round(nodes.reduce((sum, node) => sum + node.x + node.width / 2, 0) / nodes.length)
  );
  const centers = optimizedHorizontalCenters(orderedNodes, forwardConnections, centerX);
  resolveLevelCollisions(orderedNodes, centers, levels, centerX);
  const levelY = optimizedLevelYPositions(orderedNodes, levels, depth);
  return orderedNodes
    .filter((node) => !isVisualChildNode(node))
    .map((node) => ({
      nodeId: node.id,
      x: Math.max(0, Math.round(nodeCenterX(node, centers, centerX) - node.width / 2)),
      y: levelY.get(levels.get(node.id) ?? 0) ?? 70
    }));
}
