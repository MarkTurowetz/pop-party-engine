import { useCallback, useEffect, useMemo, useState } from "react";
import type { FlowEditorController } from "./flowEditorController";
import { findFlowActionRef, type FlowActionTypeMeta } from "./flowSelectors";
import { useFlowEditor } from "./useFlowEditor";
import { FlowToolApp, type FlowToolReactShellHandlers } from "./FlowToolApp";
import { FlowNodeCanvas } from "./components/FlowNodeCanvas";
import {
  optimizedVerticalNodePositions,
  subroutineGraphConnections,
  subroutineGraphNodes,
  subroutineNodeExits,
  type FlowNodeDepth,
  type FlowNodeExit
} from "./flowNodeGraph";
import { parseDecisionBranchGraphNodeId } from "./flowDecisionBranchIdentity";
import {
  findFlowSubroutine,
  flowSubroutineActions,
  flowSubroutineTitle,
  isFlowSubroutineAction
} from "./flowSubroutines";
import {
  rootFlowActionById,
  rootFlowGraphConnections,
  rootFlowGraphNodes,
  rootFlowNodeExits,
  rootFlowNodeSource,
  rootFlowSubroutine,
  rootFlowTargetOptions
} from "./flowRootGraph";

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
  const selectedDecisionBranchRef = parseDecisionBranchGraphNodeId(selectedActionId);
  const selectedDecisionActionId = selectedDecisionBranchRef?.actionId || selectedActionId;

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
  const rootInspectorSubroutine = useMemo(() => rootFlowSubroutine(flow), [flow]);
  const selectedRootRouteAction = selection.selectedFlowRouteNodeId
    ? rootFlowActionById(flow, selection.selectedFlowRouteNodeId)
    : null;
  const selectedRootRouteBranch =
    selectedRootRouteAction && selection.selectedFlowRouteBranchId
      ? (selectedRootRouteAction.branches || []).find(
          (branch) => branch.id === selection.selectedFlowRouteBranchId
        ) || null
      : null;
  const selectedActionRef =
    selectedStateId && selectedActionId
      ? findFlowActionRef(flow, selectedStateId, selectedActionId)
      : null;
  const rootActionTypeOptions = flowActionTypes.map((meta) => ({
    id: meta.id,
    label: meta.name || meta.id
  }));
  const rootTargetOptions = rootFlowTargetOptions(
    flow,
    selection.selectedFlowRouteNodeId || selectedStateId
  );

  const inspectorEdit = {
    onAddSubAction: () => {
      if (!selectedStateId || !selectedActionRef || selectedActionRef.isBranch) return;
      const parentActionId =
        selectedActionRef.isSubAction && selectedActionRef.parentAction
          ? selectedActionRef.parentAction.id
          : selectedActionRef.action.id;
      const selectedSubActionId = selectedActionRef.isSubAction ? selectedActionRef.action.id : "";
      controller.addSubAction(selectedStateId, parentActionId, selectedSubActionId);
    },
    onRenameAction: (name: string) => {
      if (selectedStateId && selectedActionId)
        controller.renameAction(selectedStateId, selectedActionId, name);
    },
    onRefreshActionName: () => {
      if (selectedStateId && selectedActionId)
        controller.refreshActionName(selectedStateId, selectedActionId);
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
      if (selectedStateId)
        controller.setEntryTarget(selectedStateId, targetId, activeSubroutinePath);
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
        if (selectedStateId && selectedDecisionActionId)
          controller.addDecisionBranch(selectedStateId, selectedDecisionActionId);
      },
      onRemoveBranch: (branchId: string) => {
        if (selectedStateId && selectedDecisionActionId)
          controller.removeDecisionBranch(selectedStateId, selectedDecisionActionId, branchId);
      },
      onSetBranchField: (branchId: string, key: string, value: unknown) => {
        if (selectedStateId && selectedDecisionActionId)
          controller.setDecisionBranchField(
            selectedStateId,
            selectedDecisionActionId,
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
    nextTargetOptions:
      nodeDepth === "subroutines"
        ? rootFlowTargetOptions(flow, selectedStateId)
        : states.map((state) => ({ id: state.id, label: state.name || state.id })),
    entryTargetOptions: currentSubroutineActions.map((action) => ({
      id: action.id,
      label: action.name || action.id
    })),
    actionTargetOptions:
      nodeDepth === "subroutines"
        ? rootTargetOptions
        : currentSubroutineActions.map((action) => ({
            id: action.id,
            label: action.name || action.id
          }))
  };

  const rootRouteInspectorEdit = selectedRootRouteAction
    ? {
        onRenameAction: (name: string) => {
          controller.renameRouteAction(selectedRootRouteAction.id, name);
        },
        onRefreshActionName: () => {
          controller.refreshRouteActionName(selectedRootRouteAction.id);
        },
        onSetActionType: (type: string) => {
          controller.setRouteActionType(selectedRootRouteAction.id, type);
        },
        actionTypeOptions: rootActionTypeOptions,
        onSetActionField: (key: string, value: unknown) => {
          controller.setRouteActionField(selectedRootRouteAction.id, key, value);
        },
        onSetActionTiming: (timing: { mode?: string; seconds?: number }) => {
          controller.setRouteActionTiming(selectedRootRouteAction.id, timing);
        },
        decision: {
          onAddBranch: () => {
            controller.addRouteDecisionBranch(selectedRootRouteAction.id);
          },
          onRemoveBranch: (branchId: string) => {
            controller.removeRouteBranch(selectedRootRouteAction.id, branchId, {
              targetField: "targetNodeId"
            });
          },
          onSetBranchField: (branchId: string, key: string, value: unknown) => {
            controller.setRouteDecisionBranchField(
              selectedRootRouteAction.id,
              branchId,
              key,
              value
            );
          }
        },
        actionTargetOptions: rootTargetOptions,
        nextTargetOptions: rootTargetOptions,
        entryTargetOptions: []
      }
    : undefined;

  const deleteSelection = useCallback(() => {
    if (selection.selectedFlowRouteNodeId && selection.selectedFlowRouteBranchId) {
      controller.removeRouteBranch(
        selection.selectedFlowRouteNodeId,
        selection.selectedFlowRouteBranchId,
        {
          targetField: "targetNodeId"
        }
      );
      return;
    }
    if (selection.selectedFlowRouteNodeId) {
      controller.removeRouteNode(selection.selectedFlowRouteNodeId);
      return;
    }
    if (!selectedStateId) return;
    const selectedIds = selectedActionIds.size
      ? [...selectedActionIds]
      : selectedActionId
        ? [selectedActionId]
        : [];
    const branchRefs = selectedIds.flatMap((id) => {
      const branchRef = parseDecisionBranchGraphNodeId(id);
      return branchRef ? [branchRef] : [];
    });
    const actionIds = selectedIds.filter((id) => !parseDecisionBranchGraphNodeId(id));
    for (const branchRef of branchRefs) {
      controller.removeDecisionBranch(selectedStateId, branchRef.actionId, branchRef.branchId);
    }
    if (actionIds.length) {
      controller.removeActions(selectedStateId, actionIds, activeSubroutinePath);
    } else if (!branchRefs.length) {
      controller.removeStates([selectedStateId]);
    }
  }, [
    controller,
    selectedStateId,
    selectedActionId,
    selectedActionIds,
    activeSubroutinePath,
    selection.selectedFlowRouteNodeId,
    selection.selectedFlowRouteBranchId
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
      if (
        !typing &&
        (event.key === "Delete" || event.key === "Backspace") &&
        (selectedStateId || selection.selectedFlowRouteNodeId)
      ) {
        event.preventDefault();
        deleteSelection();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [controller, deleteSelection, selectedStateId, selection.selectedFlowRouteNodeId]);

  const handlers = useMemo<FlowToolReactShellHandlers>(
    () => ({
      addState: () => {
        if (nodeDepth === "subroutines") controller.addState();
        else if (selectedStateId)
          controller.addSubroutine(selectedStateId, activeSubroutinePath, selectedActionId);
      },
      addAction: () => {
        if (nodeDepth === "subroutines") controller.addRootAction();
        else if (selectedStateId)
          controller.addAction(selectedStateId, selectedActionId, activeSubroutinePath);
      },
      deleteSelection,
      enterState: (stateId: string) => {
        controller.selectState(stateId);
        setSubroutinePath([]);
        setNodeDepth("subroutine");
      },
      redo: () => controller.redo(),
      revert: () => controller.revert(),
      save: () => void controller.save(),
      selectState: (stateId: string) => controller.selectState(stateId),
      undo: () => controller.undo()
    }),
    [
      controller,
      deleteSelection,
      nodeDepth,
      selectedStateId,
      selectedActionId,
      activeSubroutinePath
    ]
  );

  const graphSelection = {
    selectedStateId,
    selectedActionId,
    selectedActionIds,
    selectedRouteNodeId: selection.selectedFlowRouteNodeId,
    selectedRouteBranchId: selection.selectedFlowRouteBranchId
  };
  const nodeNodes =
    nodeDepth === "subroutines"
      ? rootFlowGraphNodes(flow, graphSelection)
      : subroutineGraphNodes(currentSubroutine, graphSelection);
  const nodeConnections =
    nodeDepth === "subroutines"
      ? rootFlowGraphConnections(flow)
      : subroutineGraphConnections(
          currentSubroutine,
          (type) => flowActionTypes.find((meta) => meta.id === type)?.category === "input"
        );
  const nodeExits =
    nodeDepth === "subroutines"
      ? rootFlowNodeExits(flow)
      : subroutineNodeExits(
          currentSubroutine,
          (type) => flowActionTypes.find((meta) => meta.id === type)?.category === "input"
        );
  const optimizeNodeLayout = useCallback(() => {
    const positions = optimizedVerticalNodePositions(nodeNodes, nodeConnections, nodeDepth);
    if (positions.length)
      controller.setNodePositions(nodeDepth, selectedStateId, positions, activeSubroutinePath);
  }, [controller, nodeConnections, nodeDepth, nodeNodes, selectedStateId, activeSubroutinePath]);
  const nodeCanvas = (
    <FlowNodeCanvas
      depth={nodeDepth}
      stateTitle={nodeDepth === "subroutines" ? "Root Flow" : currentSubroutineTitle}
      nodes={nodeNodes}
      connections={nodeConnections}
      exits={nodeExits}
      onConnect={(exit: FlowNodeExit, targetNodeId: string) => {
        if (nodeDepth === "subroutines") controller.connectRootAction(exit, targetNodeId);
        else if (exit.kind === "entry")
          controller.setEntryTarget(selectedStateId, targetNodeId, activeSubroutinePath);
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
        const node = nodeNodes.find((candidate) => candidate.id === nodeId);
        if (node?.kind === "branch" && node.parentNodeId && node.branchId) {
          if (nodeDepth === "subroutines")
            controller.selectRouteBranch(node.parentNodeId, node.branchId);
          else controller.selectActions(node.id);
          return;
        }
        if (nodeDepth === "subroutines") {
          const source = rootFlowNodeSource(flow, nodeId);
          if (source === "state") controller.selectState(nodeId);
          else if (source === "routeNode") controller.selectRouteNode(nodeId);
        } else controller.selectActions(nodeId);
      }}
      onEnterSubroutine={(nodeId) => {
        if (nodeDepth === "subroutines") {
          if (rootFlowNodeSource(flow, nodeId) === "state") {
            controller.selectState(nodeId);
            setSubroutinePath([]);
            setNodeDepth("subroutine");
          }
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
        if (nodeDepth === "subroutines") controller.addConnectedRootAction(exit, { x, y });
        else if (nodeDepth === "subroutine")
          controller.addConnectedAction(selectedStateId, exit, { x, y }, activeSubroutinePath);
      }}
      onOptimizeLayout={optimizeNodeLayout}
      onSelectNodes={
        nodeDepth === "subroutine" ? (ids) => controller.selectActions(ids) : undefined
      }
    />
  );

  return (
    <div className="flow-editor-root" data-flow-editor-dirty={dirty ? "true" : "false"}>
      <FlowToolApp
        canAddAction={nodeDepth === "subroutines" || (hasState && nodeDepth === "subroutine")}
        canAddState={true}
        canDelete={hasState || hasActionSelection || hasRouteSelection}
        canRedo={snapshot.canRedo}
        canRevert={dirty}
        canSave={dirty}
        canUndo={snapshot.canUndo}
        flow={flow}
        flowActionTypes={flowActionTypes}
        flowNodeDepth={nodeDepth}
        handlers={handlers}
        inspectorActionOverride={
          selectedRootRouteBranch && selectedRootRouteAction
            ? {
                action: selectedRootRouteBranch,
                edit: rootRouteInspectorEdit,
                isBranch: true,
                parentAction: selectedRootRouteAction,
                state: rootInspectorSubroutine
              }
            : selectedRootRouteAction
              ? {
                  action: selectedRootRouteAction,
                  edit: rootRouteInspectorEdit,
                  state: rootInspectorSubroutine
                }
              : null
        }
        inspectorEdit={inspectorEdit}
        inspectorSubroutine={currentSubroutine}
        nodeCanvas={nodeCanvas}
        reorder={{
          onReorderState: (draggedId, targetId) => controller.moveState(draggedId, targetId)
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
