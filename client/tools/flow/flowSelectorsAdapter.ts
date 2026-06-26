import {
  actionTypeName,
  controllerLayoutOptions,
  findFlowActionRef,
  findFlowState,
  flowActionTargetOptions,
  flowStateTargetOptions,
  makeFlowId,
  stateActionNameSet,
  uniqueActionNameForType,
  type FlowActionRef,
  type FlowOption,
  type FlowActionTypeMeta,
  type FlowStateTargetOptionsConfig,
  type FindFlowActionRefOptions
} from "./flowSelectors";
import type { FlowAction, FlowState, GameFlow, StageLayoutCollection } from "../../types/game-data";

export interface PartyGameFlowSelectors {
  actionTypeName: (actionTypes: FlowActionTypeMeta[], type: string) => string;
  controllerLayoutOptions: (controllerLayouts: Partial<StageLayoutCollection> | null | undefined, selectedLayoutId?: string) => FlowOption[];
  findFlowActionRef: (flow: Partial<GameFlow> | null | undefined, stateId: string, actionId: string, options?: FindFlowActionRefOptions) => FlowActionRef | null;
  findFlowState: (flow: Partial<GameFlow> | null | undefined, stateId: string) => FlowState | null;
  flowActionTargetOptions: (state: Partial<FlowState> | null | undefined, selectedActionId?: string) => FlowOption[];
  flowStateTargetOptions: (flow: Partial<GameFlow> | null | undefined, selectedStateId?: string, currentStateId?: string, config?: FlowStateTargetOptionsConfig) => FlowOption[];
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
    controllerLayoutOptions,
    findFlowActionRef,
    findFlowState,
    flowActionTargetOptions,
    flowStateTargetOptions,
    makeFlowId,
    stateActionNameSet,
    uniqueActionNameForType
  };
  target.PartyGameFlowSelectors = adapter;
  target.document?.documentElement?.setAttribute("data-flow-selectors-adapter", "module");
  return adapter;
}
