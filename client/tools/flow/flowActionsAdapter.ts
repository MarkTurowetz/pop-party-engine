import { createDefaultFlowAction, type CreateDefaultFlowActionOptions } from "./flowActions";
import type { FlowAction } from "../../types/game-data";

export interface PartyGameFlowActions {
  createDefaultFlowAction: (stateId: string, name: string, isSubAction: boolean, options?: CreateDefaultFlowActionOptions) => FlowAction;
}

declare global {
  interface Window {
    PartyGameFlowActions?: PartyGameFlowActions;
  }
}

export function installFlowActionsAdapter(target: Window = window): PartyGameFlowActions {
  const adapter = { createDefaultFlowAction };
  target.PartyGameFlowActions = adapter;
  target.document?.documentElement?.setAttribute("data-flow-actions-adapter", "module");
  return adapter;
}
