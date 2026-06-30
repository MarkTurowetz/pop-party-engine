export interface DecisionBranchGraphNodeRef {
  actionId: string;
  branchId: string;
}

const DECISION_BRANCH_GRAPH_NODE_DELIMITER = ":branch:";

export function decisionBranchGraphNodeId(actionId: string, branchId: string): string {
  return `${actionId}${DECISION_BRANCH_GRAPH_NODE_DELIMITER}${branchId}`;
}

export function parseDecisionBranchGraphNodeId(
  nodeId: string | null | undefined
): DecisionBranchGraphNodeRef | null {
  const value = String(nodeId || "");
  const delimiterIndex = value.indexOf(DECISION_BRANCH_GRAPH_NODE_DELIMITER);
  if (delimiterIndex < 0) return null;
  const actionId = value.slice(0, delimiterIndex);
  const branchId = value.slice(delimiterIndex + DECISION_BRANCH_GRAPH_NODE_DELIMITER.length);
  return actionId && branchId ? { actionId, branchId } : null;
}
