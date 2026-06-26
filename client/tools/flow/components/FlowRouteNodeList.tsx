import type { FlowRouteNode } from "../../../types/game-data";

export interface FlowRouteNodeListProps {
  onSelectRouteNode?: (routeNodeId: string) => void;
  routeNodes: FlowRouteNode[];
  selectedRouteNodeId?: string;
}

function routeNodeLabel(node: FlowRouteNode): string {
  return String(node.name || node.id || "Route Node");
}

function routeNodeType(node: FlowRouteNode): string {
  return String(node.routeNodeType || "momentEntry");
}

export function FlowRouteNodeList({ onSelectRouteNode, routeNodes, selectedRouteNodeId = "" }: FlowRouteNodeListProps) {
  return (
    <ol data-flow-react-component="route-node-list">
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
          </li>
        );
      })}
    </ol>
  );
}
