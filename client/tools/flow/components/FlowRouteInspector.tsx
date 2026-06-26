import type { FlowAction, FlowRouteNode } from "../../../types/game-data";
import { actionTypeName, type FlowActionTypeMeta } from "../flowSelectors";

export interface FlowRouteInspectorProps {
  actionTypes?: FlowActionTypeMeta[];
  branch?: FlowAction | null;
  node: FlowRouteNode | null;
}

function routeNodeTypeName(node: FlowRouteNode, actionTypes: FlowActionTypeMeta[]): string {
  if (node.routeNodeType === "action" && typeof node.type === "string") {
    return actionTypeName(actionTypes, node.type) || node.type;
  }
  if (node.routeNodeType === "decision") return "Decision";
  if (node.routeNodeType === "action") return "Action";
  return "Moment Entry";
}

function routeNodeTarget(node: FlowRouteNode): string {
  return String(node.targetStateId || node.nextTargetNodeId || node.nextTargetActionId || "None");
}

export function FlowRouteInspector({ actionTypes = [], branch = null, node }: FlowRouteInspectorProps) {
  if (!node) return null;
  const branches = (Array.isArray(node.branches) ? node.branches : []) as FlowAction[];
  return (
    <section
      className="flow-react-panel flow-react-inspector"
      data-flow-react-component="route-inspector"
      data-route-branch-id={branch?.id || ""}
      data-route-node-id={node.id || ""}
    >
      <h3>Route</h3>
      <h2>{String(node.name || node.id || "Route Node")}</h2>
      <dl>
        <dt>ID</dt>
        <dd>{String(node.id || "")}</dd>
        <dt>Type</dt>
        <dd>{routeNodeTypeName(node, actionTypes)}</dd>
        <dt>Target</dt>
        <dd>{routeNodeTarget(node)}</dd>
        <dt>Branches</dt>
        <dd>{branches.length}</dd>
        <dt>Selected Branch</dt>
        <dd>{branch?.id || "None"}</dd>
      </dl>
    </section>
  );
}
