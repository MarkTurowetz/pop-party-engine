import {
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode
} from "react";
import type { FlowAction, GameFlow } from "../../types/game-data";
import { ToolSaveError } from "../common/ToolSaveError";
import { ToolWorkspace } from "../common/ToolWorkspace";
import type { FlowActionTypeMeta } from "./flowSelectors";
import { createFlowPreviewModel } from "./flowPreviewModel";
import { ActionInspector, type ActionInspectorEditHandlers } from "./components/ActionInspector";
import { FlowStateList } from "./components/FlowStateList";
import { FlowToolbar } from "./components/FlowToolbar";
import {
  clampFlowInspectorWidth,
  flowInspectorResizeStep,
  readStoredFlowInspectorWidth,
  storeFlowInspectorWidth
} from "./flowInspectorResize";
import type { FlowSubroutine } from "./flowSubroutines";

export interface FlowToolReactShellHandlers {
  addAction?: () => void;
  addState?: () => void;
  deleteSelection?: () => void;
  enterState?: (stateId: string) => void;
  redo?: () => void;
  revert?: () => void;
  save?: () => void;
  selectState?: (stateId: string) => void;
  undo?: () => void;
}

export interface FlowReorderHandlers {
  onReorderState?: (draggedStateId: string, targetStateId: string) => void;
}

export interface FlowToolAppProps {
  canAddAction?: boolean;
  canAddState?: boolean;
  canDelete?: boolean;
  canRedo?: boolean;
  canRevert?: boolean;
  canSave?: boolean;
  canUndo?: boolean;
  error?: string | null;
  flowActionTypes?: FlowActionTypeMeta[];
  flowNodeDepth?: string;
  flow?: GameFlow | null;
  handlers?: FlowToolReactShellHandlers;
  inspectorEdit?: ActionInspectorEditHandlers;
  inspectorActionOverride?: {
    action: FlowAction | null;
    edit?: ActionInspectorEditHandlers;
    isBranch?: boolean;
    isSubAction?: boolean;
    parentAction?: FlowAction | null;
    state: FlowSubroutine | null;
  } | null;
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
  error = null,
  flowActionTypes = [],
  flow = null,
  flowNodeDepth = "subroutine",
  handlers = {},
  inspectorEdit,
  inspectorActionOverride = null,
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
  const workspaceContentRef = useRef<HTMLDivElement>(null);
  const [inspectorWidth, setInspectorWidth] = useState(() => readStoredFlowInspectorWidth(
    typeof window === "undefined" ? null : window.localStorage
  ));
  const model = createFlowPreviewModel(flow, {
    selectedActionId,
    selectedRouteBranchId,
    selectedRouteNodeId,
    selectedStateId
  });
  const activeSubroutine = inspectorSubroutine || model.selectedState;

  function setAndStoreInspectorWidth(width: number) {
    const nextWidth = clampFlowInspectorWidth(
      width,
      workspaceContentRef.current?.clientWidth
    );
    setInspectorWidth(nextWidth);
    storeFlowInspectorWidth(
      nextWidth,
      typeof window === "undefined" ? null : window.localStorage
    );
  }

  function beginInspectorResize(event: ReactPointerEvent<HTMLButtonElement>) {
    if (event.button !== 0) return;
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = inspectorWidth;
    const workspaceWidth = workspaceContentRef.current?.clientWidth;
    document.body.classList.add("is-resizing-flow");

    const onPointerMove = (moveEvent: PointerEvent) => {
      setInspectorWidth(clampFlowInspectorWidth(
        startWidth + startX - moveEvent.clientX,
        workspaceWidth
      ));
    };
    const finish = (finishEvent: PointerEvent) => {
      const nextWidth = clampFlowInspectorWidth(
        startWidth + startX - finishEvent.clientX,
        workspaceWidth
      );
      setInspectorWidth(nextWidth);
      storeFlowInspectorWidth(nextWidth, window.localStorage);
      document.body.classList.remove("is-resizing-flow");
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
  }

  function resizeInspectorWithKeyboard(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    setAndStoreInspectorWidth(
      inspectorWidth + (event.key === "ArrowLeft" ? flowInspectorResizeStep : -flowInspectorResizeStep)
    );
  }

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
      saving={saving}
      onAddAction={handlers.addAction}
      onAddState={handlers.addState}
      onDeleteSelection={handlers.deleteSelection}
      onRedo={handlers.redo}
      onRevert={handlers.revert}
      onSave={handlers.save}
      onUndo={handlers.undo}
    />
  );

  const inspector = inspectorActionOverride ? (
    <ActionInspector
      action={inspectorActionOverride.action}
      actionTypes={flowActionTypes}
      edit={inspectorActionOverride.edit}
      isBranch={inspectorActionOverride.isBranch || false}
      isSubAction={inspectorActionOverride.isSubAction || false}
      parentAction={inspectorActionOverride.parentAction || null}
      state={inspectorActionOverride.state}
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
          <ToolSaveError error={error} source="flow" />
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
          onEnterState={handlers.enterState}
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
      history={{
        id: "flow",
        canUndo,
        canRedo,
        onUndo: handlers.undo,
        onRedo: handlers.redo
      }}
    >
      <div
        ref={workspaceContentRef}
        className="flow-node-workspace-content"
        style={{ "--flow-inspector-width": `${inspectorWidth}px` } as CSSProperties}
      >
        {nodeCanvas}
        <button
          type="button"
          className="tool-panel-resizer flow-inspector-resizer"
          data-flow-react-component="inspector-resizer"
          aria-label="Resize action inspector"
          onKeyDown={resizeInspectorWithKeyboard}
          onPointerDown={beginInspectorResize}
        />
        {inspector}
      </div>
    </ToolWorkspace>
  );
}
