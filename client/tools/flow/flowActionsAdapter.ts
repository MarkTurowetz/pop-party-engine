import { createDefaultFlowAction, ensureActionTiming, type CreateDefaultFlowActionOptions, type EnsureActionTimingOptions } from "./flowActions";
import type { FlowAction, FlowTiming } from "../../types/game-data";

export interface PartyGameFlowActions {
  createDefaultFlowAction: (stateId: string, name: string, isSubAction: boolean, options?: CreateDefaultFlowActionOptions) => FlowAction;
  ensureActionTiming: (action: FlowAction, isSubAction?: boolean, options?: EnsureActionTimingOptions) => FlowTiming;
}

declare global {
  interface Window {
    PartyGameFlowActions?: PartyGameFlowActions;
  }
}

export function installFlowActionsAdapter(target: Window = window): PartyGameFlowActions {
  const adapter = { createDefaultFlowAction, ensureActionTiming };
  target.PartyGameFlowActions = adapter;
  target.document?.documentElement?.setAttribute("data-flow-actions-adapter", "module");
  return adapter;
}
