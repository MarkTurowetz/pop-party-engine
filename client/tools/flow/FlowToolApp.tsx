import type { GameFlow } from "../../types/game-data";
import type { FlowActionTypeMeta } from "./flowSelectors";
import { createFlowPreviewModel } from "./flowPreviewModel";
import { ActionInspector, type ActionInspectorEditHandlers } from "./components/ActionInspector";
import { FlowActionList } from "./components/FlowActionList";
import { FlowRouteNodeList } from "./components/FlowRouteNodeList";
import { FlowRouteInspector } from "./components/FlowRouteInspector";
import { FlowStateList } from "./components/FlowStateList";
import { FlowToolbar } from "./components/FlowToolbar";
import type { FlowToolReactShellHandlers } from "./mountFlowToolApp";

export interface FlowToolAppProps {
  canAddAction?: boolean;
  canAddState?: boolean;
  canDelete?: boolean;
  canRevert?: boolean;
  flowActionTypes?: FlowActionTypeMeta[];
  flowNodeDepth?: string;
  flowViewMode?: string;
  flow?: GameFlow | null;
  handlers?: FlowToolReactShellHandlers;
  inspectorEdit?: ActionInspectorEditHandlers;
  selectedActionId?: string;
  selectedRouteBranchId?: string;
  selectedRouteNodeId?: string;
  selectedStateId?: string;
  surface?: string;
  previewMode?: string;
  visible?: boolean;
}

export function FlowToolApp({
  canAddAction = false,
  canAddState = true,
  canDelete = false,
  canRevert = false,
  flowActionTypes = [],
  flow = null,
  flowNodeDepth = "actions",
  flowViewMode = "list",
  handlers = {},
  inspectorEdit,
  selectedActionId = "",
  selectedRouteBranchId = "",
  selectedRouteNodeId = "",
  selectedStateId = "",
  surface = "flow",
  previewMode = "overlay",
  visible = false
}: FlowToolAppProps) {
  const model = createFlowPreviewModel(flow, {
    selectedActionId,
    selectedRouteBranchId,
    selectedRouteNodeId,
    selectedStateId
  });

  return (
    <section
      aria-hidden={visible ? "false" : "true"}
      className="flow-react-shell"
      data-flow-react-shell="legacy-bridge"
      data-preview-mode={previewMode}
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
        canAddState={canAddState}
        canDelete={canDelete}
        canRevert={canRevert}
        flowNodeDepth={flowNodeDepth}
        flowViewMode={flowViewMode}
        onAddAction={handlers.addAction}
        onAddState={handlers.addState}
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
      {model.selectedRouteNode ? (
        <FlowRouteInspector
          actionTypes={flowActionTypes}
          branch={model.selectedRouteBranch}
          node={model.selectedRouteNode}
        />
      ) : (
        <ActionInspector
          action={model.actionRef?.action || null}
          actionTypes={flowActionTypes}
          edit={inspectorEdit}
          isBranch={model.actionRef?.isBranch || false}
          isSubAction={model.actionRef?.isSubAction || false}
          parentAction={model.actionRef?.parentAction || null}
          state={model.actionRef?.state || model.selectedState}
        />
      )}
    </section>
  );
}
