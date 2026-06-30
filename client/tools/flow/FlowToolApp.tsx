import type { ReactNode } from "react";
import type { GameFlow } from "../../types/game-data";
import { ToolWorkspace } from "../common/ToolWorkspace";
import type { FlowActionTypeMeta } from "./flowSelectors";
import { createFlowPreviewModel } from "./flowPreviewModel";
import { ActionInspector, type ActionInspectorEditHandlers } from "./components/ActionInspector";
import { FlowActionList } from "./components/FlowActionList";
import { FlowRouteNodeList } from "./components/FlowRouteNodeList";
import { FlowRouteInspector } from "./components/FlowRouteInspector";
import { FlowStateList } from "./components/FlowStateList";
import { FlowToolbar } from "./components/FlowToolbar";
import type { FlowSubroutine } from "./flowSubroutines";

export interface FlowToolReactShellHandlers {
  addAction?: () => void;
  addState?: () => void;
  deleteSelection?: () => void;
  redo?: () => void;
  revert?: () => void;
  save?: () => void;
  selectAction?: (actionId: string) => void;
  selectRouteBranch?: (routeNodeId: string, branchId: string) => void;
  selectRouteNode?: (routeNodeId: string) => void;
  selectState?: (stateId: string) => void;
  setViewMode?: (mode: "list" | "node") => void;
  undo?: () => void;
}

export interface FlowReorderHandlers {
  onReorderState?: (draggedStateId: string, targetStateId: string) => void;
  onReorderAction?: (draggedActionId: string, targetActionId: string) => void;
  onReorderSubAction?: (
    parentActionId: string,
    draggedActionId: string,
    targetActionId: string
  ) => void;
}

export interface FlowToolAppProps {
  canAddAction?: boolean;
  canAddState?: boolean;
  canDelete?: boolean;
  canRedo?: boolean;
  canRevert?: boolean;
  canSave?: boolean;
  canUndo?: boolean;
  flowActionTypes?: FlowActionTypeMeta[];
  flowNodeDepth?: string;
  flowViewMode?: string;
  flow?: GameFlow | null;
  handlers?: FlowToolReactShellHandlers;
  inspectorEdit?: ActionInspectorEditHandlers;
  inspectorSubroutine?: FlowSubroutine | null;
  nodeCanvas?: ReactNode;
  reorder?: FlowReorderHandlers;
  selectedActionId?: string;
  selectedRouteBranchId?: string;
  selectedRouteNodeId?: string;
  selectedStateId?: string;
  surface?: string;
  previewMode?: string;
  saving?: boolean;
  visible?: boolean;
}

export function FlowToolApp({
  canAddAction = false,
  canAddState = true,
  canDelete = false,
  canRedo = false,
  canRevert = false,
  canSave = false,
  canUndo = false,
  flowActionTypes = [],
  flow = null,
  flowNodeDepth = "subroutine",
  flowViewMode = "list",
  handlers = {},
  inspectorEdit,
  inspectorSubroutine = null,
  nodeCanvas,
  reorder,
  selectedActionId = "",
  selectedRouteBranchId = "",
  selectedRouteNodeId = "",
  selectedStateId = "",
  surface = "flow",
  previewMode = "overlay",
  saving = false,
  visible = false
}: FlowToolAppProps) {
  const model = createFlowPreviewModel(flow, {
    selectedActionId,
    selectedRouteBranchId,
    selectedRouteNodeId,
    selectedStateId
  });
  const activeSubroutine = inspectorSubroutine || model.selectedState;

  const toolbar = (
    <FlowToolbar
      canAddAction={canAddAction}
      canAddState={canAddState}
      canDelete={canDelete}
      canRedo={canRedo}
      canRevert={canRevert}
      canSave={canSave}
      canUndo={canUndo}
      flowNodeDepth={flowNodeDepth}
      flowViewMode={flowViewMode}
      saving={saving}
      onAddAction={handlers.addAction}
      onAddState={handlers.addState}
      onDeleteSelection={handlers.deleteSelection}
      onRedo={handlers.redo}
      onRevert={handlers.revert}
      onSave={handlers.save}
      onSetViewMode={handlers.setViewMode}
      onUndo={handlers.undo}
    />
  );

  const inspector = model.selectedRouteNode ? (
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
      state={model.actionRef?.state || inspectorSubroutine || model.selectedState}
    />
  );

  return (
    <ToolWorkspace
      className="flow-react-shell"
      hidden={!visible}
      dataAttributes={{
        "flow-react-shell": "legacy-bridge",
        "preview-mode": previewMode,
        "route-node-count": model.routeNodeCount,
        "state-count": model.stateCount,
        surface: surface
      }}
      header={
        <>
          <h2>{activeSubroutine?.name || activeSubroutine?.id || "Game Flow"}</h2>
          <dl className="tool-workspace-stats">
            <div>
              <dt>Subroutines</dt>
              <dd>{model.stateCount}</dd>
            </div>
            <div>
              <dt>Routes</dt>
              <dd>{model.routeNodeCount}</dd>
            </div>
          </dl>
        </>
      }
      sidebar={
        <FlowStateList
          chrome={false}
          onSelectState={handlers.selectState}
          onReorderState={reorder?.onReorderState}
          selectedStateId={model.selectedStateId}
          states={flow?.states || []}
        />
      }
      sidebarLabel="Flow subroutines"
      storageKey="partyTemplate.flowSidebarWidth"
      title="Game Flow"
      toolbar={toolbar}
      toolId="flow"
    >
      {flowViewMode === "node" && nodeCanvas ? (
        <div className="flow-node-workspace-content">
          {nodeCanvas}
          {inspector}
        </div>
      ) : (
        <div className="tool-main-columns flow-workspace-content">
          <FlowActionList
            actions={activeSubroutine?.actions || []}
            actionTypes={flowActionTypes}
            onSelectAction={handlers.selectAction}
            onReorderAction={reorder?.onReorderAction}
            onReorderSubAction={reorder?.onReorderSubAction}
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
          {inspector}
        </div>
      )}
    </ToolWorkspace>
  );
}
