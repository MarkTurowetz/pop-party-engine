import type { GameFlow } from "../../types/game-data";
import { findFlowActionRef } from "./flowSelectors";
import { ActionInspector } from "./components/ActionInspector";
import { FlowActionList } from "./components/FlowActionList";
import { FlowRouteNodeList } from "./components/FlowRouteNodeList";
import { FlowStateList } from "./components/FlowStateList";
import { FlowToolbar } from "./components/FlowToolbar";
import type { FlowToolReactShellHandlers } from "./mountFlowToolApp";

export interface FlowToolAppProps {
  canAddAction?: boolean;
  canDelete?: boolean;
  canRevert?: boolean;
  flowNodeDepth?: string;
  flowViewMode?: string;
  flow?: GameFlow | null;
  handlers?: FlowToolReactShellHandlers;
  selectedActionId?: string;
  selectedRouteNodeId?: string;
  selectedStateId?: string;
  surface?: string;
  visible?: boolean;
}

export function FlowToolApp({
  canAddAction = false,
  canDelete = false,
  canRevert = false,
  flow = null,
  flowNodeDepth = "actions",
  flowViewMode = "list",
  handlers = {},
  selectedActionId = "",
  selectedRouteNodeId = "",
  selectedStateId = "",
  surface = "flow",
  visible = false
}: FlowToolAppProps) {
  const selectedState = flow?.states?.find((state) => state.id === selectedStateId) || flow?.states?.[0] || null;
  const selectedActionRef = flow && selectedState
    ? findFlowActionRef(flow, selectedState.id, selectedActionId)
    : null;
  const stateCount = flow?.states?.length || 0;
  const routeNodeCount = flow?.routeNodes?.length || 0;

  return (
    <section
      aria-hidden={visible ? "false" : "true"}
      className="flow-react-shell"
      data-flow-react-shell="legacy-bridge"
      data-route-node-count={routeNodeCount}
      data-state-count={stateCount}
      data-surface={surface}
      hidden={!visible}
    >
      <FlowToolbar
        canAddAction={canAddAction}
        canDelete={canDelete}
        canRevert={canRevert}
        flowNodeDepth={flowNodeDepth}
        flowViewMode={flowViewMode}
      />
      <FlowStateList
        onSelectState={handlers.selectState}
        selectedStateId={selectedState?.id || selectedStateId}
        states={flow?.states || []}
      />
      <FlowActionList
        actions={selectedState?.actions || []}
        onSelectAction={handlers.selectAction}
        selectedActionId={selectedActionId}
      />
      <FlowRouteNodeList
        onSelectRouteNode={handlers.selectRouteNode}
        routeNodes={flow?.routeNodes || []}
        selectedRouteNodeId={selectedRouteNodeId}
      />
      <ActionInspector
        action={selectedActionRef?.action || null}
        isBranch={selectedActionRef?.isBranch || false}
        isSubAction={selectedActionRef?.isSubAction || false}
        parentAction={selectedActionRef?.parentAction || null}
        state={selectedActionRef?.state || selectedState}
      />
    </section>
  );
}
