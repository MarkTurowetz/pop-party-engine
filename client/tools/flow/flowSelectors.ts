import type { FlowAction, FlowState, GameFlow, JsonObject } from "../../types/game-data";

export interface FlowActionRef {
  state: FlowState;
  action: FlowAction;
  parentAction: FlowAction | null;
  actions: FlowAction[];
  isSubAction: boolean;
  isBranch: boolean;
}

export interface FindFlowActionRefOptions {
  ensureDecisionBranches?: (action: FlowAction) => FlowAction[];
}

export interface FlowActionTypeMeta extends JsonObject {
  id: string;
  name: string;
  category?: string;
}

export function findFlowState(flow: Partial<GameFlow> | null | undefined, stateId: string): FlowState | null {
  return (flow?.states || []).find((state) => state.id === stateId) || null;
}

export function findFlowActionRef(
  flow: Partial<GameFlow> | null | undefined,
  stateId: string,
  actionId: string,
  options: FindFlowActionRefOptions = {}
): FlowActionRef | null {
  const state = findFlowState(flow, stateId);
  if (!state || !actionId) return null;
  for (const action of state.actions || []) {
    if (action.id === actionId) {
      return { state, action, parentAction: null, actions: state.actions, isSubAction: false, isBranch: false };
    }
    for (const subAction of action.subActions || []) {
      if (subAction.id === actionId) {
        return { state, action: subAction, parentAction: action, actions: action.subActions || [], isSubAction: true, isBranch: false };
      }
    }
    if (action.type === "decision") {
      const branches = options.ensureDecisionBranches?.(action) || (Array.isArray(action.branches) ? action.branches : []);
      for (const branch of branches) {
        if (branch.id === actionId) {
          return { state, action: branch, parentAction: action, actions: branches, isSubAction: false, isBranch: true };
        }
      }
    }
  }
  return null;
}

export function makeFlowId(label: unknown, fallback: string): string {
  return String(label || fallback)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 42) || fallback;
}

export function actionTypeName(actionTypes: FlowActionTypeMeta[], type: string): string {
  return actionTypes.find((item) => item.id === type)?.name || type;
}

export function stateActionNameSet(state: Partial<FlowState> | null | undefined, excludeActionId = ""): Set<string> {
  const names = new Set<string>();
  for (const action of state?.actions || []) {
    if (action.id !== excludeActionId && action.name) names.add(String(action.name).trim().toLowerCase());
    for (const subAction of action.subActions || []) {
      if (subAction.id !== excludeActionId && subAction.name) names.add(String(subAction.name).trim().toLowerCase());
    }
  }
  return names;
}

export function uniqueActionNameForType(actionTypes: FlowActionTypeMeta[], state: Partial<FlowState> | null | undefined, action: Partial<FlowAction> | null | undefined): string {
  const base = actionTypeName(actionTypes, String(action?.type || "")) || "Action";
  const existing = stateActionNameSet(state, String(action?.id || ""));
  if (!existing.has(base.toLowerCase())) return base;
  let index = 1;
  while (existing.has(`${base} ${index}`.toLowerCase())) index += 1;
  return `${base} ${index}`;
}
