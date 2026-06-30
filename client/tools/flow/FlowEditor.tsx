import { useCallback, useEffect, useMemo, useState } from "react";
import type { FlowEditorController } from "./flowEditorController";
import type { FlowActionTypeMeta } from "./flowSelectors";
import { useFlowEditor } from "./useFlowEditor";
import { FlowToolApp, type FlowToolReactShellHandlers } from "./FlowToolApp";
import { FlowNodeCanvas } from "./components/FlowNodeCanvas";
import {
  rootSubroutineGraphConnections,
  rootSubroutineGraphNodes,
  rootSubroutineNodeExits,
  optimizedVerticalNodePositions,
  subroutineGraphConnections,
  subroutineGraphNodes,
  subroutineNodeExits,
  type FlowNodeDepth,
  type FlowNodeExit
} from "./flowNodeGraph";
import { findFlowSubroutine, flowSubroutineActions, flowSubroutineTitle, isFlowSubroutineAction } from "./flowSubroutines";

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

  const [viewMode, setViewMode] = useState<"list" | "node">("node");
  const [nodeDepth, setNodeDepth] = useState<FlowNodeDepth>("subroutines");
  const [subroutinePath, setSubroutinePath] = useState<string[]>([]);

  const hasState = Boolean(selectedStateId);
  const hasActionSelection = Boolean(selectedActionId) || selectedActionIds.size > 0;
  const hasRouteSelection = Boolean(selection.selectedFlowRouteNodeId);
  const selectedState = (flow.states || []).find((state) => state.id === selectedStateId) || null;
  const requestedSubroutineRef = selectedStateId
    ? findFlowSubroutine(flow, selectedStateId, subroutinePath)
    : null;
  const hasValidSubroutinePath = Boolean(requestedSubroutineRef);
  const activeSubroutinePath = useMemo(
    () => (hasValidSubroutinePath ? subroutinePath : []),
    [hasValidSubroutinePath, subroutinePath]
  );
  const currentSubroutine = requestedSubroutineRef?.subroutine || selectedState;
  const currentSubroutineActions = flowSubroutineActions(currentSubroutine);
  const currentSubroutineTitle = flowSubroutineTitle(currentSubroutine);
  const states = flow.states || [];

  const inspectorEdit = {
    onRenameAction: (name: string) => {
      if (selectedStateId && selectedActionId)
        controller.renameAction(selectedStateId, selectedActionId, name);
    },
    onSetActionType: (type: string) => {
      if (selectedStateId && selectedActionId)
        controller.setActionType(selectedStateId, selectedActionId, type);
    },
    actionTypeOptions: flowActionTypes.map((meta) => ({
      id: meta.id,
      label: meta.name || meta.id
    })),
    onSetNextTarget: (targetId: string) => {
      if (selectedStateId) controller.setNextTarget(selectedStateId, targetId);
    },
    onSetEntryTarget: (targetId: string) => {
      if (selectedStateId) controller.setEntryTarget(selectedStateId, targetId, activeSubroutinePath);
    },
    onSetActionField: (key: string, value: unknown) => {
      if (selectedStateId && selectedActionId)
        controller.setActionField(selectedStateId, selectedActionId, key, value);
    },
    onSetActionTiming: (timing: { mode?: string; seconds?: number }) => {
      if (selectedStateId && selectedActionId)
        controller.setActionTiming(selectedStateId, selectedActionId, timing);
    },
    decision: {
      onAddBranch: () => {
        if (selectedStateId && selectedActionId)
          controller.addDecisionBranch(selectedStateId, selectedActionId);
      },
      onRemoveBranch: (branchId: string) => {
        if (selectedStateId && selectedActionId)
          controller.removeDecisionBranch(selectedStateId, selectedActionId, branchId);
      },
      onSetBranchField: (branchId: string, key: string, value: unknown) => {
        if (selectedStateId && selectedActionId)
          controller.setDecisionBranchField(
            selectedStateId,
            selectedActionId,
            branchId,
            key,
            value
          );
      }
    },
    options: {
      onAddOption: () => {
        if (selectedStateId && selectedActionId)
          controller.addActionOption(selectedStateId, selectedActionId);
      },
      onRemoveOption: (index: number) => {
        if (selectedStateId && selectedActionId)
          controller.removeActionOption(selectedStateId, selectedActionId, index);
      },
      onSetOption: (index: number, value: string) => {
        if (selectedStateId && selectedActionId)
          controller.setActionOption(selectedStateId, selectedActionId, index, value);
      }
    },
    nextTargetOptions: states.map((state) => ({ id: state.id, label: state.name || state.id })),
    entryTargetOptions: currentSubroutineActions.map((action) => ({
      id: action.id,
      label: action.name || action.id
    })),
    actionTargetOptions: currentSubroutineActions.map((action) => ({
      id: action.id,
      label: action.name || action.id
    }))
  };

  const deleteSelection = useCallback(() => {
    if (!selectedStateId) return;
    if (selectedActionIds.size) controller.removeActions(selectedStateId, selectedActionIds, activeSubroutinePath);
    else if (selectedActionId) controller.removeActions(selectedStateId, [selectedActionId], activeSubroutinePath);
    else if (selection.selectedFlowRouteNodeId)
      controller.removeRouteNode(selection.selectedFlowRouteNodeId);
    else controller.removeStates([selectedStateId]);
  }, [
    controller,
    selectedStateId,
    selectedActionId,
    selectedActionIds,
    activeSubroutinePath,
    selection.selectedFlowRouteNodeId
  ]);

  // Keyboard shortcuts: Cmd/Ctrl+Z undo, +Shift redo (or Cmd/Ctrl+Y), Delete/Backspace
  // deletes the selection — but never while typing in a field.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName;
      const typing =
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        target?.isContentEditable === true;
      const meta = event.metaKey || event.ctrlKey;
      const key = event.key.toLowerCase();
      if (meta && key === "z") {
        event.preventDefault();
        if (event.shiftKey) controller.redo();
        else controller.undo();
        return;
      }
      if (meta && key === "y") {
        event.preventDefault();
        controller.redo();
        return;
      }
      if (!typing && (event.key === "Delete" || event.key === "Backspace") && selectedStateId) {
        event.preventDefault();
        deleteSelection();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [controller, deleteSelection, selectedStateId]);

  const handlers = useMemo<FlowToolReactShellHandlers>(
    () => ({
      addState: () => {
        if (nodeDepth === "subroutines") controller.addState();
        else if (selectedStateId) controller.addSubroutine(selectedStateId, activeSubroutinePath, selectedActionId);
      },
      addAction: () => {
        if (selectedStateId && nodeDepth === "subroutine")
          controller.addAction(selectedStateId, selectedActionId, activeSubroutinePath);
      },
      deleteSelection,
      redo: () => controller.redo(),
      revert: () => controller.revert(),
      save: () => void controller.save(),
      selectAction: (actionId: string) => controller.selectActions(actionId),
      selectRouteBranch: (routeNodeId: string, branchId: string) =>
        controller.selectRouteBranch(routeNodeId, branchId),
      selectRouteNode: (routeNodeId: string) => controller.selectRouteNode(routeNodeId),
      selectState: (stateId: string) => controller.selectState(stateId),
      setViewMode: (mode: "list" | "node") => setViewMode(mode),
      undo: () => controller.undo()
    }),
    [controller, deleteSelection, nodeDepth, selectedStateId, selectedActionId, activeSubroutinePath]
  );

  const graphSelection = {
    selectedStateId,
    selectedActionId,
    selectedActionIds,
    selectedRouteNodeId: selection.selectedFlowRouteNodeId
  };
  const nodeNodes =
    nodeDepth === "subroutines"
      ? rootSubroutineGraphNodes(flow, graphSelection)
      : subroutineGraphNodes(currentSubroutine, graphSelection);
  const nodeConnections =
    nodeDepth === "subroutines"
      ? rootSubroutineGraphConnections(flow)
      : subroutineGraphConnections(currentSubroutine);
  const nodeExits =
    nodeDepth === "subroutines"
      ? rootSubroutineNodeExits(flow)
      : subroutineNodeExits(
          currentSubroutine,
          (type) => flowActionTypes.find((meta) => meta.id === type)?.category === "input"
        );
  const optimizeNodeLayout = useCallback(() => {
    const positions = optimizedVerticalNodePositions(nodeNodes, nodeConnections, nodeDepth);
    if (positions.length) controller.setNodePositions(nodeDepth, selectedStateId, positions, activeSubroutinePath);
  }, [controller, nodeConnections, nodeDepth, nodeNodes, selectedStateId, activeSubroutinePath]);
  const nodeCanvas =
    viewMode === "node" ? (
      <FlowNodeCanvas
        depth={nodeDepth}
        stateTitle={currentSubroutineTitle}
        nodes={nodeNodes}
        connections={nodeConnections}
        exits={nodeExits}
        onConnect={(exit: FlowNodeExit, targetNodeId: string) => {
          if (exit.kind === "nextSubroutine") controller.setNextTarget(exit.nodeId, targetNodeId);
          else if (exit.kind === "entry") controller.setEntryTarget(selectedStateId, targetNodeId, activeSubroutinePath);
          else if (exit.kind === "field" && exit.field)
            controller.setActionField(selectedStateId, exit.nodeId, exit.field, targetNodeId);
          else if (exit.kind === "branch" && exit.branchId)
            controller.setDecisionBranchField(
              selectedStateId,
              exit.nodeId,
              exit.branchId,
              "targetActionId",
              targetNodeId
            );
        }}
        onSelectNode={(nodeId) => {
          if (nodeDepth === "subroutines") controller.selectState(nodeId);
          else controller.selectActions(nodeId);
        }}
        onEnterSubroutine={(nodeId) => {
          if (nodeDepth === "subroutines") {
            controller.selectState(nodeId);
            setSubroutinePath([]);
            setNodeDepth("subroutine");
            return;
          }
          const target = currentSubroutineActions.find((action) => action.id === nodeId);
          if (target && isFlowSubroutineAction(target)) {
            controller.selectActions([]);
            setSubroutinePath((path) => [...path, nodeId]);
          }
        }}
        onBackToSubroutines={() => {
          if (subroutinePath.length) {
            setSubroutinePath((path) => path.slice(0, -1));
            controller.selectActions([]);
          } else {
            setNodeDepth("subroutines");
          }
        }}
        onMoveNode={(nodeId, x, y) =>
          controller.setNodePosition(nodeDepth, selectedStateId, nodeId, x, y, activeSubroutinePath)
        }
        onCreateConnectedAction={(exit, x, y) => {
          if (nodeDepth === "subroutine")
            controller.addConnectedAction(selectedStateId, exit, { x, y }, activeSubroutinePath);
        }}
        onOptimizeLayout={optimizeNodeLayout}
        onSelectNodes={nodeDepth === "subroutine" ? (ids) => controller.selectActions(ids) : undefined}
      />
    ) : null;

  return (
    <div className="flow-editor-root" data-flow-editor-dirty={dirty ? "true" : "false"}>
      <FlowToolApp
        canAddAction={hasState && nodeDepth === "subroutine"}
        canAddState={true}
        canDelete={hasState || hasActionSelection || hasRouteSelection}
        canRedo={snapshot.canRedo}
        canRevert={dirty}
        canSave={dirty}
        canUndo={snapshot.canUndo}
        flow={flow}
        flowActionTypes={flowActionTypes}
        flowNodeDepth={nodeDepth}
        flowViewMode={viewMode}
        handlers={handlers}
        inspectorEdit={inspectorEdit}
        inspectorSubroutine={currentSubroutine}
        nodeCanvas={nodeCanvas}
        reorder={{
          onReorderState: (draggedId, targetId) => controller.moveState(draggedId, targetId),
          onReorderAction: (draggedId, targetId) => {
            if (selectedStateId) controller.moveAction(selectedStateId, draggedId, targetId, false, activeSubroutinePath);
          },
          onReorderSubAction: (parentId, draggedId, targetId) => {
            if (selectedStateId)
              controller.moveSubAction(selectedStateId, parentId, draggedId, targetId);
          }
        }}
        previewMode={previewMode}
        selectedActionId={selectedActionId}
        selectedRouteBranchId={selection.selectedFlowRouteBranchId}
        selectedRouteNodeId={selection.selectedFlowRouteNodeId}
        selectedStateId={selectedStateId}
        saving={saving}
        surface={surface}
        visible={true}
      />
    </div>
  );
}
