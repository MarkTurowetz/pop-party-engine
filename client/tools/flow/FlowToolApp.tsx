import type { GameFlow } from "../../types/game-data";
import type { FlowActionTypeMeta } from "./flowSelectors";
import { createFlowPreviewModel } from "./flowPreviewModel";
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
  flowActionTypes?: FlowActionTypeMeta[];
  flowNodeDepth?: string;
  flowViewMode?: string;
  flow?: GameFlow | null;
  handlers?: FlowToolReactShellHandlers;
  selectedActionId?: string;
  selectedRouteBranchId?: string;
  selectedRouteNodeId?: string;
  selectedStateId?: string;
  surface?: string;
  visible?: boolean;
}

export function FlowToolApp({
  canAddAction = false,
  canDelete = false,
  canRevert = false,
  flowActionTypes = [],
  flow = null,
  flowNodeDepth = "actions",
  flowViewMode = "list",
  handlers = {},
  selectedActionId = "",
  selectedRouteBranchId = "",
  selectedRouteNodeId = "",
  selectedStateId = "",
  surface = "flow",
  visible = false
}: FlowToolAppProps) {
  const model = createFlowPreviewModel(flow, { selectedActionId, selectedStateId });

  return (
    <section
      aria-hidden={visible ? "false" : "true"}
      className="flow-react-shell"
      data-flow-react-shell="legacy-bridge"
      data-route-node-count={model.routeNodeCount}
      data-state-count={model.stateCount}
      data-surface={surface}
      hidden={!visible}
    >
      <header className="flow-react-header">
        <div>
          <p>React Preview</p>
          <h2>{model.selectedState?.name || model.selectedState?.id || "Game Flow"}</h2>
        </div>
        <dl>
          <div>
            <dt>States</dt>
            <dd>{model.stateCount}</dd>
          </div>
          <div>
            <dt>Routes</dt>
            <dd>{model.routeNodeCount}</dd>
          </div>
        </dl>
      </header>
      <FlowToolbar
        canAddAction={canAddAction}
        canDelete={canDelete}
        canRevert={canRevert}
        flowNodeDepth={flowNodeDepth}
        flowViewMode={flowViewMode}
        onAddAction={handlers.addAction}
        onDeleteSelection={handlers.deleteSelection}
        onRevert={handlers.revert}
        onSetViewMode={handlers.setViewMode}
      />
      <FlowStateList
        onSelectState={handlers.selectState}
        selectedStateId={model.selectedStateId}
        states={flow?.states || []}
      />
      <FlowActionList
        actions={model.selectedState?.actions || []}
        actionTypes={flowActionTypes}
        onSelectAction={handlers.selectAction}
        selectedActionId={model.selectedActionId}
      />
      <FlowRouteNodeList
        actionTypes={flowActionTypes}
        onSelectRouteBranch={handlers.selectRouteBranch}
        onSelectRouteNode={handlers.selectRouteNode}
        routeNodes={flow?.routeNodes || []}
        selectedRouteBranchId={selectedRouteBranchId}
        selectedRouteNodeId={selectedRouteNodeId}
      />
      <ActionInspector
        action={model.actionRef?.action || null}
        actionTypes={flowActionTypes}
        isBranch={model.actionRef?.isBranch || false}
        isSubAction={model.actionRef?.isSubAction || false}
        parentAction={model.actionRef?.parentAction || null}
        state={model.actionRef?.state || model.selectedState}
      />
    </section>
  );
}
