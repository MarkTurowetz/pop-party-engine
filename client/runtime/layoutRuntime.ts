// Typed port of the legacy client/layout-runtime.js (top-level classic script) — the
// stage + controller layout rendering runtime. The classic script made every
// top-level name a global that stage-runtime.js (still legacy) reads; this module
// installs the same names on window. App-shell state, utils, normalizeUiColor
// Shared runtime dependencies are read via window.
// PRESERVED: the window.PartyGameTextFit re-assignment (its own layout text-fit) +
// window.PartyGameLayoutText + window.fittedLayoutTextSize installs.

import "./layoutGameObjectRuntime"; // ensure PartyGameLayoutGameObjects is installed first
import { isSemanticControllerLayoutStateId } from "../../shared/controller-layout-states";

type Dict = Record<string, unknown>;
type El = HTMLElement;
type LayoutCollection = { canvas?: { width?: number; height?: number }; global?: Dict; states?: Dict[] };

interface TextFitApi {
  renderLayoutTextField?: (target: El, element: Dict, options: Dict) => Dict | null;
  renderRuntimeText?: (target: El, text: string, spec: Dict) => unknown;
  measureGameText?: (config: Dict) => Dict | null;
}

declare global {
  interface Window {
    stageLayouts: LayoutCollection;
    controllerLayouts: LayoutCollection;
    runtimeTestLayouts: LayoutCollection | null;
    runtimeTestControllerLayouts: LayoutCollection | null;
    controllerPanel: El;
    stageBoard: El;
    stageScreen: El;
    currentStageLayoutStateId: string;
    stageTextObjects: Record<string, Dict>;
    normalizeUiColor?: (value: unknown) => string;
  }
}

const w = () => globalThis as typeof globalThis & Window;
const NO_OVERRIDE = Symbol("no-override");
const normalizeUiColor = (value: unknown): string => w().normalizeUiColor?.(value) || "";
const lgo = w().PartyGameLayoutGameObjects!;
const {
  activeDynamicLayoutArtInstanceIds,
  artRendererForLayoutHost,
  activateLayoutEntity,
  applyLayoutElementBoxStyles,
  attachRenderedLayoutArtEntity,
  beginLayoutElementTargetApplication,
  createDynamicLayoutArtInstanceApi,
  createPlacedLayoutEntityRegistrar,
  createPlacedLayoutGameObjectTargetResolver,
  deactivateLayoutEntity,
  finishLayoutElementTargetApplication,
  layoutElementTargetMatchesSelector,
  layoutElementVisibilityKey,
  layoutTargetByElementId,
  playLayoutEntityAnimationForAction
} = lgo;

// --- module-internal layout game-object state (not read by other scripts) ---
const stageLayoutGameObjectVisibilityOverrides = new Map<string, boolean>();
let stageLayoutGameObjects: Dict | null = null;
const controllerLayoutVisibilityOverrides = new Map<string, boolean>();
let controllerLayoutGameObjects: Dict | null = null;
let currentControllerLayoutStateId = "";

function normalizeTextTargetId(value: unknown): string {
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

const layoutTextArtCompositionId = "layout-text-field";
const layoutTextArtComponentId = "text";
const layoutTextArtNestedCompositionId = "prefab-layout-text-field-text";
const layoutTextArtNestedComponentPath = `${layoutTextArtNestedCompositionId}/${layoutTextArtComponentId}`;
const layoutTextArtLegacyComponentPath = `${layoutTextArtCompositionId}/${layoutTextArtComponentId}`;
const controllerPrimaryButtonArtCompositionId = "controller-primary-button";
const controllerChoiceOptionArtCompositionId = "controller-choice-option";
const controllerWidgetTextComponentIds: Record<string, string> = {
  "controller-choice-option": "option-text",
  "controller-invalid-banner": "invalid-text",
  "controller-player-banner": "banner-name",
  "controller-player-name-field": "field-value",
  "controller-primary-button": "button-text",
  "controller-stage-code-field": "field-value",
  "controller-text-input-field": "placeholder-text"
};
const controllerWidgetArtCompositionIds: Record<string, string> = {
  controlleravatar: "controller-avatar-button",
  controllerglobalactionbutton: controllerPrimaryButtonArtCompositionId,
  controllerinvalidbanner: "controller-invalid-banner",
  controllermicaccessbutton: controllerPrimaryButtonArtCompositionId,
  controllerplayerbanner: "controller-player-banner",
  controllertextinput: "controller-text-input-field",
  controllertextsubmitbutton: controllerPrimaryButtonArtCompositionId,
  controllervoicebutton: controllerPrimaryButtonArtCompositionId,
  intropresentbutton: controllerPrimaryButtonArtCompositionId,
  joinbutton: controllerPrimaryButtonArtCompositionId,
  playernamefield: "controller-player-name-field",
  stagecodefield: "controller-stage-code-field",
  startgamebutton: controllerPrimaryButtonArtCompositionId
};
let controllerRuntimeArtRendererCounter = 0;
const legacyLayoutTextElementIds = new Set([
  "stagetitle", "stageintrotitle", "stagepresentationtext", "stageprompttext", "roundintrotext", "roundintroinfotext",
  "jointitle", "controllerplayername", "controllermeta", "controllerintromessage", "controllerglobalactionmessage",
  "controllerchoiceprompt", "controllerchoicedone", "controllermicaccessprompt", "controllermicaccessstatus",
  "controllertextprompt", "controllervoicestatus", "controllertextdone"
]);

function compactLayoutTextId(value: unknown): string {
  return String(value || "").trim().replace(/^#/, "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function compactControllerWidgetId(value: unknown): string {
  return String(value || "").trim().replace(/^#/, "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function controllerWidgetArtCompositionIdForTarget(target: El | null): string {
  if (!target) return "";
  const layoutHost = target.closest("[data-controller-layout-art-composition-id]") as El | null;
  const layoutCompositionId = layoutHost?.dataset.controllerLayoutArtCompositionId || target.dataset.controllerLayoutArtCompositionId || "";
  if (layoutCompositionId) return layoutCompositionId;
  if (target.classList.contains("choice-option-button")) return controllerChoiceOptionArtCompositionId;
  if (target.classList.contains("primary-button") || target.dataset.controllerOption !== undefined) return controllerPrimaryButtonArtCompositionId;
  return controllerWidgetArtCompositionIds[compactControllerWidgetId(target.id)] || "";
}

function controllerWidgetTextComponentId(compositionId: unknown): string {
  return controllerWidgetTextComponentIds[String(compositionId || "")] || "";
}

function controllerRuntimeArtRendererKey(target: El, prefix: string): string {
  if (!target.dataset.controllerRuntimeArtRendererKey) {
    controllerRuntimeArtRendererCounter += 1;
    target.dataset.controllerRuntimeArtRendererKey = `${prefix}:${controllerRuntimeArtRendererCounter}`;
  }
  return target.dataset.controllerRuntimeArtRendererKey;
}

function isLayoutTextArtElement(element: Dict | null): boolean {
  const id = compactLayoutTextId(element?.id);
  return element?.artCompositionId === layoutTextArtCompositionId || legacyLayoutTextElementIds.has(id) || id.endsWith("momenttext") || id.endsWith("controllertext");
}

function layoutTextArtRenderOptions(element: Dict | null, textOverride: unknown = undefined): Dict {
  const text = textOverride === undefined ? layoutTextDefault(element) : String(textOverride ?? "");
  const usesNestedTextPrefab = Boolean(w().artComposition?.(layoutTextArtNestedCompositionId));
  const componentId = usesNestedTextPrefab ? layoutTextArtNestedComponentPath : layoutTextArtComponentId;
  const textOverrides = usesNestedTextPrefab
    ? { [layoutTextArtNestedComponentPath]: text, [layoutTextArtLegacyComponentPath]: "" }
    : { [layoutTextArtComponentId]: text };
  return {
    textOverrides,
    textStyle: { componentId, fontSize: Number(element?.fontSize || 58), fontColor: normalizeUiColor(element?.fontColor) || "#ffffff" }
  };
}

function labeledWidgetTextRenderOptions(text: unknown): Dict {
  return { textOverrides: { text: String(text ?? "") } };
}

function stageLayoutArtRenderOptions(element: Dict | null, host: El | null): Dict {
  if (isLayoutTextArtElement(element)) return layoutTextArtRenderOptions(element, host?.dataset.textFitSource);
  if (host?.dataset.textFitSource !== undefined) return labeledWidgetTextRenderOptions(host.dataset.textFitSource);
  return {};
}

function controllerWidgetTextRenderOptions(compositionId: unknown, text: unknown): Dict {
  const componentId = controllerWidgetTextComponentId(compositionId);
  return componentId ? { textOverrides: { [componentId]: String(text ?? "") } } : {};
}

function controllerLayoutArtDefaultText(element: Dict | null, host: El | null): string {
  const compositionId = String(element?.artCompositionId || "");
  if (compositionId === "controller-stage-code-field" || compositionId === "controller-player-name-field" || compositionId === "controller-text-input-field") return "";
  if (host?.dataset.textFitSource !== undefined) return host.dataset.textFitSource || "";
  if (compositionId === "controller-invalid-banner") return String(host?.textContent || "Your submission was invalid").trim();
  if (compositionId === "controller-player-banner") return String(host?.querySelector(".controller-player-banner-name")?.textContent || "").trim();
  if (compositionId === controllerPrimaryButtonArtCompositionId) return host?.dataset.controllerTextValue || String(host?.textContent || "").trim();
  return "";
}

function controllerLayoutArtRenderOptions(element: Dict | null, host: El | null): Dict {
  if (isLayoutTextArtElement(element)) return layoutTextArtRenderOptions(element, host?.dataset.textFitSource);
  const text = controllerLayoutArtDefaultText(element, host);
  return controllerWidgetTextRenderOptions(element?.artCompositionId, text);
}

function layoutTextDefault(element: Dict | null): string {
  const id = normalizeTextTargetId(element?.id);
  if (element?.defaultText !== undefined && String(element.defaultText).length) return String(element.defaultText);
  if (id === "roundintrotext") return "Round One";
  if (id === "roundintroinfotext") return "Additional round info";
  if (id === "stageprompttext") return "Prompt Text";
  if (id === "stagepresentationtext") return "";
  return String(element?.name || "");
}

function createLayoutGameObjectRegistry(visibilityOverrides: Map<string, boolean>, visualOptions: Dict = {}): Dict | null {
  const gameObjects = (w().PartyGameGameObject || w().PartyGameStageGameObject) as { createRegistry?: (o: Dict) => Dict } | undefined;
  return typeof gameObjects?.createRegistry === "function" ? gameObjects.createRegistry({ visibilityOverrides, visualOptions }) : null;
}

function stageLayoutGameObjectRegistry(): Dict | null {
  if (stageLayoutGameObjects) return stageLayoutGameObjects;
  stageLayoutGameObjects = createLayoutGameObjectRegistry(stageLayoutGameObjectVisibilityOverrides, {
    hiddenClasses: ["stage-layout-visual-hidden", "hidden"], motionHiddenClasses: ["stage-layout-visual-hidden", "hidden"], exitingClass: "stage-layout-visual-exiting", updateClass: "stage-layout-visual-update", instantClass: "stage-layout-visual-instant"
  });
  return stageLayoutGameObjects;
}

function controllerLayoutGameObjectRegistry(): Dict | null {
  if (!controllerLayoutGameObjects) {
    controllerLayoutGameObjects = createLayoutGameObjectRegistry(controllerLayoutVisibilityOverrides, {
      hiddenClasses: ["controller-layout-visual-hidden", "hidden"], motionHiddenClasses: ["controller-layout-visual-hidden", "hidden"], exitingClass: "", updateClass: "", instantClass: "", layoutHiddenClasses: ["controller-layout-hidden"]
    });
  }
  return controllerLayoutGameObjects;
}

async function loadStageLayouts(options: { forceServer?: boolean } = {}): Promise<LayoutCollection> {
  const { forceServer = false } = options;
  if (w().runtimeTestLayouts && !forceServer) {
    w().stageLayouts = w().runtimeTestLayouts as LayoutCollection;
    return w().stageLayouts;
  }
  if (!w().canUseServer) return w().stageLayouts;
  const toolContext = w().PartyGameToolContext as { api?: { layout?: { loadStageLayouts?: () => Promise<Dict> } } } | undefined;
  const result = (await (toolContext?.api?.layout?.loadStageLayouts?.() || w().getJson!("/api/stage-layouts"))) as Dict;
  w().stageLayouts = (result.layouts as LayoutCollection) || w().stageLayouts;
  return w().stageLayouts;
}

async function loadControllerLayouts(options: { forceServer?: boolean } = {}): Promise<LayoutCollection> {
  const { forceServer = false } = options;
  if (w().runtimeTestControllerLayouts && !forceServer) {
    w().controllerLayouts = w().runtimeTestControllerLayouts as LayoutCollection;
    return w().controllerLayouts;
  }
  if (!w().canUseServer) return w().controllerLayouts;
  const toolContext = w().PartyGameToolContext as { api?: { layout?: { loadControllerLayouts?: () => Promise<Dict> } } } | undefined;
  const result = (await (toolContext?.api?.layout?.loadControllerLayouts?.() || w().getJson!("/api/controller-layouts"))) as Dict;
  w().controllerLayouts = (result.layouts as LayoutCollection) || w().controllerLayouts;
  return w().controllerLayouts;
}

function stageLayoutState(stateId: string): Dict | null {
  return (w().stageLayouts.states || []).find((state) => state.id === stateId) || null;
}

function globalStageLayout(): Dict {
  return w().stageLayouts.global || { id: "global", name: "Global Layout", elements: [] };
}

function controllerLayoutState(stateId: string): Dict | null {
  return (w().controllerLayouts.states || []).find((state) => state.id === stateId) || null;
}

function globalControllerLayout(): Dict {
  return w().controllerLayouts.global || { id: "global", name: "Global Layout", elements: [] };
}

function controllerLayoutStateForPhase(phase: string): Dict | null {
  const controllerState = w().controllerState as Dict | null;
  if (!controllerState) return controllerLayoutState("join") || (w().controllerLayouts.states || [])[0] || null;
  if (isSemanticControllerLayoutStateId(phase)) {
    const semanticState = controllerLayoutState(phase);
    if (semanticState) return semanticState;
  }
  const selectedLayoutId = ((controllerState?.lobby as Dict)?.controllerLayoutId as string) || "";
  const preferred = selectedLayoutId || (phase === "starting" ? "lobby" : phase || "lobby");
  return controllerLayoutState(preferred) || controllerLayoutState("lobby") || (w().controllerLayouts.states || [])[0] || null;
}

function allControllerLayoutSelectors(): Set<string> {
  const selectors = new Set<string>();
  for (const element of (globalControllerLayout().elements as Dict[]) || []) {
    if (element.selector) selectors.add(element.selector as string);
  }
  for (const state of w().controllerLayouts.states || []) {
    for (const element of (state.elements as Dict[]) || []) {
      if (element.selector) selectors.add(element.selector as string);
    }
  }
  return selectors;
}

function activeLayoutElementTokens(state: Dict, globalLayout: Dict): Set<string> {
  const tokens = new Set<string>();
  for (const element of (state.elements as Dict[]) || []) {
    if (element.id) tokens.add(`moment:${element.id}`);
  }
  if (globalLayout.hiddenInStates === true) return tokens;
  const hiddenGlobals = new Set((state.hiddenGlobals as string[]) || []);
  for (const element of (globalLayout.elements as Dict[]) || []) {
    if (element.id && !hiddenGlobals.has(element.id as string)) tokens.add(`global:${element.id}`);
  }
  return tokens;
}

function controllerLayoutTargetToken(target: El): string {
  const elementId = target.dataset.controllerLayoutElementId || "";
  return elementId ? `${target.classList.contains("controller-global-layout-target") ? "global" : "moment"}:${elementId}` : "";
}

function currentControllerLayoutTokens(): Set<string> {
  const tokens = new Set<string>();
  for (const node of Array.from(w().controllerPanel.querySelectorAll(".controller-layout-target"))) {
    const token = controllerLayoutTargetToken(node as El);
    if (token) tokens.add(token);
  }
  return tokens;
}

function clearControllerLayoutTargets(retainedTokens: Set<string> = new Set()): void {
  const controllerPanel = w().controllerPanel;
  const targets = new Set<El>(Array.from(controllerPanel.querySelectorAll(".controller-layout-target")) as El[]);
  for (const selector of allControllerLayoutSelectors()) {
    const target = controllerPanel.querySelector(selector) as El | null;
    if (target) targets.add(controllerLayoutHostForExistingTarget(target));
  }
  for (const target of targets) {
    const targetToken = controllerLayoutTargetToken(target);
    if (targetToken && retainedTokens.has(targetToken)) continue;
    const elementId = target.dataset.controllerLayoutElementId || "";
    if (elementId) {
      deactivateLayoutEntity(controllerLayoutEntityForElementId(elementId, target));
    }
    if (target.classList.contains("controller-dynamic-text")) {
      target.remove();
      continue;
    }
    if (elementId) clearControllerArtInstanceRenderer(elementId, target);
    target.classList.remove("controller-layout-target", "controller-widget-art-host", "has-controller-widget-art", "controller-layout-visual-hidden", "controller-layout-visual-exiting", "controller-layout-visual-update", "controller-layout-visual-instant", "controller-layout-transition-suppressed", "controller-global-layout-target");
    target.classList.add("controller-layout-hidden");
    for (const prop of ["--controller-layout-x", "--controller-layout-y", "--controller-layout-w", "--controller-layout-h", "--controller-layout-scale", "--controller-layout-rotation", "--controller-text-color", "--controller-text-font-size", "color", "font-size"]) {
      target.style.removeProperty(prop);
    }
    delete target.dataset.controllerLayoutElementId;
    delete target.dataset.controllerLayoutArtCompositionId;
    delete target.dataset.controllerLayoutVisibilityKey;
  }
}

function applyControllerLayoutForPhase(phase: string): void {
  const controllerScreen = w().controllerScreen;
  const controllerPanel = w().controllerPanel;
  if (!controllerScreen || !controllerPanel) return;
  const state = controllerLayoutStateForPhase(phase);
  if (!state) return;
  const previousTokens = currentControllerLayoutTokens();
  const retainedTokens = activeLayoutElementTokens(state, globalControllerLayout());
  (controllerLayoutGameObjectRegistry() as { beginFrame?: () => void } | null)?.beginFrame?.();
  removeInactiveControllerArtInstances(activeControllerArtInstanceIds(state));
  clearControllerLayoutTargets(retainedTokens);
  currentControllerLayoutStateId = state.id as string;
  const canvas = w().controllerLayouts.canvas || { width: 390, height: 844 };
  const screenRect = controllerScreen.getBoundingClientRect();
  const fitScale = Math.min(screenRect.width / canvas.width!, screenRect.height / canvas.height!);
  controllerPanel.style.width = `${canvas.width}px`;
  controllerPanel.style.height = `${canvas.height}px`;
  controllerPanel.style.setProperty("--controller-board-scale", `${fitScale}`);
  for (const element of (state.elements as Dict[]) || []) {
    applyControllerElementLayout(element, false, !previousTokens.has(`moment:${element.id}`));
  }
  const hiddenGlobals = new Set((state.hiddenGlobals as string[]) || []);
  const globalLayout = globalControllerLayout();
  if (globalLayout.hiddenInStates === true) return;
  for (const element of (globalLayout.elements as Dict[]) || []) {
    if (hiddenGlobals.has(element.id as string)) continue;
    applyControllerElementLayout(element, true, !previousTokens.has(`global:${element.id}`));
  }
}

function applyControllerElementLayout(element: Dict, isGlobal = false, shouldActivate = true): void {
  const target = controllerLayoutTargetElement(element);
  if (!target) return;
  const entity = registerControllerLayoutEntity(element, target, isGlobal);
  const isNewLayoutTarget = beginLayoutElementTargetApplication(target, {
    targetClass: "controller-layout-target", hiddenClass: "controller-layout-hidden", suppressedClass: "controller-layout-transition-suppressed"
  });
  target.classList.toggle("controller-global-layout-target", isGlobal);
  target.dataset.controllerLayoutElementId = (entity.id as string) || "";
  target.dataset.controllerLayoutArtCompositionId = (element.artCompositionId as string) || "";
  target.dataset.controllerLayoutVisibilityKey = (entity.visibilityKey as string) || "";
  applyLayoutElementBoxStyles(target, element, "controller");
  if (element.kind === "text") {
    applyControllerLayoutTextProperties(target, element);
  } else if (isControllerLayoutArtElement(element)) {
    target.classList.add("controller-widget-art-host", "has-controller-widget-art");
    attachRenderedLayoutArtEntity(
      entity,
      () =>
        renderControllerArtInstance(element, target, entity.visibilityKey as string, {
          ...controllerLayoutArtRenderOptions(element, target),
          keepElements: controllerLayoutArtKeepElements(target)
        }),
      { initializeVisibility: false }
    );
  }
  if (shouldActivate) activateLayoutEntity(entity, { visibilityOverrides: controllerLayoutVisibilityOverrides });
  finishLayoutElementTargetApplication(target, isNewLayoutTarget, "controller-layout-transition-suppressed");
}

const registerControllerLayoutEntity = createPlacedLayoutEntityRegistrar({
  registry: controllerLayoutGameObjectRegistry,
  registryKeyFor: controllerLayoutRegistryKeyForElement,
  visibilityKeyFor: controllerLayoutVisibilityKey,
  isArt: (layoutElement: Dict | null) => layoutElement?.kind === "art" || Boolean(layoutElement?.artCompositionId),
  isDynamic: (layoutElement: Dict | null, layoutTarget: El | null) =>
    isDynamicControllerArtInstance(layoutElement) || (layoutElement?.kind === "text" && !layoutElementTargetMatchesSelector(layoutElement, layoutTarget))
});

function controllerLayoutVisibilityKey(elementId: string, isGlobal: boolean | string = false): string {
  if (!elementId) return "";
  return `${isGlobal ? "global" : currentControllerLayoutStateId || "controller"}:${elementId}`;
}

function controllerLayoutRegistryKeyForElement(elementId: string, scopeOrGlobal: boolean | string = "", target: El | null = null): string {
  if (scopeOrGlobal === true || scopeOrGlobal === "global") return controllerLayoutVisibilityKey(elementId, true);
  if (scopeOrGlobal === false || scopeOrGlobal === "moment" || scopeOrGlobal === "controller") return controllerLayoutVisibilityKey(elementId, false);
  return controllerLayoutVisibilityKey(elementId, target?.classList?.contains("controller-global-layout-target") === true);
}

function controllerLayoutTargetByElementId(elementId: string, scope = ""): El | null {
  return layoutTargetByElementId({
    root: w().controllerPanel, elementId, layoutAttribute: "data-controller-layout-element-id", dynamicSelector: ".dynamic-controller-art-instance", globalClass: "controller-global-layout-target", scope
  });
}

function controllerLayoutElementVisibilityKey(elementId: string, target: El | null = null, scope = ""): unknown {
  return layoutElementVisibilityKey(elementId, target, {
    visibilityDatasetKey: "controllerLayoutVisibilityKey", scope,
    currentElements: () => (controllerLayoutState(currentControllerLayoutStateId)?.elements as Dict[]) || [],
    globalElements: () => (globalControllerLayout().elements as Dict[]) || [],
    keyFor: controllerLayoutVisibilityKey
  });
}

const controllerLayoutGameObjectTargets = createPlacedLayoutGameObjectTargetResolver({
  registry: controllerLayoutGameObjectRegistry, targetByElementId: controllerLayoutTargetByElementId, visibilityKeyForTarget: controllerLayoutElementVisibilityKey,
  registryKeyFor: controllerLayoutRegistryKeyForElement, visibilityOverrides: controllerLayoutVisibilityOverrides, hiddenClass: "controller-layout-visual-hidden", exitingClass: "controller-layout-visual-exiting",
  isGameObjectArtTarget: (t: El) => Boolean(t.dataset.controllerLayoutArtCompositionId) || t.classList.contains("dynamic-controller-art-instance"),
  isDynamicTarget: (t: El) => t.classList.contains("dynamic-controller-art-instance"),
  isGlobalTarget: (t: El) => t.classList.contains("controller-global-layout-target")
});

function controllerLayoutEntityForElementId(elementId: string, target: El | null = null, scope = ""): Dict | null {
  return controllerLayoutGameObjectTargets.entityForElementId(elementId, target, scope);
}

function setControllerLayoutGameObjectShownForAction(action: Dict): unknown {
  return controllerLayoutGameObjectTargets.setShownForAction(action);
}

function setControllerLayoutArtElementShownForAction(action: Dict): unknown {
  return setControllerLayoutGameObjectShownForAction(action);
}

function playControllerLayoutGameObjectAnimationForAction(action: Dict, options: Dict = {}): unknown {
  return playLayoutEntityAnimationForAction(action, {
    entityForElementId: controllerLayoutGameObjectTargets.entityForElementId,
    visibilityKeyForTarget: controllerLayoutGameObjectTargets.visibilityKeyForTarget,
    returnResult: options.returnResult === true,
    suppressMissingWarning: options.suppressMissingWarning === true
  });
}

function applyControllerLayoutGameObjectVisibilityOverride(entity: Dict): void {
  controllerLayoutGameObjectTargets.applyVisibilityOverride(entity);
}

function applyControllerLayoutArtVisibilityOverride(entity: Dict): void {
  applyControllerLayoutGameObjectVisibilityOverride(entity);
}

function layoutDefaultText(element: Dict | null): string {
  const id = String(element?.id || "").toLowerCase();
  const existing = element?.defaultText;
  if (existing !== undefined && existing !== null && String(existing).length) return String(existing);
  if (id === "waitingstatus") return "Waiting for Ava to start the game";
  if (id === "joinprompt") return "Join the Lobby at bit.ly/popcontroller";
  if (id === "stagepresentationtext") return "This is test number 1";
  if (id === "stageprompttext") return "Prompt Text";
  if (id === "roundintrotext") return "Round One";
  if (id === "roundintroinfotext") return "Additional round info";
  if (id === "jointitle") return "Join Lobby";
  if (id === "controllerplayername") return "Ava";
  if (id === "controllermeta") return "VIP Player";
  if (id === "controllerintromessage") return "Welcome to the Game";
  return String(element?.name || "");
}

function controllerLayoutComputedFontSize(element: Dict, textOverride: unknown = NO_OVERRIDE): number {
  const baseSize = Number(element.fontSize || 42);
  if (element.autoFitText === false) return baseSize;
  const text = textOverride !== NO_OVERRIDE ? String(textOverride ?? "") : layoutDefaultText(element);
  return fittedLayoutTextSize(element, text, baseSize);
}

function applyControllerLayoutTextProperties(target: El, element: Dict): void {
  const fontColor = normalizeUiColor(element.fontColor) || "#17131f";
  const text = target.dataset.textFitSource ?? layoutDefaultText(element);
  const baseSize = Number(element.fontSize || 42);
  const textFit = w().PartyGameTextFit as TextFitApi | undefined;
  const layout =
    typeof textFit?.renderLayoutTextField === "function"
      ? textFit.renderLayoutTextField(target, element, {
          text, defaults: { surface: "controller", defaultText: layoutDefaultText(element), fontSize: baseSize, fontColor }, fallbackSize: baseSize, renderOptions: { padding: textFieldPadding(element) }
        })
      : null;
  const fontSize = `${layout?.fontSize || controllerLayoutComputedFontSize(element, text)}px`;
  target.style.setProperty("--controller-text-color", fontColor);
  target.style.setProperty("--controller-text-font-size", fontSize);
  target.style.setProperty("color", fontColor, "important");
  target.style.setProperty("font-size", fontSize, "important");
}

function controllerLayoutElementForTarget(target: El | null): Dict | null {
  if (!target) return null;
  const layoutTarget = target.closest("[data-controller-layout-element-id]") as El | null;
  const elementId = layoutTarget?.dataset?.controllerLayoutElementId || target.dataset?.controllerLayoutElementId || "";
  if (!elementId) return null;
  const stateElements = (controllerLayoutState(currentControllerLayoutStateId)?.elements as Dict[]) || [];
  const globalElements = (globalControllerLayout().elements as Dict[]) || [];
  return stateElements.find((element) => element.id === elementId) || globalElements.find((element) => element.id === elementId) || null;
}

function setControllerLayoutText(target: El | string | null, value: unknown): void {
  if (!target) return;
  if (typeof target === "string") {
    const elementId = normalizeTextTargetId(target);
    const host = controllerLayoutTargetByElementId(elementId, "controller") || controllerLayoutTargetByElementId(elementId);
    const element = controllerLayoutElementForId(elementId);
    if (!host || !element) return;
    host.dataset.textFitSource = String(value ?? "");
    if (isLayoutTextArtElement(element)) {
      renderControllerArtInstance(element, host, host.dataset.controllerLayoutVisibilityKey || controllerLayoutVisibilityKey(element.id as string), layoutTextArtRenderOptions(element, value));
    }
    return;
  }
  const text = String(value ?? "");
  const element = controllerLayoutElementForTarget(target);
  const host = (target.closest("[data-controller-layout-element-id]") as El | null) || target;
  target.dataset.textFitSource = text;
  host.dataset.textFitSource = text;
  const textFit = w().PartyGameTextFit as TextFitApi | undefined;
  if (element?.kind === "text" && typeof textFit?.renderLayoutTextField === "function") {
    applyControllerLayoutTextProperties(target, element);
  } else if (isControllerLayoutArtElement(element)) {
    renderControllerArtInstance(element, host, host.dataset.controllerLayoutVisibilityKey || controllerLayoutVisibilityKey(element.id as string), {
      ...controllerWidgetTextRenderOptions(element?.artCompositionId, text),
      keepElements: controllerLayoutArtKeepElements(host)
    });
  } else if (typeof textFit?.renderRuntimeText === "function") {
    textFit.renderRuntimeText(target, text, {
      width: target.clientWidth || target.offsetWidth || 1, height: target.clientHeight || target.offsetHeight || 1, fontSize: Number.parseFloat(w().getComputedStyle?.(target)?.fontSize as string) || 16, autoFitText: false
    });
  } else {
    target.textContent = text;
  }
}

function setControllerLayoutButtonText(target: El | null, value: unknown, spec: Dict = {}): boolean {
  if (!target) return false;
  const compositionId = controllerWidgetArtCompositionIdForTarget(target);
  if (!compositionId) return false;
  const text = String(value ?? "");
  target.dataset.controllerTextValue = text;
  target.dataset.controllerLayoutArtCompositionId = compositionId;
  target.setAttribute("aria-label", text);
  target.classList.add("controller-widget-art-host", "has-controller-widget-art");
  const element: Dict = {
    id: target.dataset.optionId || target.id || controllerRuntimeArtRendererKey(target, "controller-button"),
    kind: "art",
    artCompositionId: compositionId,
    width: Number(spec.width || target.clientWidth || target.offsetWidth || 300),
    height: Number(spec.height || target.clientHeight || target.offsetHeight || 78),
    scale: 1,
    defaultAnimationState: "on"
  };
  const renderer = renderControllerArtInstance(element, target, controllerRuntimeArtRendererKey(target, "controller-button"), {
    ...controllerWidgetTextRenderOptions(compositionId, text),
    keepElements: controllerLayoutArtKeepElements(target)
  });
  if (renderer) {
    setControllerButtonDisabledState(target, target.matches(":disabled"));
    return true;
  }
  target.classList.remove("controller-widget-art-host", "has-controller-widget-art");
  return false;
}

const controllerButtonInteractionAnimations = new Set(["Default", "Down", "Up", "HoverIn", "HoverOut"]);

function playControllerButtonInteraction(target: El | null, animation: unknown): number {
  if (!target) return 0;
  const compositionId = controllerWidgetArtCompositionIdForTarget(target);
  const cleanAnimation = String(animation || "").trim();
  if (!compositionId || !controllerButtonInteractionAnimations.has(cleanAnimation)) return 0;
  const renderer = artRendererForLayoutHost(target);
  return renderer?.playComponent?.(`${compositionId}-interaction-ref`, cleanAnimation, { instant: false }) || 0;
}

function setControllerButtonDisabledState(target: El | null, disabled: boolean): number {
  if (!target) return 0;
  const compositionId = controllerWidgetArtCompositionIdForTarget(target);
  if (!compositionId) return 0;
  const renderer = artRendererForLayoutHost(target);
  return renderer?.stopAtComponent?.(`${compositionId}-state-ref`, disabled ? "Disabled" : "Default", { instant: true }) || 0;
}

function controllerLayoutElementForId(elementId: string): Dict | null {
  const normalized = normalizeTextTargetId(elementId);
  const stateElements = (controllerLayoutState(currentControllerLayoutStateId)?.elements as Dict[]) || [];
  const globalElements = (globalControllerLayout().elements as Dict[]) || [];
  return stateElements.find((element) => normalizeTextTargetId(element.id) === normalized) || globalElements.find((element) => normalizeTextTargetId(element.id) === normalized) || null;
}

function setControllerLayoutTextShown(elementId: string, isShown: boolean, options: Dict = {}): number {
  if (!elementId) return 0;
  return (setControllerLayoutGameObjectShownForAction({
    targetLayoutElementId: normalizeTextTargetId(elementId), targetLayoutScope: "controller", targetLayoutSurface: "controller", isShown: isShown !== false, instant: options.instant === true
  }) as number) || 0;
}

function isControllerLayoutArtElement(element: Dict | null): element is Dict {
  return Boolean(element?.artCompositionId && element?.kind === "art");
}

function controllerCanHostArtChildren(target: El | null): boolean {
  const tag = target?.tagName?.toLowerCase() || "";
  return !["input", "textarea", "select", "img", "canvas"].includes(tag);
}

function controllerLayoutHostForExistingTarget(target: El): El {
  return (target.closest("[data-controller-art-selector-host-for]") as El | null) || target;
}

function controllerLayoutArtHost(element: Dict, target: El | null): El | null {
  if (!target || controllerCanHostArtChildren(target)) return target;
  const controllerPanel = w().controllerPanel;
  const hostId = String(element.id || "");
  const existingHost = target.closest("[data-controller-art-selector-host-for]") as El | null;
  if (existingHost) return existingHost;
  const host = document.createElement("div");
  host.className = "controller-widget-art-selector-host controller-widget-art-host";
  host.dataset.controllerArtSelectorHostFor = hostId;
  target.parentElement?.insertBefore(host, target);
  host.appendChild(target);
  target.classList.add("controller-widget-art-overlay");
  target.dataset.controllerArtOverlayFor = hostId;
  return controllerPanel.contains(host) ? host : target;
}

function controllerLayoutArtKeepElements(host: El | null): El[] {
  if (!host) return [];
  const kept = Array.from(
    host.querySelectorAll(
      ":scope > input, :scope > textarea, :scope > select, :scope > .controller-widget-art-overlay, :scope > .player-avatar, :scope > .controller-player-banner-name"
    )
  ) as El[];
  return kept.filter((element) => element.parentElement === host);
}

function controllerLayoutTargetElement(element: Dict): El | null {
  const controllerPanel = w().controllerPanel;
  if (isDynamicControllerArtInstance(element)) return getOrCreateControllerArtInstance(element);
  const target = controllerPanel.querySelector(element.selector as string) as El | null;
  if (target && isControllerLayoutArtElement(element)) return controllerLayoutArtHost(element, target);
  if (target || element.kind !== "text") return target;
  const id = String(element.selector || "").replace(/^#/, "") || (element.id as string);
  let dynamic = controllerPanel.querySelector(`#${CSS.escape(id)}`) as El | null;
  if (!dynamic) {
    dynamic = document.createElement("div");
    dynamic.id = id;
    dynamic.className = "controller-dynamic-text";
    controllerPanel.appendChild(dynamic);
  }
  return dynamic;
}

const controllerArtInstanceRenderers = new Map();
const controllerDynamicArtInstances = createDynamicLayoutArtInstanceApi({
  root: () => w().controllerPanel, selector: ".dynamic-controller-art-instance", className: "dynamic-controller-art-instance controller-widget-art-host", renderers: controllerArtInstanceRenderers, layerClassName: "controller-widget-art-layer", missingDatasetKey: "controllerLayoutArtMissing"
});

function isDynamicControllerArtInstance(element: Dict | null): boolean {
  return Boolean(element?.artCompositionId && !element.selector);
}

function activeControllerArtInstanceIds(state: Dict): Set<string> {
  return activeDynamicLayoutArtInstanceIds(state, globalControllerLayout(), isDynamicControllerArtInstance);
}

function removeInactiveControllerArtInstances(activeIds: Set<string>): void {
  controllerDynamicArtInstances.removeInactive(activeIds, controllerLayoutGameObjectRegistry());
}

function getOrCreateControllerArtInstance(element: Dict): El | null {
  return controllerDynamicArtInstances.getOrCreate(element);
}

function renderControllerArtInstance(element: Dict, host: El, rendererKey = "", renderOptions: Dict = {}): unknown {
  return controllerDynamicArtInstances.render(element, host, rendererKey, renderOptions);
}

function clearControllerArtInstanceRenderer(elementId: string, host: El | null = null): void {
  controllerDynamicArtInstances.clear(elementId, host);
}

function stageLayoutStateForPhase(phase: string): Dict | null {
  const preferred = phase === "starting" ? "lobby" : phase === "intro" ? "intro" : phase || "lobby";
  return stageLayoutState(preferred) || stageLayoutState("lobby") || (w().stageLayouts.states || [])[0] || null;
}

function allStageLayoutSelectors(): Set<string> {
  const selectors = new Set<string>();
  for (const element of (globalStageLayout().elements as Dict[]) || []) {
    if (element.selector) selectors.add(element.selector as string);
  }
  for (const state of w().stageLayouts.states || []) {
    for (const element of (state.elements as Dict[]) || []) {
      if (element.selector) selectors.add(element.selector as string);
    }
  }
  return selectors;
}

const stageArtInstanceRenderers = new Map();
const stageDynamicArtInstances = createDynamicLayoutArtInstanceApi({
  root: () => w().stageBoard, selector: ".dynamic-stage-art-instance", className: "dynamic-stage-art-instance stage-widget-art-host has-stage-widget-art", renderers: stageArtInstanceRenderers, layerClassName: "stage-widget-art-layer", missingDatasetKey: "stageLayoutArtMissing"
});

function activeStageArtInstanceIds(state: Dict): Set<string> {
  return activeDynamicLayoutArtInstanceIds(state, globalStageLayout(), isDynamicStageArtInstance);
}

function removeInactiveStageArtInstances(activeIds: Set<string>): void {
  stageDynamicArtInstances.removeInactive(activeIds, stageLayoutGameObjectRegistry());
}

function stageLayoutTargetToken(target: El): string {
  const elementId = target.dataset.stageLayoutElementId || "";
  return elementId ? `${target.classList.contains("stage-global-layout-target") ? "global" : "moment"}:${elementId}` : "";
}

function currentStageLayoutTokens(): Set<string> {
  const tokens = new Set<string>();
  for (const node of Array.from(w().stageBoard.querySelectorAll(".stage-layout-target"))) {
    const token = stageLayoutTargetToken(node as El);
    if (token) tokens.add(token);
  }
  return tokens;
}

function clearStageLayoutTargets(retainedTokens: Set<string> = new Set()): void {
  const stageBoard = w().stageBoard;
  const targets = new Set<El>(Array.from(stageBoard.querySelectorAll(".stage-layout-target")) as El[]);
  for (const selector of allStageLayoutSelectors()) {
    const target = stageBoard.querySelector(selector) as El | null;
    if (target) targets.add(target);
  }
  for (const target of targets) {
    const targetToken = stageLayoutTargetToken(target);
    if (targetToken && retainedTokens.has(targetToken)) continue;
    const elementId = target.dataset.stageLayoutElementId || "";
    if (elementId) {
      deactivateLayoutEntity(stageLayoutEntityForElementId(elementId, target));
    }
    target.classList.remove("stage-layout-target", "stage-global-layout-target", "stage-layout-hidden", "stage-layout-visual-update", "stage-layout-visual-instant", "stage-layout-transition-suppressed");
    for (const prop of ["--stage-layout-x", "--stage-layout-y", "--stage-layout-w", "--stage-layout-h", "--stage-layout-scale", "--stage-layout-rotation", "--stage-object-visible-scale", "--stage-text-color", "--stage-text-font-size", "color", "font-size"]) {
      target.style.removeProperty(prop);
    }
    delete target.dataset.stageLayoutElementId;
    delete target.dataset.stageLayoutArtCompositionId;
    delete target.dataset.stageLayoutVisibilityKey;
  }
}

function applyStageLayoutForPhase(phase: string): void {
  const stageScreen = w().stageScreen;
  const stageBoard = w().stageBoard;
  const state = stageLayoutStateForPhase(phase);
  if (!state || !stageScreen || !stageBoard) return;
  const previousTokens = currentStageLayoutTokens();
  const retainedTokens = activeLayoutElementTokens(state, globalStageLayout());
  (stageLayoutGameObjectRegistry() as { beginFrame?: () => void } | null)?.beginFrame?.();
  clearStageLayoutTargets(retainedTokens);
  w().currentStageLayoutStateId = state.id as string;
  removeInactiveStageArtInstances(activeStageArtInstanceIds(state));
  const canvas = w().stageLayouts.canvas || { width: 1920, height: 1080 };
  const stageRect = stageScreen.getBoundingClientRect();
  const fitScale = Math.min(stageRect.width / canvas.width!, stageRect.height / canvas.height!);
  stageBoard.style.width = `${canvas.width}px`;
  stageBoard.style.height = `${canvas.height}px`;
  stageBoard.style.setProperty("--stage-board-scale", `${fitScale}`);
  for (const element of (state.elements as Dict[]) || []) {
    applyStageElementLayout(element, false, !previousTokens.has(`moment:${element.id}`));
  }
  const hiddenGlobals = new Set((state.hiddenGlobals as string[]) || []);
  const globalLayout = globalStageLayout();
  if (globalLayout.hiddenInStates === true) {
    for (const element of (globalLayout.elements as Dict[]) || []) {
      const target = stageLayoutTargetElement(element);
      if (target) deactivateLayoutEntity(registerStageLayoutEntity(element, target, true));
    }
    return;
  }
  for (const element of (globalLayout.elements as Dict[]) || []) {
    if (hiddenGlobals.has(element.id as string)) {
      const target = stageLayoutTargetElement(element);
      if (target) deactivateLayoutEntity(registerStageLayoutEntity(element, target, true));
      continue;
    }
    applyStageElementLayout(element, true, !previousTokens.has(`global:${element.id}`));
  }
}

function resetStageMomentLayout(): void {
  const state = stageLayoutState(w().currentStageLayoutStateId);
  for (const element of (state?.elements as Dict[]) || []) {
    stageLayoutGameObjectVisibilityOverrides.delete(stageLayoutGameObjectVisibilityKey(element.id as string, false));
    const target = stageLayoutTargetElement(element);
    if (!target) continue;
    const entity = registerStageLayoutEntity(element, target, false);
    if (typeof entity?.stopAtAnimation === "function") {
      (entity.stopAtAnimation as (animation: string, options: Dict) => number)("Off", { instant: true });
      continue;
    }
    deactivateLayoutEntity(entity);
  }
}

function stageMomentLayoutReadiness(): Dict {
  const state = stageLayoutState(w().currentStageLayoutStateId);
  const missingElementIds = ((state?.elements as Dict[]) || [])
    .filter((element) => !stageLayoutTargetElement(element))
    .map((element) => String(element.id || ""))
    .filter(Boolean);
  return { ready: missingElementIds.length === 0, missingElementIds };
}

function applyStageElementLayout(element: Dict, isGlobal: boolean, shouldInitialize = true): void {
  const target = stageLayoutTargetElement(element);
  if (!target) return;
  const entity = registerStageLayoutEntity(element, target, isGlobal);
  const isNewLayoutTarget = beginLayoutElementTargetApplication(target, {
    targetClass: "stage-layout-target", hiddenClass: "stage-layout-hidden", suppressedClass: "stage-layout-transition-suppressed"
  });
  if (isGlobal) target.classList.add("stage-global-layout-target");
  target.dataset.stageLayoutElementId = (entity.id as string) || "";
  target.dataset.stageLayoutArtCompositionId = (element.artCompositionId as string) || "";
  target.dataset.stageLayoutVisibilityKey = entity.visibilityKey as string;
  applyLayoutElementBoxStyles(target, element, "stage");
  if (element.kind === "text") {
    applyStageLayoutTextProperties(target, element);
    registerStageLayoutTextTarget(element, target, isGlobal);
  } else if (isDynamicStageArtInstance(element)) {
    attachRenderedLayoutArtEntity(
      entity,
      () =>
        renderStageArtInstance(
          element,
          target,
          entity.visibilityKey as string,
          stageLayoutArtRenderOptions(element, target)
        ),
      { initializeVisibility: false }
    );
  }
  if (shouldInitialize) applyStageLayoutArtVisibilityOverride(entity);
  finishLayoutElementTargetApplication(target, isNewLayoutTarget, "stage-layout-transition-suppressed");
}

const registerStageLayoutEntity = createPlacedLayoutEntityRegistrar({
  registry: stageLayoutGameObjectRegistry,
  registryKeyFor: (id: string, globalTarget: boolean) => stageLayoutGameObjectVisibilityKey(id, globalTarget),
  visibilityKeyFor: stageLayoutGameObjectVisibilityKey,
  isArt: (layoutElement: Dict | null) => layoutElement?.kind === "art" && Boolean(layoutElement?.artCompositionId),
  isDynamic: isDynamicStageArtInstance
});

function applyStageLayoutGameObjectVisibilityOverride(entity: Dict): void {
  stageLayoutGameObjectTargets.applyVisibilityOverride(entity);
}

function applyStageLayoutArtVisibilityOverride(entity: Dict): void {
  applyStageLayoutGameObjectVisibilityOverride(entity);
}

function stageLayoutTargetByElementId(elementId: string, scope = ""): El | null {
  return layoutTargetByElementId({
    root: w().stageBoard, elementId, layoutAttribute: "data-stage-layout-element-id", dynamicSelector: ".dynamic-stage-art-instance", globalClass: "stage-global-layout-target", scope
  });
}

function stageLayoutElementVisibilityKey(elementId: string, target: El | null = null, scope = ""): unknown {
  return layoutElementVisibilityKey(elementId, target, {
    visibilityDatasetKey: "stageLayoutVisibilityKey", scope,
    currentElements: () => (stageLayoutState(w().currentStageLayoutStateId)?.elements as Dict[]) || [],
    globalElements: () => (globalStageLayout().elements as Dict[]) || [],
    keyFor: stageLayoutGameObjectVisibilityKey
  });
}

function stageLayoutGameObjectVisibilityKey(elementId: string, isGlobal: boolean | string = false): string {
  if (!elementId) return "";
  return `${isGlobal ? "global" : w().currentStageLayoutStateId || "moment"}:${elementId}`;
}

function stageLayoutRegistryKeyForElement(elementId: string, scope: boolean | string = "", target: El | null = null): string {
  if (scope === "global") return stageLayoutGameObjectVisibilityKey(elementId, true);
  if (scope === "moment") return stageLayoutGameObjectVisibilityKey(elementId, false);
  return stageLayoutGameObjectVisibilityKey(elementId, target?.classList?.contains("stage-global-layout-target") === true);
}

const stageLayoutGameObjectTargets = createPlacedLayoutGameObjectTargetResolver({
  registry: stageLayoutGameObjectRegistry, targetByElementId: stageLayoutTargetByElementId, visibilityKeyForTarget: stageLayoutElementVisibilityKey, registryKeyFor: stageLayoutRegistryKeyForElement,
  visibilityOverrides: stageLayoutGameObjectVisibilityOverrides, hiddenClass: "stage-layout-visual-hidden", exitingClass: "stage-layout-visual-exiting",
  isGameObjectArtTarget: (t: El) => Boolean(t.dataset.stageLayoutArtCompositionId),
  isDynamicTarget: (t: El) => t.classList.contains("dynamic-stage-art-instance"),
  isGlobalTarget: (t: El) => t.classList.contains("stage-global-layout-target")
});

function stageLayoutEntityForElementId(elementId: string, target: El | null = null, scope = ""): Dict | null {
  return stageLayoutGameObjectTargets.entityForElementId(elementId, target, scope);
}

function setStageLayoutGameObjectShownForAction(action: Dict, options: Dict = {}): unknown {
  const surface = String(action?.targetLayoutSurface || "stage").toLowerCase();
  if (surface !== "stage") {
    const reason = `target layout surface ${surface} is not handled by the stage runner`;
    const warning = { elementId: action?.targetLayoutElementId || "", name: action?.name || action?.actionName || "", scope: action?.targetLayoutScope || "", reason };
    const debug = w().PartyGameStageDebugRuntime;
    if (typeof debug?.showGameObjectWarning === "function") debug.showGameObjectWarning(warning);
    else debug?.showArtAssetWarning?.(warning);
    return options.returnResult ? { duration: 0, missing: true, reason } : 0;
  }
  return stageLayoutGameObjectTargets.setShownForAction(action, options);
}

function setStageLayoutArtElementShownForAction(action: Dict, options: Dict = {}): unknown {
  return setStageLayoutGameObjectShownForAction(action, options);
}

function playStageLayoutGameObjectAnimationForAction(action: Dict, options: Dict = {}): unknown {
  const surface = String(action?.targetLayoutSurface || "stage").toLowerCase();
  if (surface !== "stage") {
    const reason = `target layout surface ${surface} is not handled by the stage runner`;
    const warning = { elementId: action?.targetLayoutElementId || "", name: action?.name || action?.actionName || "", scope: action?.targetLayoutScope || "", reason };
    const debug = w().PartyGameStageDebugRuntime;
    if (typeof debug?.showGameObjectWarning === "function") debug.showGameObjectWarning(warning);
    else debug?.showArtAssetWarning?.(warning);
    return options.returnResult ? { duration: 0, missing: true, reason } : 0;
  }
  return stageLayoutGameObjectTargets.playAnimationForAction(action, options);
}

function stageLayoutTargetElement(element: Dict): El | null {
  const stageBoard = w().stageBoard;
  if (isDynamicStageArtInstance(element)) return getOrCreateStageArtInstance(element);
  if (element.kind !== "text") return stageBoard.querySelector(element.selector as string);
  const dynamicId = dynamicStageTextElementId(element);
  const selectorTarget = stageBoard.querySelector(element.selector as string) as El | null;
  const selectorId = normalizeTextTargetId(String(element.selector || "").replace(/^#/, ""));
  const elementId = normalizeTextTargetId(element.id);
  const shouldUseDynamicTextTarget = elementId && selectorId && selectorId !== elementId;
  if (!shouldUseDynamicTextTarget && selectorTarget) return selectorTarget;
  return getOrCreateDynamicStageTextElement(dynamicId || elementId || selectorId);
}

function isDynamicStageArtInstance(element: Dict | null): boolean {
  return Boolean(element?.artCompositionId && !element.selector);
}

function getOrCreateStageArtInstance(element: Dict): El | null {
  return stageDynamicArtInstances.getOrCreate(element);
}

function renderStageArtInstance(element: Dict, host: El, rendererKey = "", renderOptions: Dict = {}): unknown {
  return stageDynamicArtInstances.render(element, host, rendererKey, renderOptions);
}

function clearStageArtInstanceRenderer(elementId: string, host: El | null = null): void {
  stageDynamicArtInstances.clear(elementId, host);
}

function dynamicStageTextElementId(element: Dict | null): string {
  return normalizeTextTargetId(element?.id || element?.name || "");
}

function getOrCreateDynamicStageTextElement(id: string): El | null {
  if (!id) return null;
  const stageBoard = w().stageBoard;
  let element = stageBoard.querySelector(`#${CSS.escape(id)}`) as El | null;
  if (element) return element;
  element = document.createElement("div");
  element.id = id;
  element.className = "stage-dynamic-text text-hidden hidden";
  stageBoard.appendChild(element);
  return element;
}

function registerStageLayoutTextTarget(layoutElement: Dict, targetElement: El, isGlobal = false): void {
  const targetId = normalizeTextTargetId(layoutElement.id);
  if (!targetId || !targetElement) return;
  const stageTextObjects = w().stageTextObjects;
  const existing = stageTextObjects[targetId];
  const isExistingTarget = existing?.element === targetElement;
  const text = isExistingTarget ? existing.text : targetElement.dataset?.textFitSource ?? stageLayoutTextDefault(layoutElement);
  stageTextObjects[targetId] = {
    element: targetElement, layoutElement, isGlobal, visible: isExistingTarget ? existing.visible : targetElement.dataset.visualVisible === "true", text
  };
}

function stageLayoutTextDefault(element: Dict | null): string {
  const id = String(element?.id || "").toLowerCase();
  if (element?.defaultText !== undefined && String(element.defaultText).length) return String(element.defaultText);
  if (id === "roundintrotext") return "Round One";
  if (id === "roundintroinfotext") return "Additional round info";
  if (id === "stageprompttext") return "Prompt Text";
  if (id === "stagepresentationtext") return "";
  return String(element?.name || "");
}

function textFieldPadding(element: Dict | null): { x: number; y: number } {
  const id = String(element?.id || "").toLowerCase();
  if (id === "waitingstatus" || id === "joinprompt") return { x: 40, y: 24 };
  return { x: 0, y: 0 };
}

function fittedLayoutTextSize(element: Dict, text: unknown, fallbackSize: unknown): number {
  const textFit = w().PartyGameTextFit as TextFitApi | undefined;
  const layout = textFit?.measureGameText?.({ text, element, fallbackSize: fallbackSize || 58, options: { padding: textFieldPadding(element) } });
  if (layout) return Number(layout.fontSize || fallbackSize || 58);
  return Math.max(8, Number(fallbackSize || 58));
}

// PRESERVED: layout-runtime's own text-fit reassignment.
w().PartyGameTextFit = { ...((w().PartyGameTextFit as Dict) || {}), fittedLayoutTextSize } as never;
w().fittedLayoutTextSize = fittedLayoutTextSize as never;

function stageLayoutComputedFontSize(element: Dict, textOverride: unknown = NO_OVERRIDE): number {
  const baseSize = Number(element.fontSize || 58);
  if (element.autoFitText === false) return baseSize;
  const text = textOverride !== NO_OVERRIDE ? String(textOverride ?? "") : stageLayoutTextDefault(element);
  return fittedLayoutTextSize(element, text, baseSize);
}

function applyStageLayoutTextProperties(target: El, element: Dict): void {
  const fontColor = normalizeUiColor(element.fontColor) || "#ffffff";
  const text = target.dataset.textFitSource ?? stageLayoutTextDefault(element);
  const baseSize = Number(element.fontSize || 58);
  const textFit = w().PartyGameTextFit as TextFitApi | undefined;
  const layout =
    typeof textFit?.renderLayoutTextField === "function"
      ? textFit.renderLayoutTextField(target, element, {
          text, defaults: { surface: "stage", defaultText: stageLayoutTextDefault(element), fontSize: baseSize, fontColor }, fallbackSize: baseSize, renderOptions: { padding: textFieldPadding(element) }
        })
      : null;
  const fontSize = `${layout?.fontSize || stageLayoutComputedFontSize(element, text)}px`;
  target.style.setProperty("color", fontColor, "important");
  target.style.setProperty("font-size", fontSize, "important");
  target.style.setProperty("--stage-text-color", fontColor);
  target.style.setProperty("--stage-text-font-size", fontSize);
}

function stageLayoutElementForTarget(target: El | null): Dict | null {
  if (!target) return null;
  const elementId = target.dataset?.stageLayoutElementId || "";
  if (!elementId) return null;
  const stateElements = (stageLayoutState(w().currentStageLayoutStateId)?.elements as Dict[]) || [];
  const globalElements = (globalStageLayout().elements as Dict[]) || [];
  return stateElements.find((element) => element.id === elementId) || globalElements.find((element) => element.id === elementId) || null;
}

function setStageLayoutText(target: El | string | null, value: unknown): void {
  if (!target) return;
  const stageTextObjects = w().stageTextObjects;
  if (typeof target === "string") {
    const elementId = normalizeTextTargetId(target);
    const host = stageLayoutTargetByElementId(elementId, "moment") || stageLayoutTargetByElementId(elementId);
    const element = stageLayoutElementForId(elementId);
    if (!host || !element) return;
    host.dataset.textFitSource = String(value ?? "");
    if (isLayoutTextArtElement(element)) {
      renderStageArtInstance(element, host, host.dataset.stageLayoutVisibilityKey || stageLayoutGameObjectVisibilityKey(element.id as string), layoutTextArtRenderOptions(element, value));
      const targetId = normalizeTextTargetId(element.id);
      if (targetId && stageTextObjects[targetId]) stageTextObjects[targetId].text = String(value ?? "");
    } else if (isDynamicStageArtInstance(element)) {
      renderStageArtInstance(
        element,
        host,
        host.dataset.stageLayoutVisibilityKey || stageLayoutGameObjectVisibilityKey(element.id as string),
        labeledWidgetTextRenderOptions(value)
      );
    }
    return;
  }
  const text = String(value ?? "");
  const element = stageLayoutElementForTarget(target);
  target.dataset.textFitSource = text;
  const textFit = w().PartyGameTextFit as TextFitApi | undefined;
  if (element?.kind === "text" && typeof textFit?.renderLayoutTextField === "function") {
    applyStageLayoutTextProperties(target, element);
    const targetId = normalizeTextTargetId(element.id);
    if (targetId && stageTextObjects[targetId]) stageTextObjects[targetId].text = text;
  } else if (typeof textFit?.renderRuntimeText === "function") {
    textFit.renderRuntimeText(target, text, {
      width: target.clientWidth || target.offsetWidth || 1, height: target.clientHeight || target.offsetHeight || 1, fontSize: Number.parseFloat(w().getComputedStyle?.(target)?.fontSize as string) || 16, autoFitText: false
    });
  } else {
    target.textContent = text;
  }
}

function stageLayoutElementForId(elementId: string): Dict | null {
  const normalized = normalizeTextTargetId(elementId);
  const stateElements = (stageLayoutState(w().currentStageLayoutStateId)?.elements as Dict[]) || [];
  const globalElements = (globalStageLayout().elements as Dict[]) || [];
  return stateElements.find((element) => normalizeTextTargetId(element.id) === normalized) || globalElements.find((element) => normalizeTextTargetId(element.id) === normalized) || null;
}

// PRESERVED: PartyGameLayoutText install.
const PartyGameLayoutText = {
  ...((w().PartyGameLayoutText as Dict) || {}),
  setControllerButtonText: setControllerLayoutButtonText,
  playControllerButtonInteraction,
  setControllerButtonDisabledState,
  setControllerText: setControllerLayoutText,
  setControllerTextShown: setControllerLayoutTextShown,
  setStageText: setStageLayoutText
};
w().PartyGameLayoutText = PartyGameLayoutText as never;

// Install every top-level name on window so the still-legacy stage-runtime.js (which
// reads them as bare globals) keeps resolving them — replicating the classic script.
Object.assign(w(), {
  activeControllerArtInstanceIds, activeStageArtInstanceIds, allControllerLayoutSelectors, allStageLayoutSelectors,
  applyControllerElementLayout, applyControllerLayoutArtVisibilityOverride, applyControllerLayoutForPhase, applyControllerLayoutGameObjectVisibilityOverride, applyControllerLayoutTextProperties,
  applyStageElementLayout, applyStageLayoutArtVisibilityOverride, applyStageLayoutForPhase, applyStageLayoutGameObjectVisibilityOverride, applyStageLayoutTextProperties,
  clearControllerArtInstanceRenderer, clearControllerLayoutTargets, clearStageArtInstanceRenderer, clearStageLayoutTargets,
  compactLayoutTextId, controllerArtInstanceRenderers, controllerDynamicArtInstances, controllerLayoutComputedFontSize, controllerLayoutElementForId, controllerLayoutElementForTarget,
  controllerLayoutElementVisibilityKey, controllerLayoutEntityForElementId, controllerLayoutGameObjectRegistry, controllerLayoutGameObjectTargets, controllerLayoutRegistryKeyForElement,
  controllerLayoutState, controllerLayoutStateForPhase, controllerLayoutTargetByElementId, controllerLayoutTargetElement, controllerLayoutVisibilityKey, controllerLayoutVisibilityOverrides,
  createLayoutGameObjectRegistry, dynamicStageTextElementId, getOrCreateControllerArtInstance, getOrCreateDynamicStageTextElement, getOrCreateStageArtInstance,
  globalControllerLayout, globalStageLayout, isDynamicControllerArtInstance, isDynamicStageArtInstance, isLayoutTextArtElement,
  layoutDefaultText, layoutTextArtRenderOptions, layoutTextDefault, loadControllerLayouts, loadStageLayouts, normalizeTextTargetId,
  registerControllerLayoutEntity, registerStageLayoutEntity, registerStageLayoutTextTarget, removeInactiveControllerArtInstances, removeInactiveStageArtInstances, resetStageMomentLayout,
  renderControllerArtInstance, renderStageArtInstance, setControllerLayoutArtElementShownForAction, setControllerLayoutGameObjectShownForAction, setControllerLayoutText, setControllerLayoutTextShown,
  setControllerLayoutButtonText, playControllerLayoutGameObjectAnimationForAction,
  playControllerButtonInteraction, setControllerButtonDisabledState,
  playStageLayoutGameObjectAnimationForAction, setStageLayoutArtElementShownForAction, setStageLayoutGameObjectShownForAction, setStageLayoutText, stageArtInstanceRenderers, stageDynamicArtInstances,
  stageLayoutComputedFontSize, stageLayoutElementForId, stageLayoutElementForTarget, stageLayoutElementVisibilityKey, stageLayoutEntityForElementId, stageLayoutGameObjectRegistry,
  stageLayoutGameObjectTargets, stageLayoutGameObjectVisibilityKey, stageLayoutGameObjectVisibilityOverrides, stageLayoutRegistryKeyForElement, stageLayoutState, stageLayoutStateForPhase,
  stageLayoutTargetByElementId, stageLayoutTargetElement, stageLayoutTextDefault, stageMomentLayoutReadiness, textFieldPadding
});

export {};
