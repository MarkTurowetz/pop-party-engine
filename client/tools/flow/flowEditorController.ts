import type { FlowAction, GameFlow, JsonObject } from "../../types/game-data";
import type { FlowApi } from "../../api/flowApi";
import {
  addActionOptionCommand,
  addConnectedFlowActionCommand,
  addConnectedRootFlowActionCommand,
  addDecisionBranchCommand,
  addFlowActionCommand,
  addFlowActionToSubroutineCommand,
  addFlowRouteDecisionBranchCommand,
  addFlowStateCommand,
  addFlowSubroutineCommand,
  addFlowSubActionCommand,
  addRootFlowActionCommand,
  connectRootFlowActionCommand,
  removeActionOptionCommand,
  removeDecisionBranchCommand,
  setActionOptionCommand,
  setDecisionBranchFieldCommand,
  moveFlowActionCommand,
  renameFlowActionCommand,
  renameFlowRouteActionCommand,
  moveFlowStateCommand,
  moveFlowSubActionCommand,
  removeFlowActionsCommand,
  removeFlowRouteBranchCommand,
  removeFlowRouteNodeCommand,
  removeFlowStatesCommand,
  renameFlowStateCommand,
  refreshFlowActionTypeNameCommand,
  refreshFlowRouteActionTypeNameCommand,
  setFlowActionFieldCommand,
  setFlowActionTimingCommand,
  setFlowActionTypeCommand,
  setFlowRouteActionFieldCommand,
  setFlowRouteActionTimingCommand,
  setFlowRouteActionTypeCommand,
  setFlowRouteDecisionBranchFieldCommand,
  setFlowNodePositionCommand,
  setFlowNodePositionsCommand,
  type FlowActionTimingPatch,
  type FlowNodePositionUpdate,
  setFlowStateEntryTargetCommand,
  setFlowSubroutineEntryTargetCommand,
  setFlowStateNextTargetCommand,
  setFlowStateVotingSourceCommand
} from "./flowCommands";
import type { FlowNodeExit, FlowNodePoint } from "./flowNodeGraph";
import { decisionBranchGraphNodeId } from "./flowDecisionBranchIdentity";
import { createFlowStore, type FlowStore, type FlowStoreSnapshot } from "./flowStore";
import { createActionDefaults } from "./flowActionDefaults";
import { ensureActionTiming, flowActionNameForType } from "./flowActions";
import { ensureDecisionBranches } from "./flowDecision";
import { actionTypeName, makeFlowId, type FlowActionTypeMeta } from "./flowSelectors";
import { serializeGameFlowForSave } from "./flowSerialization";
import { flowSubroutineActions } from "./flowSubroutines";
import { type RemoveFlowRouteBranchOptions } from "./flowMutations";
import { createSessionDraftPublisher } from "../common/sessionDraftPublisher";

/** All selectable action ids across the flow (primary, sub-actions, decision branches). */
function allFlowActionIds(flow: GameFlow): string[] {
  const ids: string[] = [];
  for (const state of flow.states || []) collectSelectableActionIds(state.actions || [], ids);
  return ids;
}

function collectSelectableActionIds(actions: FlowAction[] = [], ids: string[] = []): string[] {
  for (const action of actions || []) {
    ids.push(action.id);
    collectSelectableActionIds(flowSubroutineActions(action), ids);
    for (const subAction of action.subActions || []) ids.push(subAction.id);
    if (action.type === "decision") {
      for (const branch of action.branches || []) {
        ids.push(branch.id);
        ids.push(decisionBranchGraphNodeId(action.id, branch.id));
      }
    }
  }
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
  /**
   * When true, mutating the flow publishes an in-memory server draft so the
   * running stage/controller use the current editing session before durable save.
   */
  autoPublishDraft?: boolean;
  draftPublishDelayMs?: number;
  postDraft?: (message: JsonObject) => Promise<unknown>;
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
  addSubroutine(
    stateId: string,
    subroutinePath?: Iterable<string>,
    selectedPrimaryActionId?: string
  ): void;
  renameState(stateId: string, name: string): void;
  moveState(draggedStateId: string, targetStateId: string, placeAfter?: boolean): void;
  removeStates(stateIds: Iterable<string>): void;
  setNextTarget(stateId: string, targetId: string): void;
  setEntryTarget(stateId: string, targetId: string, subroutinePath?: Iterable<string>): void;
  setVotingSource(stateId: string, sourceStateId: string): void;

  // Action edits
  addAction(
    stateId: string,
    selectedPrimaryActionId?: string,
    subroutinePath?: Iterable<string>
  ): void;
  addConnectedAction(
    stateId: string,
    source: FlowNodeExit,
    position: FlowNodePoint,
    subroutinePath?: Iterable<string>
  ): void;
  addRootAction(position?: FlowNodePoint | null): void;
  addConnectedRootAction(source: FlowNodeExit, position: FlowNodePoint): void;
  connectRootAction(source: FlowNodeExit, targetId: string): void;
  addSubAction(stateId: string, parentActionId: string, selectedSubActionId?: string): void;
  renameAction(stateId: string, actionId: string, name: string): void;
  renameRouteAction(nodeId: string, name: string): void;
  refreshActionName(stateId: string, actionId: string): void;
  refreshRouteActionName(nodeId: string): void;
  setActionType(stateId: string, actionId: string, type: string): void;
  setRouteActionType(nodeId: string, type: string): void;
  setActionField(stateId: string, actionId: string, key: string, value: unknown): void;
  setRouteActionField(nodeId: string, key: string, value: unknown): void;
  setActionTiming(stateId: string, actionId: string, timing: FlowActionTimingPatch): void;
  setRouteActionTiming(nodeId: string, timing: FlowActionTimingPatch): void;
  addDecisionBranch(stateId: string, actionId: string): void;
  addRouteDecisionBranch(nodeId: string): void;
  removeDecisionBranch(stateId: string, actionId: string, branchId: string): void;
  setDecisionBranchField(
    stateId: string,
    actionId: string,
    branchId: string,
    key: string,
    value: unknown
  ): void;
  setRouteDecisionBranchField(nodeId: string, branchId: string, key: string, value: unknown): void;
  addActionOption(stateId: string, actionId: string): void;
  removeActionOption(stateId: string, actionId: string, index: number): void;
  setActionOption(stateId: string, actionId: string, index: number, value: string): void;
  setNodePosition(
    depth: "subroutines" | "subroutine",
    stateId: string,
    nodeId: string,
    x: number,
    y: number,
    subroutinePath?: Iterable<string>
  ): void;
  setNodePositions(
    depth: "subroutines" | "subroutine",
    stateId: string,
    updates: FlowNodePositionUpdate[],
    subroutinePath?: Iterable<string>
  ): void;
  moveAction(
    stateId: string,
    draggedActionId: string,
    targetActionId: string,
    placeAfter?: boolean,
    subroutinePath?: Iterable<string>
  ): void;
  moveSubAction(
    stateId: string,
    parentActionId: string,
    draggedActionId: string,
    targetActionId: string,
    placeAfter?: boolean
  ): void;
  removeActions(
    stateId: string,
    selectedIds: Iterable<string>,
    subroutinePath?: Iterable<string>
  ): void;

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

function makeRootRouteActionId(): string {
  return `route-action-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function createFlowEditorController(
  options: FlowEditorControllerOptions
): FlowEditorController {
  const { api } = options;
  const protectedStateIds = options.protectedStateIds;
  const actionTypes = options.actionTypes || [];
  const actionTypeMeta = (type: string): Pick<FlowActionTypeMeta, "category"> =>
    actionTypes.find((meta) => meta.id === type) || { category: "standard" };
  const nameForActionType = (type: string): string => {
    const registryName = actionTypeName(actionTypes, type);
    return registryName !== type ? registryName : flowActionNameForType(type);
  };
  const actionDefaults = createActionDefaults({
    ensureActionTiming: (action, isSubAction) =>
      ensureActionTiming(action, isSubAction, { actionTypeMeta }),
    ensureDecisionBranches: (action) => ensureDecisionBranches(action)
  });
  const store: FlowStore = createFlowStore(options.initialFlow, {
    selection: { selectedFlowStateId: options.initialFlow.states?.[0]?.id || "" }
  });

  const listeners = new Set<() => void>();
  let savedSnapshot = savedSnapshotOf(store.snapshot().flow);
  let lastCommittedFlowSnapshot = savedSnapshot;
  const sessionDraftPublisher = createSessionDraftPublisher({
    postDraft: (message) => (options.postDraft || api.saveToolDraft)(message),
    savedSnapshot,
    hasDraft: options.hasLocalDraft,
    delayMs: options.draftPublishDelayMs,
    clearMessage: { clearFlow: true },
    draftMessage: (flowSnapshot) => ({ flow: JSON.parse(flowSnapshot) as GameFlow }),
    onCleared: () => patch({ hasLocalDraft: false }),
    onPublished: () => patch({ hasLocalDraft: true })
  });
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

  function scheduleDraftPublish(flowSnapshot: string): void {
    if (!options.autoPublishDraft) return;
    sessionDraftPublisher.schedule(flowSnapshot);
  }

  function commit(snapshot: FlowStoreSnapshot = store.snapshot()): void {
    const nextFlowSnapshot = savedSnapshotOf(snapshot.flow);
    const flowChanged = nextFlowSnapshot !== lastCommittedFlowSnapshot;
    lastCommittedFlowSnapshot = nextFlowSnapshot;
    state = deriveState(snapshot, {
      saving: state.saving,
      hasLocalDraft: state.hasLocalDraft,
      error: state.error
    });
    listeners.forEach((listener) => listener());
    if (flowChanged) scheduleDraftPublish(nextFlowSnapshot);
  }

  function patch(
    extra: Partial<{ saving: boolean; hasLocalDraft: boolean; error: string | null }>
  ): void {
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
    selectActions: (ids) =>
      commit(store.selectActions(ids, allFlowActionIds(store.snapshot().flow))),
    selectRouteNode: (routeNodeId) => commit(store.selectRouteNode(routeNodeId)),
    selectRouteBranch: (routeNodeId, branchId) =>
      commit(store.selectRouteBranch(routeNodeId, branchId)),
    clearActionSelection: () => commit(store.clearActionSelection()),
    clearRouteSelection: () => commit(store.clearRouteSelection()),

    addState: () => commit(store.execute(addFlowStateCommand())),
    addSubroutine: (stateId, subroutinePath = [], selectedPrimaryActionId = "") =>
      commit(
        store.execute(addFlowSubroutineCommand(stateId, subroutinePath, selectedPrimaryActionId))
      ),
    renameState: (stateId, name) =>
      commit(
        store.execute(renameFlowStateCommand(stateId, name, { makeFlowId, protectedStateIds }))
      ),
    moveState: (draggedStateId, targetStateId, placeAfter = false) =>
      commit(store.execute(moveFlowStateCommand(draggedStateId, targetStateId, placeAfter))),
    removeStates: (stateIds) => commit(store.execute(removeFlowStatesCommand(stateIds))),
    setNextTarget: (stateId, targetId) =>
      commit(store.execute(setFlowStateNextTargetCommand(stateId, targetId))),
    setEntryTarget: (stateId, targetId, subroutinePath = []) => {
      const path = [...subroutinePath].filter(Boolean);
      commit(
        store.execute(
          path.length
            ? setFlowSubroutineEntryTargetCommand(stateId, path, targetId)
            : setFlowStateEntryTargetCommand(stateId, targetId)
        )
      );
    },
    setVotingSource: (stateId, sourceStateId) =>
      commit(store.execute(setFlowStateVotingSourceCommand(stateId, sourceStateId))),

    addAction: (stateId, selectedPrimaryActionId = "", subroutinePath = []) => {
      const path = [...subroutinePath].filter(Boolean);
      commit(
        store.execute(
          path.length
            ? addFlowActionToSubroutineCommand(stateId, path, selectedPrimaryActionId)
            : addFlowActionCommand(stateId, selectedPrimaryActionId)
        )
      );
    },
    addConnectedAction: (stateId, source, position, subroutinePath = []) =>
      commit(
        store.execute(addConnectedFlowActionCommand(stateId, source, position, subroutinePath))
      ),
    addRootAction: (position = null) => {
      const nodeId = makeRootRouteActionId();
      store.execute(addRootFlowActionCommand(position, nodeId));
      commit(store.selectRouteNode(nodeId));
    },
    addConnectedRootAction: (source, position) => {
      const nodeId = makeRootRouteActionId();
      store.execute(addConnectedRootFlowActionCommand(source, position, nodeId));
      commit(store.selectRouteNode(nodeId));
    },
    connectRootAction: (source, targetId) =>
      commit(store.execute(connectRootFlowActionCommand(source, targetId))),
    addSubAction: (stateId, parentActionId, selectedSubActionId = "") =>
      commit(
        store.execute(
          addFlowSubActionCommand(stateId, parentActionId, selectedSubActionId, {
            nameForType: nameForActionType
          })
        )
      ),
    renameAction: (stateId, actionId, name) =>
      commit(store.execute(renameFlowActionCommand(stateId, actionId, name))),
    renameRouteAction: (nodeId, name) =>
      commit(store.execute(renameFlowRouteActionCommand(nodeId, name))),
    refreshActionName: (stateId, actionId) =>
      commit(
        store.execute(
          refreshFlowActionTypeNameCommand(stateId, actionId, { nameForType: nameForActionType })
        )
      ),
    refreshRouteActionName: (nodeId) =>
      commit(
        store.execute(
          refreshFlowRouteActionTypeNameCommand(nodeId, { nameForType: nameForActionType })
        )
      ),
    setActionType: (stateId, actionId, type) =>
      commit(
        store.execute(
          setFlowActionTypeCommand(
            stateId,
            actionId,
            type,
            (action, nextType, isSubAction) =>
              actionDefaults.applyActionTypeDefaults(action, nextType, isSubAction),
            { nameForType: nameForActionType }
          )
        )
      ),
    setRouteActionType: (nodeId, type) =>
      commit(
        store.execute(
          setFlowRouteActionTypeCommand(
            nodeId,
            type,
            (action, nextType, isSubAction) =>
              actionDefaults.applyActionTypeDefaults(action, nextType, isSubAction),
            { nameForType: nameForActionType }
          )
        )
      ),
    setActionField: (stateId, actionId, key, value) =>
      commit(store.execute(setFlowActionFieldCommand(stateId, actionId, key, value))),
    setRouteActionField: (nodeId, key, value) =>
      commit(store.execute(setFlowRouteActionFieldCommand(nodeId, key, value))),
    setActionTiming: (stateId, actionId, timing) =>
      commit(store.execute(setFlowActionTimingCommand(stateId, actionId, timing))),
    setRouteActionTiming: (nodeId, timing) =>
      commit(store.execute(setFlowRouteActionTimingCommand(nodeId, timing))),
    addDecisionBranch: (stateId, actionId) =>
      commit(store.execute(addDecisionBranchCommand(stateId, actionId))),
    addRouteDecisionBranch: (nodeId) =>
      commit(store.execute(addFlowRouteDecisionBranchCommand(nodeId))),
    removeDecisionBranch: (stateId, actionId, branchId) =>
      commit(store.execute(removeDecisionBranchCommand(stateId, actionId, branchId))),
    setDecisionBranchField: (stateId, actionId, branchId, key, value) =>
      commit(store.execute(setDecisionBranchFieldCommand(stateId, actionId, branchId, key, value))),
    setRouteDecisionBranchField: (nodeId, branchId, key, value) =>
      commit(store.execute(setFlowRouteDecisionBranchFieldCommand(nodeId, branchId, key, value))),
    addActionOption: (stateId, actionId) =>
      commit(store.execute(addActionOptionCommand(stateId, actionId))),
    removeActionOption: (stateId, actionId, index) =>
      commit(store.execute(removeActionOptionCommand(stateId, actionId, index))),
    setActionOption: (stateId, actionId, index, value) =>
      commit(store.execute(setActionOptionCommand(stateId, actionId, index, value))),
    setNodePosition: (depth, stateId, nodeId, x, y, subroutinePath = []) =>
      commit(
        store.execute(setFlowNodePositionCommand(depth, stateId, nodeId, x, y, subroutinePath))
      ),
    setNodePositions: (depth, stateId, updates, subroutinePath = []) =>
      commit(store.execute(setFlowNodePositionsCommand(depth, stateId, updates, subroutinePath))),
    moveAction: (
      stateId,
      draggedActionId,
      targetActionId,
      placeAfter = false,
      subroutinePath = []
    ) =>
      commit(
        store.execute(
          moveFlowActionCommand(
            stateId,
            draggedActionId,
            targetActionId,
            placeAfter,
            subroutinePath
          )
        )
      ),
    moveSubAction: (stateId, parentActionId, draggedActionId, targetActionId, placeAfter = false) =>
      commit(
        store.execute(
          moveFlowSubActionCommand(
            stateId,
            parentActionId,
            draggedActionId,
            targetActionId,
            placeAfter
          )
        )
      ),
    removeActions: (stateId, selectedIds, subroutinePath = []) =>
      commit(store.execute(removeFlowActionsCommand(stateId, selectedIds, subroutinePath))),

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
        lastCommittedFlowSnapshot = savedSnapshot;
        sessionDraftPublisher.markSaved(savedSnapshot);
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
        await sessionDraftPublisher.publish(savedSnapshotOf(payload), { force: true });
        patch({ hasLocalDraft: true });
      } catch {
        // Local-draft publishing is best-effort, matching legacy `.catch(() => {})`.
      }
    }
  };
}
