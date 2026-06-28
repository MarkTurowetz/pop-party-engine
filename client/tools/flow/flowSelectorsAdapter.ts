import {
  actionTypeName,
  controllerLayoutOptions,
  findFlowActionRef,
  findFlowState,
  flowActionTargetOptions,
  flowGameObjectLayoutElements,
  flowGameObjectTargetLabel,
  flowGameObjectTargetName,
  flowGameObjectTargetOptions,
  flowGameObjectTargetParts,
  flowGameObjectTargetValue,
  flowPlacedGameObjectElementsForLayoutGroup,
  flowStateName,
  flowStateTargetOptions,
  flowTargetActionName,
  makeFlowId,
  stateActionNameSet,
  uniqueActionNameForType,
  type FlowActionRef,
  type FlowGameObjectTargetParts,
  type FlowOption,
  type FlowPlacedGameObjectOptions,
  type FlowStateNameOptions,
  type FlowTargetLayoutElement,
  type FlowActionTypeMeta,
  type FlowStateTargetOptionsConfig,
  type FindFlowActionRefOptions
} from "./flowSelectors";
import type { FlowAction, FlowState, GameFlow, LayoutState, StageLayoutCollection } from "../../types/game-data";

export interface PartyGameFlowSelectors {
  actionTypeName: (actionTypes: FlowActionTypeMeta[], type: string) => string;
  controllerLayoutOptions: (controllerLayouts: Partial<StageLayoutCollection> | null | undefined, selectedLayoutId?: string) => FlowOption[];
  findFlowActionRef: (flow: Partial<GameFlow> | null | undefined, stateId: string, actionId: string, options?: FindFlowActionRefOptions) => FlowActionRef | null;
  findFlowState: (flow: Partial<GameFlow> | null | undefined, stateId: string) => FlowState | null;
  flowActionTargetOptions: (state: Partial<FlowState> | null | undefined, selectedActionId?: string) => FlowOption[];
  flowGameObjectLayoutElements: (stageLayouts: Partial<StageLayoutCollection> | null | undefined, state: Partial<FlowState> | null | undefined, selectedFlowStateId?: string) => FlowTargetLayoutElement[];
  flowGameObjectTargetLabel: (element: Partial<FlowTargetLayoutElement> | null | undefined) => string;
  flowGameObjectTargetName: (stageLayouts: Partial<StageLayoutCollection> | null | undefined, selectedFlowStateId: string, elementId: string, targetLayoutScope?: string) => string;
  flowGameObjectTargetOptions: (stageLayouts: Partial<StageLayoutCollection> | null | undefined, state: Partial<FlowState> | null | undefined, selectedFlowStateId?: string, selectedElementId?: string) => FlowOption[];
  flowGameObjectTargetParts: (value: unknown, fallbackScope?: string) => FlowGameObjectTargetParts;
  flowGameObjectTargetValue: (element: Partial<FlowTargetLayoutElement>) => string;
  flowPlacedGameObjectElementsForLayoutGroup: (group: Partial<LayoutState> | null | undefined, scope: string, options?: FlowPlacedGameObjectOptions) => FlowTargetLayoutElement[];
  flowStateName: (flow: Partial<GameFlow> | null | undefined, stateId: string, options?: FlowStateNameOptions) => string;
  flowStateTargetOptions: (flow: Partial<GameFlow> | null | undefined, selectedStateId?: string, currentStateId?: string, config?: FlowStateTargetOptionsConfig) => FlowOption[];
  flowTargetActionName: (state: Partial<FlowState> | null | undefined, actionId: string) => string;
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
    flowGameObjectLayoutElements,
    flowGameObjectTargetLabel,
    flowGameObjectTargetName,
    flowGameObjectTargetOptions,
    flowGameObjectTargetParts,
    flowGameObjectTargetValue,
    flowPlacedGameObjectElementsForLayoutGroup,
    flowStateName,
    flowStateTargetOptions,
    flowTargetActionName,
    makeFlowId,
    stateActionNameSet,
    uniqueActionNameForType
  };
  target.PartyGameFlowSelectors = adapter;
  target.document?.documentElement?.setAttribute("data-flow-selectors-adapter", "module");
  return adapter;
}
