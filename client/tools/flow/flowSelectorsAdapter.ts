import {
  actionTypeName,
  findFlowActionRef,
  findFlowState,
  makeFlowId,
  stateActionNameSet,
  uniqueActionNameForType,
  type FlowActionRef,
  type FlowActionTypeMeta,
  type FindFlowActionRefOptions
} from "./flowSelectors";
import type { FlowAction, FlowState, GameFlow } from "../../types/game-data";

export interface PartyGameFlowSelectors {
  actionTypeName: (actionTypes: FlowActionTypeMeta[], type: string) => string;
  findFlowActionRef: (flow: Partial<GameFlow> | null | undefined, stateId: string, actionId: string, options?: FindFlowActionRefOptions) => FlowActionRef | null;
  findFlowState: (flow: Partial<GameFlow> | null | undefined, stateId: string) => FlowState | null;
  makeFlowId: (label: unknown, fallback: string) => string;
  stateActionNameSet: (state: Partial<FlowState> | null | undefined, excludeActionId?: string) => Set<string>;
  uniqueActionNameForType: (actionTypes: FlowActionTypeMeta[], state: Partial<FlowState> | null | undefined, action: Partial<FlowAction> | null | undefined) => string;
}

declare global {
  interface Window {
    PartyGameFlowSelectors?: PartyGameFlowSelectors;
  }
}

export function installFlowSelectorsAdapter(target: Window = window): PartyGameFlowSelectors {
  const adapter = {
    actionTypeName,
    findFlowActionRef,
    findFlowState,
    makeFlowId,
    stateActionNameSet,
    uniqueActionNameForType
  };
  target.PartyGameFlowSelectors = adapter;
  target.document?.documentElement?.setAttribute("data-flow-selectors-adapter", "module");
  return adapter;
}
