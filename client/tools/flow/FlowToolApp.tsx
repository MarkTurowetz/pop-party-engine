import type { GameFlow } from "../../types/game-data";
import { findFlowActionRef } from "./flowSelectors";
import { ActionInspector } from "./components/ActionInspector";
import { FlowActionList } from "./components/FlowActionList";
import { FlowRouteNodeList } from "./components/FlowRouteNodeList";
import { FlowStateList } from "./components/FlowStateList";

export interface FlowToolAppProps {
  flow?: GameFlow | null;
  selectedActionId?: string;
  selectedRouteNodeId?: string;
  selectedStateId?: string;
  surface?: string;
}

export function FlowToolApp({ flow = null, selectedActionId = "", selectedRouteNodeId = "", selectedStateId = "", surface = "flow" }: FlowToolAppProps) {
  const selectedState = flow?.states?.find((state) => state.id === selectedStateId) || flow?.states?.[0] || null;
  const selectedActionRef = flow && selectedState
    ? findFlowActionRef(flow, selectedState.id, selectedActionId)
    : null;
  const stateCount = flow?.states?.length || 0;
  const routeNodeCount = flow?.routeNodes?.length || 0;

  return (
    <section
      aria-hidden="true"
      data-flow-react-shell="legacy-bridge"
      data-route-node-count={routeNodeCount}
      data-state-count={stateCount}
      data-surface={surface}
      hidden
    >
      <FlowStateList selectedStateId={selectedState?.id || selectedStateId} states={flow?.states || []} />
      <FlowActionList actions={selectedState?.actions || []} selectedActionId={selectedActionId} />
      <FlowRouteNodeList routeNodes={flow?.routeNodes || []} selectedRouteNodeId={selectedRouteNodeId} />
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
