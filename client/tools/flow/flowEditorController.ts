import type { GameFlow } from "../../types/game-data";
import type { FlowApi } from "../../api/flowApi";
import {
  addActionOptionCommand,
  addDecisionBranchCommand,
  addFlowActionCommand,
  addFlowStateCommand,
  addFlowSubActionCommand,
  removeActionOptionCommand,
  removeDecisionBranchCommand,
  setActionOptionCommand,
  setDecisionBranchFieldCommand,
  moveFlowActionCommand,
  renameFlowActionCommand,
  moveFlowStateCommand,
  moveFlowSubActionCommand,
  removeFlowActionsCommand,
  removeFlowRouteBranchCommand,
  removeFlowRouteNodeCommand,
  removeFlowStatesCommand,
  renameFlowStateCommand,
  setFlowActionFieldCommand,
  setFlowActionTimingCommand,
  setFlowActionTypeCommand,
  setFlowNodePositionCommand,
  type FlowActionTimingPatch,
  setFlowStateEntryTargetCommand,
  setFlowStateNextTargetCommand,
  setFlowStateVotingSourceCommand
} from "./flowCommands";
import { createFlowStore, type FlowStore, type FlowStoreSnapshot } from "./flowStore";
import { createActionDefaults } from "./flowActionDefaults";
import { ensureActionTiming } from "./flowActions";
import { ensureDecisionBranches } from "./flowDecision";
import { makeFlowId, type FlowActionTypeMeta } from "./flowSelectors";
import { serializeGameFlowForSave } from "./flowSerialization";
import { flattenedFlowActionIds, type RemoveFlowRouteBranchOptions } from "./flowMutations";

/** All selectable action ids across the flow (primary, sub-actions, decision branches). */
function allFlowActionIds(flow: GameFlow): string[] {
  const ids: string[] = [];
  for (const state of flow.states || []) flattenedFlowActionIds(state.actions || [], {}, ids);
  return ids;
}

/**
 * Framework-agnostic controller that owns a writable Flow editing session.
 *
 * It wraps the typed {@link createFlowStore} (undo/redo command history) and the
 * {@link FlowApi} persistence surface, and tracks dirty state the exact same way
 * the legacy `flow-tool.js` does — by comparing `serializeGameFlowForSave(flow)`
 * against the last saved snapshot — so saved JSON stays byte-compatible.
 *
 * React consumes this through a thin `useSyncExternalStore` hook; the controller
 * itself has no React dependency and is unit-testable headlessly.
 */
export interface FlowEditorState {
  snapshot: FlowStoreSnapshot;
  dirty: boolean;
  saving: boolean;
  hasLocalDraft: boolean;
  error: string | null;
}

export interface FlowEditorControllerOptions {
  initialFlow: GameFlow;
  api: FlowApi;
  hasLocalDraft?: boolean;
  /** Action type metadata (id/name/category) used to apply type-change defaults + timing. */
  actionTypes?: FlowActionTypeMeta[];
  /** Protected state ids whose ids are not regenerated on rename. */
  protectedStateIds?: Iterable<string>;
}

export interface FlowEditorController {
  getState(): FlowEditorState;
  subscribe(listener: () => void): () => void;

  // Selection
  selectState(stateId: string): void;
  selectActions(ids: Iterable<string> | string | null | undefined): void;
  selectRouteNode(routeNodeId: string): void;
  selectRouteBranch(routeNodeId: string, branchId: string): void;
  clearActionSelection(): void;
  clearRouteSelection(): void;

  // State edits
  addState(): void;
  renameState(stateId: string, name: string): void;
  moveState(draggedStateId: string, targetStateId: string, placeAfter?: boolean): void;
  removeStates(stateIds: Iterable<string>): void;
  setNextTarget(stateId: string, targetId: string): void;
  setEntryTarget(stateId: string, targetId: string): void;
  setVotingSource(stateId: string, sourceStateId: string): void;

  // Action edits
  addAction(stateId: string, selectedPrimaryActionId?: string): void;
  addSubAction(stateId: string, parentActionId: string, selectedSubActionId?: string): void;
  renameAction(stateId: string, actionId: string, name: string): void;
  setActionType(stateId: string, actionId: string, type: string): void;
  setActionField(stateId: string, actionId: string, key: string, value: unknown): void;
  setActionTiming(stateId: string, actionId: string, timing: FlowActionTimingPatch): void;
  addDecisionBranch(stateId: string, actionId: string): void;
  removeDecisionBranch(stateId: string, actionId: string, branchId: string): void;
  setDecisionBranchField(stateId: string, actionId: string, branchId: string, key: string, value: unknown): void;
  addActionOption(stateId: string, actionId: string): void;
  removeActionOption(stateId: string, actionId: string, index: number): void;
  setActionOption(stateId: string, actionId: string, index: number, value: string): void;
  setNodePosition(depth: "moments" | "actions", stateId: string, nodeId: string, x: number, y: number): void;
  moveAction(stateId: string, draggedActionId: string, targetActionId: string, placeAfter?: boolean): void;
  moveSubAction(
    stateId: string,
    parentActionId: string,
    draggedActionId: string,
    targetActionId: string,
    placeAfter?: boolean
  ): void;
  removeActions(stateId: string, selectedIds: Iterable<string>): void;

  // Route edits
  removeRouteBranch(nodeId: string, branchId: string, options?: RemoveFlowRouteBranchOptions): void;
  removeRouteNode(nodeId: string): void;

  // History
  undo(): void;
  redo(): void;

  // Persistence
  replaceFlow(flow: GameFlow, options?: { markSaved?: boolean }): void;
  revert(): void;
  save(): Promise<GameFlow | null>;
  publishDraft(): Promise<void>;
}

function savedSnapshotOf(flow: GameFlow): string {
  return JSON.stringify(serializeGameFlowForSave(flow));
}

export function createFlowEditorController(options: FlowEditorControllerOptions): FlowEditorController {
  const { api } = options;
  const protectedStateIds = options.protectedStateIds;
  const actionTypes = options.actionTypes || [];
  const actionTypeMeta = (type: string): Pick<FlowActionTypeMeta, "category"> =>
    actionTypes.find((meta) => meta.id === type) || { category: "standard" };
  const actionDefaults = createActionDefaults({
    ensureActionTiming: (action, isSubAction) => ensureActionTiming(action, isSubAction, { actionTypeMeta }),
    ensureDecisionBranches: (action) => ensureDecisionBranches(action)
  });
  const store: FlowStore = createFlowStore(options.initialFlow, {
    selection: { selectedFlowStateId: options.initialFlow.states?.[0]?.id || "" }
  });

  const listeners = new Set<() => void>();
  let savedSnapshot = savedSnapshotOf(store.snapshot().flow);
  let state: FlowEditorState = deriveState(store.snapshot(), {
    saving: false,
    hasLocalDraft: Boolean(options.hasLocalDraft),
    error: null
  });

  function deriveState(
    snapshot: FlowStoreSnapshot,
    extra: { saving: boolean; hasLocalDraft: boolean; error: string | null }
  ): FlowEditorState {
    return {
      snapshot,
      dirty: savedSnapshotOf(snapshot.flow) !== savedSnapshot,
      saving: extra.saving,
      hasLocalDraft: extra.hasLocalDraft,
      error: extra.error
    };
  }

  function commit(snapshot: FlowStoreSnapshot = store.snapshot()): void {
    state = deriveState(snapshot, {
      saving: state.saving,
      hasLocalDraft: state.hasLocalDraft,
      error: state.error
    });
    listeners.forEach((listener) => listener());
  }

  function patch(extra: Partial<{ saving: boolean; hasLocalDraft: boolean; error: string | null }>): void {
    state = {
      ...state,
      ...extra
    };
    listeners.forEach((listener) => listener());
  }

  return {
    getState: () => state,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    selectState: (stateId) => commit(store.selectMoments(stateId)),
    selectActions: (ids) => commit(store.selectActions(ids, allFlowActionIds(store.snapshot().flow))),
    selectRouteNode: (routeNodeId) => commit(store.selectRouteNode(routeNodeId)),
    selectRouteBranch: (routeNodeId, branchId) => commit(store.selectRouteBranch(routeNodeId, branchId)),
    clearActionSelection: () => commit(store.clearActionSelection()),
    clearRouteSelection: () => commit(store.clearRouteSelection()),

    addState: () => commit(store.execute(addFlowStateCommand())),
    renameState: (stateId, name) =>
      commit(store.execute(renameFlowStateCommand(stateId, name, { makeFlowId, protectedStateIds }))),
    moveState: (draggedStateId, targetStateId, placeAfter = false) =>
      commit(store.execute(moveFlowStateCommand(draggedStateId, targetStateId, placeAfter))),
    removeStates: (stateIds) => commit(store.execute(removeFlowStatesCommand(stateIds))),
    setNextTarget: (stateId, targetId) => commit(store.execute(setFlowStateNextTargetCommand(stateId, targetId))),
    setEntryTarget: (stateId, targetId) => commit(store.execute(setFlowStateEntryTargetCommand(stateId, targetId))),
    setVotingSource: (stateId, sourceStateId) =>
      commit(store.execute(setFlowStateVotingSourceCommand(stateId, sourceStateId))),

    addAction: (stateId, selectedPrimaryActionId = "") =>
      commit(store.execute(addFlowActionCommand(stateId, selectedPrimaryActionId))),
    addSubAction: (stateId, parentActionId, selectedSubActionId = "") =>
      commit(store.execute(addFlowSubActionCommand(stateId, parentActionId, selectedSubActionId))),
    renameAction: (stateId, actionId, name) =>
      commit(store.execute(renameFlowActionCommand(stateId, actionId, name))),
    setActionType: (stateId, actionId, type) =>
      commit(
        store.execute(
          setFlowActionTypeCommand(stateId, actionId, type, (action, nextType, isSubAction) =>
            actionDefaults.applyActionTypeDefaults(action, nextType, isSubAction)
          )
        )
      ),
    setActionField: (stateId, actionId, key, value) =>
      commit(store.execute(setFlowActionFieldCommand(stateId, actionId, key, value))),
    setActionTiming: (stateId, actionId, timing) =>
      commit(store.execute(setFlowActionTimingCommand(stateId, actionId, timing))),
    addDecisionBranch: (stateId, actionId) =>
      commit(store.execute(addDecisionBranchCommand(stateId, actionId))),
    removeDecisionBranch: (stateId, actionId, branchId) =>
      commit(store.execute(removeDecisionBranchCommand(stateId, actionId, branchId))),
    setDecisionBranchField: (stateId, actionId, branchId, key, value) =>
      commit(store.execute(setDecisionBranchFieldCommand(stateId, actionId, branchId, key, value))),
    addActionOption: (stateId, actionId) =>
      commit(store.execute(addActionOptionCommand(stateId, actionId))),
    removeActionOption: (stateId, actionId, index) =>
      commit(store.execute(removeActionOptionCommand(stateId, actionId, index))),
    setActionOption: (stateId, actionId, index, value) =>
      commit(store.execute(setActionOptionCommand(stateId, actionId, index, value))),
    setNodePosition: (depth, stateId, nodeId, x, y) =>
      commit(store.execute(setFlowNodePositionCommand(depth, stateId, nodeId, x, y))),
    moveAction: (stateId, draggedActionId, targetActionId, placeAfter = false) =>
      commit(store.execute(moveFlowActionCommand(stateId, draggedActionId, targetActionId, placeAfter))),
    moveSubAction: (stateId, parentActionId, draggedActionId, targetActionId, placeAfter = false) =>
      commit(store.execute(moveFlowSubActionCommand(stateId, parentActionId, draggedActionId, targetActionId, placeAfter))),
    removeActions: (stateId, selectedIds) => commit(store.execute(removeFlowActionsCommand(stateId, selectedIds))),

    removeRouteBranch: (nodeId, branchId, routeOptions) =>
      commit(store.execute(removeFlowRouteBranchCommand(nodeId, branchId, routeOptions))),
    removeRouteNode: (nodeId) => commit(store.execute(removeFlowRouteNodeCommand(nodeId))),

    undo: () => {
      const snapshot = store.undo();
      if (snapshot) commit(snapshot);
    },
    redo: () => {
      const snapshot = store.redo();
      if (snapshot) commit(snapshot);
    },

    replaceFlow: (flow, replaceOptions = {}) => {
      const snapshot = store.replaceFlow(flow);
      if (replaceOptions.markSaved !== false) savedSnapshot = savedSnapshotOf(snapshot.flow);
      commit(snapshot);
    },
    revert: () => {
      const snapshot = store.replaceFlow(JSON.parse(savedSnapshot) as GameFlow);
      commit(snapshot);
    },
    save: async () => {
      patch({ saving: true, error: null });
      try {
        const payload = serializeGameFlowForSave(store.snapshot().flow);
        const response = await api.saveGameFlow(payload);
        const savedFlow = response.flow || payload;
        savedSnapshot = savedSnapshotOf(savedFlow);
        patch({ saving: false, hasLocalDraft: false });
        commit();
        return savedFlow;
      } catch (error) {
        patch({ saving: false, error: error instanceof Error ? error.message : String(error) });
        return null;
      }
    },
    publishDraft: async () => {
      const payload = serializeGameFlowForSave(store.snapshot().flow);
      try {
        await api.saveToolDraft({ flow: payload });
        patch({ hasLocalDraft: true });
      } catch {
        // Local-draft publishing is best-effort, matching legacy `.catch(() => {})`.
      }
    }
  };
}
