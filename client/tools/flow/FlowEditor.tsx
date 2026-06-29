import { useMemo, useState } from "react";
import type { FlowEditorController } from "./flowEditorController";
import type { FlowActionTypeMeta } from "./flowSelectors";
import type { FlowToolReactShellHandlers } from "./mountFlowToolApp";
import { useFlowEditor } from "./useFlowEditor";
import { FlowToolApp } from "./FlowToolApp";
import { FlowNodeCanvas } from "./components/FlowNodeCanvas";
import {
  actionGraphConnections,
  actionGraphNodes,
  actionNodeExits,
  momentGraphConnections,
  momentGraphNodes,
  momentNodeExits,
  type FlowNodeDepth,
  type FlowNodeExit
} from "./flowNodeGraph";

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

  const [viewMode, setViewMode] = useState<"list" | "node">("list");
  const [nodeDepth, setNodeDepth] = useState<FlowNodeDepth>("moments");

  const hasState = Boolean(selectedStateId);
  const hasActionSelection = Boolean(selectedActionId) || selectedActionIds.size > 0;
  const hasRouteSelection = Boolean(selection.selectedFlowRouteNodeId);

  const inspectorEdit = useMemo(() => {
    const states = flow.states || [];
    const selectedState = states.find((state) => state.id === selectedStateId);
    return {
      onRenameAction: (name: string) => {
        if (selectedStateId && selectedActionId) controller.renameAction(selectedStateId, selectedActionId, name);
      },
      onSetActionType: (type: string) => {
        if (selectedStateId && selectedActionId) controller.setActionType(selectedStateId, selectedActionId, type);
      },
      actionTypeOptions: flowActionTypes.map((meta) => ({ id: meta.id, label: meta.name || meta.id })),
      onSetNextTarget: (targetId: string) => {
        if (selectedStateId) controller.setNextTarget(selectedStateId, targetId);
      },
      onSetEntryTarget: (targetId: string) => {
        if (selectedStateId) controller.setEntryTarget(selectedStateId, targetId);
      },
      onSetActionField: (key: string, value: unknown) => {
        if (selectedStateId && selectedActionId) controller.setActionField(selectedStateId, selectedActionId, key, value);
      },
      onSetActionTiming: (timing: { mode?: string; seconds?: number }) => {
        if (selectedStateId && selectedActionId) controller.setActionTiming(selectedStateId, selectedActionId, timing);
      },
      decision: {
        onAddBranch: () => {
          if (selectedStateId && selectedActionId) controller.addDecisionBranch(selectedStateId, selectedActionId);
        },
        onRemoveBranch: (branchId: string) => {
          if (selectedStateId && selectedActionId) controller.removeDecisionBranch(selectedStateId, selectedActionId, branchId);
        },
        onSetBranchField: (branchId: string, key: string, value: unknown) => {
          if (selectedStateId && selectedActionId)
            controller.setDecisionBranchField(selectedStateId, selectedActionId, branchId, key, value);
        }
      },
      options: {
        onAddOption: () => {
          if (selectedStateId && selectedActionId) controller.addActionOption(selectedStateId, selectedActionId);
        },
        onRemoveOption: (index: number) => {
          if (selectedStateId && selectedActionId) controller.removeActionOption(selectedStateId, selectedActionId, index);
        },
        onSetOption: (index: number, value: string) => {
          if (selectedStateId && selectedActionId) controller.setActionOption(selectedStateId, selectedActionId, index, value);
        }
      },
      nextTargetOptions: states.map((state) => ({ id: state.id, label: state.name || state.id })),
      entryTargetOptions: (selectedState?.actions || []).map((action) => ({
        id: action.id,
        label: action.name || action.id
      })),
      actionTargetOptions: (selectedState?.actions || []).map((action) => ({
        id: action.id,
        label: action.name || action.id
      }))
    };
  }, [controller, selectedStateId, selectedActionId, flow, flowActionTypes]);

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
      setViewMode: (mode: "list" | "node") => setViewMode(mode)
    }),
    [controller, selectedStateId, selectedActionId, selectedActionIds, selection.selectedFlowRouteNodeId]
  );

  const selectedState = (flow.states || []).find((state) => state.id === selectedStateId) || null;
  const graphSelection = {
    selectedStateId,
    selectedActionId,
    selectedActionIds,
    selectedRouteNodeId: selection.selectedFlowRouteNodeId
  };
  const nodeCanvas =
    viewMode === "node" ? (
      <FlowNodeCanvas
        depth={nodeDepth}
        stateTitle={selectedState?.name || selectedState?.id}
        nodes={
          nodeDepth === "moments"
            ? momentGraphNodes(flow, graphSelection)
            : actionGraphNodes(selectedState, graphSelection)
        }
        connections={
          nodeDepth === "moments" ? momentGraphConnections(flow) : actionGraphConnections(selectedState)
        }
        exits={
          nodeDepth === "moments"
            ? momentNodeExits(flow)
            : actionNodeExits(
                selectedState,
                (type) => flowActionTypes.find((meta) => meta.id === type)?.category === "input"
              )
        }
        onConnect={(exit: FlowNodeExit, targetNodeId: string) => {
          if (exit.kind === "nextState") controller.setNextTarget(exit.nodeId, targetNodeId);
          else if (exit.kind === "entry") controller.setEntryTarget(selectedStateId, targetNodeId);
          else if (exit.kind === "field" && exit.field)
            controller.setActionField(selectedStateId, exit.nodeId, exit.field, targetNodeId);
          else if (exit.kind === "branch" && exit.branchId)
            controller.setDecisionBranchField(selectedStateId, exit.nodeId, exit.branchId, "targetActionId", targetNodeId);
        }}
        onSelectNode={(nodeId) => {
          if (nodeDepth === "moments") controller.selectState(nodeId);
          else controller.selectActions(nodeId);
        }}
        onEnterState={(stateId) => {
          controller.selectState(stateId);
          setNodeDepth("actions");
        }}
        onBackToMoments={() => setNodeDepth("moments")}
        onMoveNode={(nodeId, x, y) => controller.setNodePosition(nodeDepth, selectedStateId, nodeId, x, y)}
      />
    ) : null;

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
        flowViewMode={viewMode}
        handlers={handlers}
        inspectorEdit={inspectorEdit}
        nodeCanvas={nodeCanvas}
        reorder={{
          onReorderState: (draggedId, targetId) => controller.moveState(draggedId, targetId),
          onReorderAction: (draggedId, targetId) => {
            if (selectedStateId) controller.moveAction(selectedStateId, draggedId, targetId);
          },
          onReorderSubAction: (parentId, draggedId, targetId) => {
            if (selectedStateId) controller.moveSubAction(selectedStateId, parentId, draggedId, targetId);
          }
        }}
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
