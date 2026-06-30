import type { FlowAction, FlowState, GameFlow } from "../../types/game-data";

export type FlowSubroutine = FlowState | FlowAction;

export interface FlowSubroutineRef {
  root: FlowState;
  subroutine: FlowSubroutine;
  path: string[];
}

export interface FlowActionContext {
  action: FlowAction | undefined;
  parentAction: FlowAction | null;
  actions: FlowAction[];
  isSubAction: boolean;
  isBranch: boolean;
}

export function isFlowSubroutineAction(action: Partial<FlowAction> | null | undefined): boolean {
  return action?.type === "subroutine";
}

export function flowSubroutineActions(subroutine: Partial<FlowSubroutine> | null | undefined): FlowAction[] {
  return Array.isArray(subroutine?.actions) ? (subroutine.actions as FlowAction[]) : [];
}

export function findFlowSubroutine(
  flow: Partial<GameFlow> | null | undefined,
  rootStateId: string,
  path: Iterable<string> | null | undefined = []
): FlowSubroutineRef | null {
  const root = (flow?.states || []).find((state) => state.id === rootStateId) || null;
  if (!root) return null;
  const normalizedPath = [...(path || [])].filter(Boolean);
  let subroutine: FlowSubroutine = root;
  for (const actionId of normalizedPath) {
    const action: FlowAction | undefined = flowSubroutineActions(subroutine).find(
      (candidate) => candidate.id === actionId && isFlowSubroutineAction(candidate)
    );
    if (!action) return null;
    subroutine = action;
  }
  return { root, subroutine, path: normalizedPath };
}

export function findFlowActionContextInList(
  actions: FlowAction[] = [],
  actionId: string
): FlowActionContext {
  if (!actionId) {
    return { action: undefined, parentAction: null, actions, isSubAction: false, isBranch: false };
  }

  for (const action of actions || []) {
    if (action.id === actionId) {
      return { action, parentAction: null, actions, isSubAction: false, isBranch: false };
    }

    const nested = findFlowActionContextInList(flowSubroutineActions(action), actionId);
    if (nested.action) return nested;

    for (const subAction of action.subActions || []) {
      if (subAction.id === actionId) {
        return {
          action: subAction,
          parentAction: action,
          actions: action.subActions || [],
          isSubAction: true,
          isBranch: false
        };
      }
    }

    if (action.type === "decision" && Array.isArray(action.branches)) {
      for (const branch of action.branches) {
        if (branch.id === actionId) {
          return {
            action: branch,
            parentAction: action,
            actions: action.branches || [],
            isSubAction: false,
            isBranch: true
          };
        }
      }
    }
  }

  return { action: undefined, parentAction: null, actions, isSubAction: false, isBranch: false };
}

export function findFlowActionContext(
  state: FlowState | undefined,
  actionId: string
): FlowActionContext {
  return findFlowActionContextInList(flowSubroutineActions(state), actionId);
}

export function findFlowAction(state: FlowState | undefined, actionId: string): FlowAction | undefined {
  return findFlowActionContext(state, actionId).action;
}

export function flowSubroutineTitle(subroutine: Partial<FlowSubroutine> | null | undefined): string {
  return String(subroutine?.name || subroutine?.id || "Subroutine");
}
