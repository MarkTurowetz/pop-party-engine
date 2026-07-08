import type { ArtComponent, ArtComposition, FlowAction, FlowState, GameFlow, JsonObject, LayoutElement, LayoutState, StageLayoutCollection } from "../../types/game-data";
import { parseDecisionBranchGraphNodeId } from "./flowDecisionBranchIdentity";
import { findFlowActionContext, flowSubroutineActions } from "./flowSubroutines";

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

export interface FlowStateNameOptions {
  routeNodeName?: (stateId: string) => string | null | undefined;
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

const LAYOUT_TEXT_ART_COMPOSITION_ID = "layout-text-field";
const BASE_ANIMATION_LABELS = ["appear", "disappear", "on", "off", "park", "update"];
const LEGACY_LAYOUT_TEXT_ELEMENT_IDS = new Set([
  "stagetitle",
  "stageintrotitle",
  "stagepresentationtext",
  "stageprompttext",
  "roundintrotext",
  "roundintroinfotext"
]);

export function normalizeFlowTextTargetId(value: unknown): string {
  const normalized = String(value || "")
    .trim()
    .replace(/^#/, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const compact = normalized.replace(/-/g, "");
  if (compact === "presentation") return "stagepresentationtext";
  if (compact === "prompt") return "stageprompttext";
  if (compact === "stagepresentationtext") return "stagepresentationtext";
  if (compact === "stageprompttext") return "stageprompttext";
  if (compact === "roundintrotext") return "roundintrotext";
  if (compact === "roundintroinfotext") return "roundintroinfotext";
  return normalized;
}

function compactLayoutTextId(value: unknown): string {
  return String(value || "")
    .trim()
    .replace(/^#/, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function isFlowLayoutTextElement(element: Partial<LayoutElement> | null | undefined): boolean {
  const compactId = compactLayoutTextId(element?.id);
  return (
    element?.kind === "text" ||
    element?.artCompositionId === LAYOUT_TEXT_ART_COMPOSITION_ID ||
    LEGACY_LAYOUT_TEXT_ELEMENT_IDS.has(compactId) ||
    compactId.endsWith("momenttext") ||
    compactId.endsWith("controllertext")
  );
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
  const branchRef = parseDecisionBranchGraphNodeId(actionId);
  if (branchRef) {
    const parentContext = findFlowActionContext(state, branchRef.actionId);
    const parentAction = parentContext.action;
    if (parentAction?.type !== "decision") return null;
    const branches = options.ensureDecisionBranches?.(parentAction) || parentAction.branches || [];
    const branch = branches.find((candidate) => candidate.id === branchRef.branchId);
    if (!branch) return null;
    return {
      state,
      action: branch,
      parentAction,
      actions: branches,
      isSubAction: false,
      isBranch: true
    };
  }
  const context = findFlowActionContext(state, actionId);
  if (!context.action) return null;
  if (context.parentAction?.type === "decision") {
    const branches = options.ensureDecisionBranches?.(context.parentAction) || context.actions;
    const branch = branches.find((candidate) => candidate.id === actionId);
    if (branch) {
      return { state, action: branch, parentAction: context.parentAction, actions: branches, isSubAction: false, isBranch: true };
    }
  }
  return {
    state,
    action: context.action,
    parentAction: context.parentAction,
    actions: context.actions,
    isSubAction: context.isSubAction,
    isBranch: context.isBranch
  };
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

export function flowStateName(flow: Partial<GameFlow> | null | undefined, stateId: string, options: FlowStateNameOptions = {}): string {
  return findFlowState(flow, stateId)?.name || options.routeNodeName?.(stateId) || stateId || "State";
}

export function flowTargetActionName(state: Partial<FlowState> | null | undefined, actionId: string): string {
  if (!actionId) return "No Connection";
  if (actionId === "none") return "None";
  if (actionId === "return") return "Return";
  const action = (state?.actions || []).find((item) => item.id === actionId);
  return action?.name || "Next Action";
}

export function stateActionNameSet(state: Partial<FlowState> | null | undefined, excludeActionId = ""): Set<string> {
  const names = new Set<string>();
  for (const action of state?.actions || []) {
    if (action.id !== excludeActionId && action.name) names.add(String(action.name).trim().toLowerCase());
    for (const nested of flowSubroutineActions(action)) {
      if (nested.id !== excludeActionId && nested.name) names.add(String(nested.name).trim().toLowerCase());
    }
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
    { id: "return", name: "Return To Parent Subroutine" }
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
    { id: "", name: "No Next Subroutine" },
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

function flowGameObjectLayoutElementForTarget(
  stageLayouts: Partial<StageLayoutCollection> | null | undefined,
  state: Partial<FlowState> | null | undefined,
  selectedFlowStateId: string,
  selectedTarget: unknown
): FlowTargetLayoutElement | null {
  const parts = flowGameObjectTargetParts(selectedTarget, "moment");
  if (!parts.id) return null;
  return (
    flowGameObjectLayoutElements(stageLayouts, state, selectedFlowStateId).find((element) => {
      const scope = String(element.targetLayoutScope || "moment");
      return element.id === parts.id && scope === (parts.scope || "moment");
    }) || null
  );
}

function flowGameObjectCompositionForTarget(
  stageLayouts: Partial<StageLayoutCollection> | null | undefined,
  artCompositions: Partial<ArtComposition>[] | null | undefined,
  state: Partial<FlowState> | null | undefined,
  selectedFlowStateId: string,
  selectedTarget: unknown
): Partial<ArtComposition> | null {
  const element = flowGameObjectLayoutElementForTarget(
    stageLayouts,
    state,
    selectedFlowStateId,
    selectedTarget
  );
  const compositionId = String(element?.artCompositionId || "");
  return (artCompositions || []).find((item) => item.id === compositionId) || null;
}

function walkArtComponents(
  components: Partial<ArtComponent>[] | null | undefined,
  visit: (component: Partial<ArtComponent>, depth: number) => void,
  depth = 0
): void {
  for (const component of components || []) {
    visit(component, depth);
    walkArtComponents(component.children, visit, depth + 1);
  }
}

function flowComponentName(component: Partial<ArtComponent>, depth: number): string {
  const prefix = depth > 0 ? `${"  ".repeat(depth)}` : "";
  const name = String(component.name || component.id || "Component");
  const id = String(component.id || "");
  const suffix = id && id.toLowerCase() !== name.toLowerCase() ? ` (${id})` : "";
  return `${prefix}${name}${suffix}`;
}

export function flowGameObjectComponentTargetOptions(
  stageLayouts: Partial<StageLayoutCollection> | null | undefined,
  artCompositions: Partial<ArtComposition>[] | null | undefined,
  state: Partial<FlowState> | null | undefined,
  selectedFlowStateId = "",
  selectedTarget = "",
  selectedComponentId = ""
): FlowOption[] {
  const options = [{ id: "", name: "Whole Game Object" }];
  const seen = new Set<string>([""]);
  const composition = flowGameObjectCompositionForTarget(
    stageLayouts,
    artCompositions,
    state,
    selectedFlowStateId,
    selectedTarget
  );
  walkArtComponents(composition?.components, (component, depth) => {
    const id = String(component.id || "");
    if (!id || seen.has(id)) return;
    seen.add(id);
    options.push({ id, name: flowComponentName(component, depth) });
  });
  if (selectedComponentId && !seen.has(selectedComponentId)) {
    options.push({ id: selectedComponentId, name: selectedComponentId });
  }
  return options;
}

export function flowGameObjectAnimationLabelOptions(
  stageLayouts: Partial<StageLayoutCollection> | null | undefined,
  artCompositions: Partial<ArtComposition>[] | null | undefined,
  state: Partial<FlowState> | null | undefined,
  selectedFlowStateId = "",
  selectedTarget = "",
  selectedComponentId = "",
  selectedAnimation = ""
): FlowOption[] {
  const options: FlowOption[] = [];
  const seen = new Set<string>();
  const push = (label: unknown) => {
    const id = String(label || "").trim();
    if (!id || seen.has(id)) return;
    seen.add(id);
    options.push({ id, name: id });
  };
  for (const label of BASE_ANIMATION_LABELS) push(label);
  const composition = flowGameObjectCompositionForTarget(
    stageLayouts,
    artCompositions,
    state,
    selectedFlowStateId,
    selectedTarget
  );
  let componentTimelineLabels: { name: string }[] = [];
  if (selectedComponentId) {
    walkArtComponents(composition?.components, (component) => {
      if (component.id === selectedComponentId) {
        componentTimelineLabels = component.timeline?.labels || [];
      }
    });
  }
  for (const label of componentTimelineLabels.length ? componentTimelineLabels : composition?.timeline?.labels || []) push(label.name);
  push(selectedAnimation);
  return options;
}

export function flowTextTargetOptions(
  stageLayouts: Partial<StageLayoutCollection> | null | undefined,
  state: Partial<FlowState> | null | undefined,
  selectedFlowStateId = "",
  selectedTextTarget = ""
): FlowOption[] {
  const options = [{ id: "", name: "No Text Field" }];
  const seen = new Set<string>();
  for (const element of flowGameObjectLayoutElements(stageLayouts, state, selectedFlowStateId)) {
    if (!isFlowLayoutTextElement(element)) continue;
    const id = String(element.id || "");
    const normalized = normalizeFlowTextTargetId(id);
    if (!id || seen.has(normalized)) continue;
    seen.add(normalized);
    options.push({ id, name: flowGameObjectTargetLabel(element) });
  }
  const selected = String(selectedTextTarget || "");
  const normalizedSelected = normalizeFlowTextTargetId(selected);
  if (
    selected &&
    !options.some((option) => normalizeFlowTextTargetId(option.id) === normalizedSelected)
  ) {
    options.push({ id: selected, name: selected });
  }
  return options;
}

export function flowTextTargetName(
  stageLayouts: Partial<StageLayoutCollection> | null | undefined,
  selectedFlowStateId: string,
  textTarget: unknown
): string {
  const target = String(textTarget || "");
  if (!target) return "No Text Field";
  const normalizedTarget = normalizeFlowTextTargetId(target);
  const selectedState = (stageLayouts?.states || []).find((state) => state.id === selectedFlowStateId);
  const candidates = [
    ...flowGameObjectLayoutElements(stageLayouts, selectedState || { id: selectedFlowStateId }, selectedFlowStateId),
    ...((stageLayouts?.states || []).flatMap((state) =>
      flowPlacedGameObjectElementsForLayoutGroup(state, "moment")
    ) as FlowTargetLayoutElement[])
  ];
  const match = candidates.find(
    (element) =>
      isFlowLayoutTextElement(element) &&
      normalizeFlowTextTargetId(element.id) === normalizedTarget
  );
  return match ? flowGameObjectTargetLabel(match) : target;
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
