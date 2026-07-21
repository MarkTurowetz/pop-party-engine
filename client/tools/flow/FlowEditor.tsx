import { useCallback, useEffect, useMemo, useState } from "react";
import type { FlowEditorController } from "./flowEditorController";
import {
  findFlowActionRef,
  flowGameObjectAnimationLabelOptions,
  flowGameObjectComponentTargetOptions,
  flowGameObjectTargetOptions,
  flowTextTargetOptions,
  type FlowActionTypeMeta
} from "./flowSelectors";
import { useFlowEditor } from "./useFlowEditor";
import { FlowToolApp, type FlowToolReactShellHandlers } from "./FlowToolApp";
import { FlowNodeCanvas } from "./components/FlowNodeCanvas";
import type { ArtComposition, StageLayoutCollection } from "../../types/game-data";
import {
  optimizedVerticalNodePositions,
  subroutineGraphConnections,
  subroutineGraphNodes,
  subroutineNodeExits,
  translatedSelectedNodePositions,
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

const GAME_OBJECT_TIMELINE_ACTION_TYPES = new Set([
  "playGameObjectAnimation",
  "stopGameObjectAnimation"
]);
const LAYOUT_TARGET_ACTION_TYPES = new Set([
  "displayText",
  "presentText",
  "text",
  "setGameObjectShown",
  "setArtAssetShown",
  ...GAME_OBJECT_TIMELINE_ACTION_TYPES
]);

export interface FlowEditorProps {
  controller: FlowEditorController;
  flowActionTypes?: FlowActionTypeMeta[];
  artCompositions?: ArtComposition[];
  stageLayouts?: StageLayoutCollection | null;
  loadArtCompositions?: () => Promise<ArtComposition[]>;
  loadStageLayouts?: () => Promise<StageLayoutCollection | null>;
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
  artCompositions = [],
  stageLayouts = null,
  loadArtCompositions,
  loadStageLayouts,
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
  const [layoutSnapshot, setLayoutSnapshot] = useState<StageLayoutCollection | null>(stageLayouts);
  const [artCompositionSnapshot, setArtCompositionSnapshot] =
    useState<ArtComposition[]>(artCompositions);

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
  const selectedActionType = selectedActionRef?.action?.type || selectedRootRouteAction?.type || "";
  const rootActionTypeOptions = flowActionTypes.map((meta) => ({
    id: meta.id,
    label: meta.name || meta.id
  }));
  const rootTargetOptions = rootFlowTargetOptions(
    flow,
    selection.selectedFlowRouteNodeId || selectedStateId
  );

  useEffect(() => {
    if (!loadStageLayouts || !LAYOUT_TARGET_ACTION_TYPES.has(selectedActionType)) return undefined;
    let cancelled = false;
    void loadStageLayouts().then((layouts) => {
      if (!cancelled) setLayoutSnapshot(layouts);
    });
    return () => {
      cancelled = true;
    };
  }, [loadStageLayouts, selectedActionId, selectedActionType, selectedRootRouteAction?.id]);

  useEffect(() => {
    if (!loadArtCompositions || !GAME_OBJECT_TIMELINE_ACTION_TYPES.has(selectedActionType))
      return undefined;
    let cancelled = false;
    void loadArtCompositions().then((compositions) => {
      if (!cancelled) setArtCompositionSnapshot(compositions);
    });
    return () => {
      cancelled = true;
    };
  }, [loadArtCompositions, selectedActionId, selectedActionType, selectedRootRouteAction?.id]);

  const textTargetOptionsForState = (stateId: string, selectedTextTarget = "") => {
    const state = states.find((candidate) => candidate.id === stateId) || null;
    return flowTextTargetOptions(layoutSnapshot, state, stateId, selectedTextTarget).map(
      (option) => ({
        id: option.id,
        label: option.name
      })
    );
  };
  const gameObjectTargetOptionsForState = (stateId: string, selectedTarget = "") => {
    const state = states.find((candidate) => candidate.id === stateId) || null;
    return flowGameObjectTargetOptions(layoutSnapshot, state, stateId, selectedTarget).map(
      (option) => ({
        id: option.id,
        label: option.name
      })
    );
  };
  const animationLabelOptionsForState = (
    stateId: string,
    selectedTarget = "",
    selectedComponent = "",
    selectedAnimation = ""
  ) => {
    const state = states.find((candidate) => candidate.id === stateId) || null;
    return flowGameObjectAnimationLabelOptions(
      layoutSnapshot,
      artCompositionSnapshot,
      state,
      stateId,
      selectedTarget,
      selectedComponent,
      selectedAnimation
    ).map((option) => ({
      id: option.id,
      label: option.name
    }));
  };
  const componentTargetOptionsForState = (
    stateId: string,
    selectedTarget = "",
    selectedComponent = ""
  ) => {
    const state = states.find((candidate) => candidate.id === stateId) || null;
    return flowGameObjectComponentTargetOptions(
      layoutSnapshot,
      artCompositionSnapshot,
      state,
      stateId,
      selectedTarget,
      selectedComponent
    ).map((option) => ({
      id: option.id,
      label: option.name
    }));
  };
  const inspectorTextTargetOptions = textTargetOptionsForState(
    selectedStateId,
    String(selectedActionRef?.action?.textTarget || "")
  );
  const inspectorGameObjectTargetOptions = gameObjectTargetOptionsForState(
    selectedStateId,
    `${String(selectedActionRef?.action?.targetLayoutScope || "moment")}:${String(selectedActionRef?.action?.targetLayoutElementId || "")}`
  );
  const inspectorAnimationLabelOptions = animationLabelOptionsForState(
    selectedStateId,
    `${String(selectedActionRef?.action?.targetLayoutScope || "moment")}:${String(selectedActionRef?.action?.targetLayoutElementId || "")}`,
    String(selectedActionRef?.action?.targetComponentId || ""),
    String(selectedActionRef?.action?.animationName || "")
  );
  const inspectorComponentTargetOptions = componentTargetOptionsForState(
    selectedStateId,
    `${String(selectedActionRef?.action?.targetLayoutScope || "moment")}:${String(selectedActionRef?.action?.targetLayoutElementId || "")}`,
    String(selectedActionRef?.action?.targetComponentId || "")
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
    onSetActionFields: (patch: Record<string, unknown>) => {
      if (selectedStateId && selectedActionId)
        controller.setActionFields(selectedStateId, selectedActionId, patch);
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
          })),
    animationLabelOptions: inspectorAnimationLabelOptions,
    componentTargetOptions: inspectorComponentTargetOptions,
    gameObjectTargetOptions: inspectorGameObjectTargetOptions,
    stateTargetOptions: states.map((state) => ({ id: state.id, label: state.name || state.id })),
    textTargetOptions: inspectorTextTargetOptions
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
        onSetActionFields: (patch: Record<string, unknown>) => {
          controller.setRouteActionFields(selectedRootRouteAction.id, patch);
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
        gameObjectTargetOptions: gameObjectTargetOptionsForState(
          String(selectedRootRouteAction.targetStateId || selectedStateId || ""),
          `${String(selectedRootRouteAction.targetLayoutScope || "moment")}:${String(selectedRootRouteAction.targetLayoutElementId || "")}`
        ),
        stateTargetOptions: states.map((state) => ({
          id: state.id,
          label: state.name || state.id
        })),
        animationLabelOptions: animationLabelOptionsForState(
          String(selectedRootRouteAction.targetStateId || selectedStateId || ""),
          `${String(selectedRootRouteAction.targetLayoutScope || "moment")}:${String(selectedRootRouteAction.targetLayoutElementId || "")}`,
          String(selectedRootRouteAction.targetComponentId || ""),
          String(selectedRootRouteAction.animationName || "")
        ),
        componentTargetOptions: componentTargetOptionsForState(
          String(selectedRootRouteAction.targetStateId || selectedStateId || ""),
          `${String(selectedRootRouteAction.targetLayoutScope || "moment")}:${String(selectedRootRouteAction.targetLayoutElementId || "")}`,
          String(selectedRootRouteAction.targetComponentId || "")
        ),
        textTargetOptions: textTargetOptionsForState(
          String(selectedRootRouteAction.targetStateId || selectedStateId || ""),
          String(selectedRootRouteAction.textTarget || "")
        ),
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
    if (nodeDepth === "subroutines") {
      const selectedRootIds = selectedActionIds.size
        ? [...selectedActionIds]
        : [selection.selectedFlowRouteNodeId || selectedStateId].filter(Boolean);
      if (selectedRootIds.length) controller.removeRootNodes(selectedRootIds);
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
    nodeDepth,
    selection.selectedFlowRouteNodeId,
    selection.selectedFlowRouteBranchId
  ]);

  // Delete/Backspace deletes the selection — but never while typing in a field.
  // Undo/redo shortcuts live in the shared ToolWorkspace so every tool uses the
  // same keyboard history contract.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName;
      const typing =
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        target?.isContentEditable === true;
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
      onSelectNode={(nodeId, additive) => {
        const node = nodeNodes.find((candidate) => candidate.id === nodeId);
        if (node?.kind === "branch" && node.parentNodeId && node.branchId) {
          if (nodeDepth === "subroutines")
            controller.selectRouteBranch(node.parentNodeId, node.branchId);
          else controller.selectActions(node.id);
          return;
        }
        if (nodeDepth === "subroutines") {
          const source = rootFlowNodeSource(flow, nodeId);
          if (source) {
            const nextIds = additive ? new Set(selectedActionIds) : new Set<string>();
            if (additive && nextIds.has(nodeId)) nextIds.delete(nodeId);
            else nextIds.add(nodeId);
            controller.selectRootNodes(nextIds);
          }
        } else {
          const nextIds = additive ? new Set(selectedActionIds) : new Set<string>();
          if (additive && nextIds.has(nodeId)) nextIds.delete(nodeId);
          else nextIds.add(nodeId);
          controller.selectActions(nextIds);
        }
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
      onMoveNode={(nodeId, x, y) => {
        const selectedPositionUpdates = translatedSelectedNodePositions(
          nodeNodes,
          nodeId,
          x,
          y
        );
        if (selectedPositionUpdates.length > 1) {
          controller.setNodePositions(
            nodeDepth,
            selectedStateId,
            selectedPositionUpdates,
            activeSubroutinePath
          );
          return;
        }
        controller.setNodePosition(
          nodeDepth,
          selectedStateId,
          nodeId,
          x,
          y,
          activeSubroutinePath
        );
      }}
      onCreateConnectedAction={(exit, x, y) => {
        if (nodeDepth === "subroutines") controller.addConnectedRootAction(exit, { x, y });
        else if (nodeDepth === "subroutine")
          controller.addConnectedAction(selectedStateId, exit, { x, y }, activeSubroutinePath);
      }}
      onOptimizeLayout={optimizeNodeLayout}
      onSelectNodes={(ids) => {
        if (nodeDepth === "subroutines") controller.selectRootNodes(ids);
        else controller.selectActions(ids);
      }}
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
