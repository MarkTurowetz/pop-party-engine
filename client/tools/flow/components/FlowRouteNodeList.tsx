import type { FlowAction, FlowRouteNode } from "../../../types/game-data";

export interface FlowRouteNodeListProps {
  onSelectRouteBranch?: (routeNodeId: string, branchId: string) => void;
  onSelectRouteNode?: (routeNodeId: string) => void;
  routeNodes: FlowRouteNode[];
  selectedRouteBranchId?: string;
  selectedRouteNodeId?: string;
}

function routeNodeLabel(node: FlowRouteNode): string {
  return String(node.name || node.id || "Route Node");
}

function routeNodeType(node: FlowRouteNode): string {
  return String(node.routeNodeType || "momentEntry");
}

function routeNodeBranches(node: FlowRouteNode): FlowAction[] {
  return Array.isArray(node.branches) ? node.branches as FlowAction[] : [];
}

function routeBranchLabel(branch: FlowAction, index: number): string {
  if (branch.type === "noMatch") return "No Match";
  if (branch.type === "code") return branch.code ? `Code: ${branch.code}` : `Code ${index + 1}`;
  return branch.value ? `Hit: ${branch.value}` : `Branch ${index + 1}`;
}

export function FlowRouteNodeList({
  onSelectRouteBranch,
  onSelectRouteNode,
  routeNodes,
  selectedRouteBranchId = "",
  selectedRouteNodeId = ""
}: FlowRouteNodeListProps) {
  return (
    <section className="flow-react-panel">
      <h3>Routes</h3>
      <ol className="flow-react-list" data-flow-react-component="route-node-list">
      {routeNodes.map((node, index) => {
        const id = String(node.id || `route-node-${index}`);
        return (
          <li
            aria-current={id === selectedRouteNodeId ? "true" : undefined}
            data-route-node-id={id}
            data-route-node-type={routeNodeType(node)}
            key={id}
          >
            <button type="button" onClick={() => onSelectRouteNode?.(id)}>
              {routeNodeLabel(node)}
            </button>
            {routeNodeBranches(node).length ? (
              <ol className="flow-react-list flow-react-sub-list">
                {routeNodeBranches(node).map((branch, branchIndex) => (
                  <li
                    aria-current={id === selectedRouteNodeId && branch.id === selectedRouteBranchId ? "true" : undefined}
                    data-route-branch-id={branch.id}
                    data-route-branch-type={branch.type}
                    key={branch.id}
                  >
                    <button type="button" onClick={() => onSelectRouteBranch?.(id, branch.id)}>
                      {routeBranchLabel(branch, branchIndex)}
                    </button>
                  </li>
                ))}
              </ol>
            ) : null}
          </li>
        );
      })}
      </ol>
    </section>
  );
}
