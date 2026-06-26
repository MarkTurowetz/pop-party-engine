import type { FlowAction, FlowState, GameFlow, JsonObject, LayoutElement, LayoutState, StageLayoutCollection } from "../../types/game-data";

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

export interface FlowOption {
  id: string;
  name: string;
}

export interface FlowStateTargetOptionsConfig {
  appendRouteTargets?: (options: FlowOption[]) => void;
}

export interface FlowGameObjectTargetParts {
  scope: string;
  id: string;
}

export interface FlowTargetLayoutElement extends LayoutElement {
  targetLayoutScope?: string;
}

export interface FlowPlacedGameObjectOptions {
  hiddenIds?: Set<string>;
  excludeIds?: Set<string>;
}

type FlowLayoutStateWithVisibility = Partial<LayoutState> & {
  hiddenGlobals?: string[];
  hiddenInStates?: boolean;
};

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

export function flowActionTargetOptions(state: Partial<FlowState> | null | undefined, selectedActionId = ""): FlowOption[] {
  const options = [
    { id: "", name: "No Connection" },
    { id: "none", name: "None" },
    { id: "return", name: "Return To Moments" }
  ];
  for (const action of state?.actions || []) {
    options.push({ id: action.id, name: action.name || action.id });
  }
  if (selectedActionId && !options.some((option) => option.id === selectedActionId)) {
    options.push({ id: selectedActionId, name: selectedActionId });
  }
  return options;
}

export function flowStateTargetOptions(flow: Partial<GameFlow> | null | undefined, selectedStateId = "", currentStateId = "", config: FlowStateTargetOptionsConfig = {}): FlowOption[] {
  const options = [
    { id: "", name: "No Next Moment" },
    { id: "none", name: "None / Halt" }
  ];
  for (const state of flow?.states || []) {
    if (state.id === currentStateId) continue;
    options.push({ id: state.id, name: state.name || state.id });
  }
  config.appendRouteTargets?.(options);
  if (selectedStateId && !options.some((option) => option.id === selectedStateId)) {
    options.push({ id: selectedStateId, name: selectedStateId });
  }
  return options;
}

export function controllerLayoutOptions(controllerLayouts: Partial<StageLayoutCollection> | null | undefined, selectedLayoutId = ""): FlowOption[] {
  const options = [{ id: "", name: "Current Moment Default" }];
  for (const state of controllerLayouts?.states || []) {
    options.push({ id: state.id, name: state.name || state.id });
  }
  if (selectedLayoutId && !options.some((option) => option.id === selectedLayoutId)) {
    options.push({ id: selectedLayoutId, name: selectedLayoutId });
  }
  return options;
}

export function flowPlacedGameObjectElementsForLayoutGroup(group: Partial<LayoutState> | null | undefined, scope: string, options: FlowPlacedGameObjectOptions = {}): FlowTargetLayoutElement[] {
  const hiddenIds = options.hiddenIds || new Set<string>();
  const excludeIds = options.excludeIds || new Set<string>();
  return (group?.elements || [])
    .filter((element) => element?.id)
    .filter((element) => !hiddenIds.has(element.id))
    .filter((element) => !excludeIds.has(element.id))
    .map((element) => ({ ...element, targetLayoutScope: scope }));
}

export function flowGameObjectLayoutElements(
  stageLayouts: Partial<StageLayoutCollection> | null | undefined,
  state: Partial<FlowState> | null | undefined,
  selectedFlowStateId = ""
): FlowTargetLayoutElement[] {
  const stateId = state?.id || selectedFlowStateId || "";
  const layout = (stageLayouts?.states || []).find((item) => item.id === stateId) as FlowLayoutStateWithVisibility | undefined;
  const momentElements = flowPlacedGameObjectElementsForLayoutGroup(layout, "moment");
  const momentIds = new Set(momentElements.map((element) => element.id));
  const globalLayout = (stageLayouts?.global || {}) as FlowLayoutStateWithVisibility;
  const hiddenGlobals = new Set(layout?.hiddenGlobals || []);
  const globalElements = globalLayout.hiddenInStates === true
    ? []
    : flowPlacedGameObjectElementsForLayoutGroup(globalLayout, "global", { hiddenIds: hiddenGlobals, excludeIds: momentIds });
  return [
    ...momentElements,
    ...globalElements
  ];
}

export function flowGameObjectTargetLabel(element: Partial<FlowTargetLayoutElement> | null | undefined): string {
  const scope = ["global", "moment"].includes(String(element?.targetLayoutScope || "")) ? element?.targetLayoutScope : "moment";
  const name = String(element?.name || element?.id || "Game Object");
  const id = String(element?.id || "");
  const idSuffix = id && id.toLowerCase() !== name.toLowerCase() ? ` (${id})` : "";
  return `${scope === "global" ? "Global: " : ""}${name}${idSuffix}`;
}

export function flowGameObjectTargetValue(element: Partial<FlowTargetLayoutElement>): string {
  const scope = ["global", "moment"].includes(String(element?.targetLayoutScope || "")) ? element.targetLayoutScope : "moment";
  return `${scope}:${element.id || ""}`;
}

export function flowGameObjectTargetParts(value: unknown, fallbackScope = ""): FlowGameObjectTargetParts {
  const text = String(value || "");
  const match = text.match(/^(global|moment):(.+)$/);
  if (match) return { scope: match[1], id: match[2] };
  return { scope: fallbackScope || "", id: text };
}

export function flowGameObjectTargetOptions(
  stageLayouts: Partial<StageLayoutCollection> | null | undefined,
  state: Partial<FlowState> | null | undefined,
  selectedFlowStateId = "",
  selectedElementId = ""
): FlowOption[] {
  const selectedParts = flowGameObjectTargetParts(selectedElementId);
  const options = [{ id: "", name: "No Game Object" }];
  for (const element of flowGameObjectLayoutElements(stageLayouts, state, selectedFlowStateId)) {
    options.push({ id: flowGameObjectTargetValue(element), name: flowGameObjectTargetLabel(element) });
  }
  const selectedValue = selectedParts.id ? `${selectedParts.scope || "moment"}:${selectedParts.id}` : "";
  if (selectedParts.id && !options.some((option) => option.id === selectedValue)) {
    options.push({ id: selectedElementId, name: selectedParts.id });
  }
  return options;
}

export function flowGameObjectTargetName(
  stageLayouts: Partial<StageLayoutCollection> | null | undefined,
  selectedFlowStateId: string,
  elementId: string,
  targetLayoutScope = ""
): string {
  if (!elementId) return "No Game Object";
  const scope = ["global", "moment"].includes(String(targetLayoutScope || "")) ? targetLayoutScope : "";
  const selectedState = (stageLayouts?.states || []).find((state) => state.id === selectedFlowStateId);
  const momentElement = (selectedState?.elements || []).find((item) => item.id === elementId);
  const globalElement = (stageLayouts?.global?.elements || []).find((item) => item.id === elementId);
  if (scope === "moment" && momentElement) return flowGameObjectTargetLabel({ ...momentElement, targetLayoutScope: "moment" });
  if (scope === "global" && globalElement) return flowGameObjectTargetLabel({ ...globalElement, targetLayoutScope: "global" });
  if (momentElement) return flowGameObjectTargetLabel({ ...momentElement, targetLayoutScope: "moment" });
  if (globalElement) return flowGameObjectTargetLabel({ ...globalElement, targetLayoutScope: "global" });
  for (const state of stageLayouts?.states || []) {
    const element = (state.elements || []).find((item) => item.id === elementId);
    if (element) return flowGameObjectTargetLabel({ ...element, targetLayoutScope: "moment" });
  }
  return elementId;
}
