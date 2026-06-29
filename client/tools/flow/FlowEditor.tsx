import { useMemo } from "react";
import type { FlowEditorController } from "./flowEditorController";
import type { FlowActionTypeMeta } from "./flowSelectors";
import type { FlowToolReactShellHandlers } from "./mountFlowToolApp";
import { useFlowEditor } from "./useFlowEditor";
import { FlowToolApp } from "./FlowToolApp";

export interface FlowEditorProps {
  controller: FlowEditorController;
  flowActionTypes?: FlowActionTypeMeta[];
  surface?: string;
  previewMode?: string;
}

/**
 * Writable, React-only Flow editor.
 *
 * Owns nothing itself — it mirrors a {@link FlowEditorController} snapshot into
 * the existing presentational components and routes every interaction back into
 * the controller (which runs the typed command history + save path via direct
 * module imports, no `window.PartyGame*` adapters).
 */
export function FlowEditor({
  controller,
  flowActionTypes = [],
  surface = "flow",
  previewMode = "replace"
}: FlowEditorProps) {
  const { snapshot, dirty, saving } = useFlowEditor(controller);
  const flow = snapshot.flow;
  const selection = snapshot.selection;
  const selectedStateId = selection.selectedFlowStateId;
  const selectedActionId = selection.selectedFlowActionId;
  const selectedActionIds = selection.selectedFlowActionIds;

  const hasState = Boolean(selectedStateId);
  const hasActionSelection = Boolean(selectedActionId) || selectedActionIds.size > 0;
  const hasRouteSelection = Boolean(selection.selectedFlowRouteNodeId);

  const handlers = useMemo<FlowToolReactShellHandlers>(
    () => ({
      addState: () => controller.addState(),
      addAction: () => {
        if (selectedStateId) controller.addAction(selectedStateId, selectedActionId);
      },
      deleteSelection: () => {
        if (!selectedStateId) return;
        if (selectedActionIds.size) controller.removeActions(selectedStateId, selectedActionIds);
        else if (selectedActionId) controller.removeActions(selectedStateId, [selectedActionId]);
        else if (selection.selectedFlowRouteNodeId) controller.removeRouteNode(selection.selectedFlowRouteNodeId);
        else controller.removeStates([selectedStateId]);
      },
      revert: () => controller.revert(),
      selectAction: (actionId: string) => controller.selectActions(actionId),
      selectRouteBranch: (routeNodeId: string, branchId: string) =>
        controller.selectRouteBranch(routeNodeId, branchId),
      selectRouteNode: (routeNodeId: string) => controller.selectRouteNode(routeNodeId),
      selectState: (stateId: string) => controller.selectState(stateId),
      setViewMode: () => {
        /* node view is wired in a later step */
      }
    }),
    [controller, selectedStateId, selectedActionId, selectedActionIds, selection.selectedFlowRouteNodeId]
  );

  return (
    <div className="flow-editor-root" data-flow-editor-dirty={dirty ? "true" : "false"}>
      <div className="flow-editor-controls" data-flow-react-component="editor-controls">
        <button type="button" disabled={!snapshot.canUndo} onClick={() => controller.undo()}>
          Undo
        </button>
        <button type="button" disabled={!snapshot.canRedo} onClick={() => controller.redo()}>
          Redo
        </button>
        <button type="button" disabled={!dirty || saving} onClick={() => void controller.save()}>
          {saving ? "Saving…" : "Save"}
        </button>
        <span data-flow-editor-status>{dirty ? "Unsaved changes" : "Saved"}</span>
      </div>
      <FlowToolApp
        canAddAction={hasState}
        canAddState={true}
        canDelete={hasState || hasActionSelection || hasRouteSelection}
        canRevert={dirty}
        flow={flow}
        flowActionTypes={flowActionTypes}
        handlers={handlers}
        previewMode={previewMode}
        selectedActionId={selectedActionId}
        selectedRouteBranchId={selection.selectedFlowRouteBranchId}
        selectedRouteNodeId={selection.selectedFlowRouteNodeId}
        selectedStateId={selectedStateId}
        surface={surface}
        visible={true}
      />
    </div>
  );
}
