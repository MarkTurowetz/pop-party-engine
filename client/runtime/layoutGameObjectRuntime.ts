// Typed port of the legacy client/layout-game-object-runtime.js IIFE — placed/dynamic
// layout art instance + game-object visibility helpers. Installs
// window.PartyGameLayoutGameObjects for the legacy stage/layout runtime. PartyGame*
// deps + artComposition are read lazily via globalThis at call time
// (PartyGameStageDebugRuntime comes from the still-legacy stage-runtime.js).

import { effectiveVisibilityTimeline } from "./effectiveTimeline";
import type { TimelineDocument } from "../../shared/timeline-model";
import { lifecycleLabels } from "../../shared/lifecycle-labels";

type Dict = Record<string, unknown>;
type El = HTMLElement;

interface VisualBridgeApi {
  playAnimationForTarget?: (options: Dict) => { duration?: number } | undefined;
  stopAtAnimationForTarget?: (options: Dict) => { duration?: number } | undefined;
  playVisibilityForTarget?: (options: Dict) => { duration?: number } | undefined;
}
interface DebugRuntime {
  showGameObjectWarning?: (warning: Dict) => void;
  showArtAssetWarning?: (warning: Dict) => void;
}
interface TreeRenderer {
  render: (c: Dict[], canvas: Dict, o: Dict) => void;
  clear: (o: Dict) => void;
  playAll?: (animation: string, options?: Dict) => number;
  stopAtAll?: (animation: string, options?: Dict) => number;
  playComponent?: (componentId: string, animation: string, options?: Dict) => number;
  stopAtComponent?: (componentId: string, animation: string, options?: Dict) => number;
}

declare global {
  interface Window {
    PartyGameLayoutGameObjects?: typeof PartyGameLayoutGameObjects;
    PartyGameStageDebugRuntime?: DebugRuntime;
  }
}

const w = () => globalThis as typeof globalThis & Window;
const visualBridge = (): VisualBridgeApi | undefined => w().PartyGameVisualBridge as unknown as VisualBridgeApi | undefined;
const artComposition = (id: string): Dict | null => w().artComposition?.(id) || null;
const layoutArtRendererByHost = new WeakMap<El, TreeRenderer>();
const layoutArtRenderOptionsByRenderer = new WeakMap<TreeRenderer, Dict>();
const layoutArtRenderSignatureByRenderer = new WeakMap<TreeRenderer, string>();

function artRendererForLayoutHost(host: El | null): TreeRenderer | null {
  if (!host) return null;
  const rendererHost = (host.closest?.(".controller-widget-art-host, .stage-widget-art-host, [data-layout-element-id]") as El | null) || host;
  return layoutArtRendererByHost.get(rendererHost) || layoutArtRendererByHost.get(host) || null;
}

function getOrCreateDynamicLayoutInstanceHost(element: Dict | null, root: El | null, selector: string, className: string): El | null {
  const id = String(element?.id || "");
  if (!id || !root) return null;
  let host = root.querySelector(`${selector}[data-layout-element-id="${CSS.escape(id)}"]`) as El | null;
  if (!host) {
    host = document.createElement("div");
    host.className = className;
    host.dataset.layoutElementId = id;
    root.appendChild(host);
  }
  return host;
}

function layoutArtLayer(host: El, className: string, keepElements: El[] = []): El {
  const layerClassName = className || "layout-art-layer";
  let layer = Array.from(host.children).find((child) => child.classList?.contains(layerClassName)) as El | undefined;
  if (!layer) {
    layer = document.createElement("div");
    layer.className = layerClassName;
    host.prepend(layer);
  }
  const keep = new Set<Node>(keepElements.filter(Boolean));
  for (const element of keepElements) {
    element.hidden = false;
    delete element.dataset.layoutArtLegacyHidden;
  }
  for (const node of Array.from(host.childNodes)) {
    if (node === layer || keep.has(node)) continue;
    if (node.nodeType === 3 && String(node.nodeValue || "").trim()) {
      node.nodeValue = "";
    }
    if (node.nodeType === 1) {
      const child = node as El;
      child.hidden = true;
      child.dataset.layoutArtLegacyHidden = "true";
    }
  }
  return layer;
}

function renderLayoutArtInstance(element: Dict | null, host: El | null, options: Dict = {}): unknown {
  const composition = artComposition(element?.artCompositionId as string);
  const artRuntime = w().PartyGameArtObject as { ArtObjectTreeRenderer?: new (o: Dict) => TreeRenderer } | undefined;
  const rendererKey = (options.rendererKey as string) || (element?.id as string) || "";
  if (!host) return null;
  const renderers = (options.renderers as Map<string, TreeRenderer>) || new Map<string, TreeRenderer>();
  const missingKey = options.missingDatasetKey as string;
  if (!composition || !artRuntime?.ArtObjectTreeRenderer) {
    (options.clearRenderer as ((id: unknown, host: El) => void) | undefined)?.(element?.id, host);
    if (missingKey) host.dataset[missingKey] = "true";
    return null;
  }
  if (missingKey) delete host.dataset[missingKey];
  host.dataset.layoutRendererKey = rendererKey;
  let renderer = renderers.get(rendererKey);
  const isNewRenderer = !renderer;
  const layer = layoutArtLayer(host, options.layerClassName as string, (options.keepElements as El[]) || []);
  if (!renderer) {
    renderer = new artRuntime.ArtObjectTreeRenderer({
      host: layer,
      document,
      instanceId: `layout:${rendererKey}`,
      gameObjectApi: w().PartyGameGameObject || w().PartyGameStageGameObject,
      visualAnimation: w().PartyGameVisualObject,
      getComposition: (compositionId: string) => {
        const referenced = artComposition(compositionId);
        if (!referenced) return null;
        const activeOptions = renderer ? layoutArtRenderOptionsByRenderer.get(renderer) || {} : {};
        return {
          ...referenced,
          components: ((referenced.components as Dict[]) || []).map((component) => cloneLayoutArtComponent(component, activeOptions, compositionId))
        };
      }
    });
    renderers.set(rendererKey, renderer);
  }
  layoutArtRenderOptionsByRenderer.set(renderer, options);
  const components = ((composition.components as Dict[]) || []).map((component) => cloneLayoutArtComponent(component, options, String(composition.id || element?.artCompositionId || "")));
  const canvas = (composition.canvas as Dict) || { width: 1, height: 1 };
  const timeline = effectiveVisibilityTimeline(composition.timeline as TimelineDocument | null | undefined);
  const renderSignature = JSON.stringify({
    compositionId: composition.id || element?.artCompositionId || "",
    components,
    canvas,
    timeline,
    bindingOptions: {
      componentOverrides: options.componentOverrides || {},
      textOverrides: options.textOverrides || {},
      textStyle: options.textStyle || null
    }
  });
  if (isNewRenderer || layoutArtRenderSignatureByRenderer.get(renderer) !== renderSignature) {
    renderer.render(components, canvas, {
      instant: true,
      timeline,
      compositionId: String(composition.id || element?.artCompositionId || ""),
      componentOverrides: options.componentOverrides || {},
      textOverrides: options.textOverrides || {}
    });
    layoutArtRenderSignatureByRenderer.set(renderer, renderSignature);
  }
  const authoredSetupState = String(element?.defaultAnimationState || "").trim();
  if (isNewRenderer && authoredSetupState) renderer.stopAtAll?.(authoredSetupState, { instant: true });
  layoutArtRendererByHost.set(host, renderer);
  return renderer;
}

function cloneLayoutArtComponent(component: Dict, options: Dict = {}, compositionId = ""): Dict {
  const componentTargets = [component.id, component.instanceLabel]
    .map((value) => String(value || "").trim())
    .filter(Boolean);
  const qualifiedTargets = [
    ...componentTargets.map((value) => compositionId ? `${compositionId}/${value}` : ""),
    ...componentTargets
  ].filter(Boolean);
  const componentOverrides = (options.componentOverrides as Dict) || {};
  const componentOverrideKey = qualifiedTargets.find((value) => Object.prototype.hasOwnProperty.call(componentOverrides, value));
  const componentOverride = componentOverrideKey && typeof componentOverrides[componentOverrideKey] === "object"
    ? componentOverrides[componentOverrideKey] as Dict
    : {};
  const clone: Dict = {
    ...component,
    ...componentOverride,
    children: ((component.children as Dict[]) || []).map((child) => cloneLayoutArtComponent(child, options, compositionId))
  };
  const textOverrides = (options.textOverrides as Dict) || {};
  const kind = String(clone.kind || "").toLowerCase();
  const textOverrideKey = [
    ...qualifiedTargets
  ].find((value) => Object.prototype.hasOwnProperty.call(textOverrides, value));
  if ((kind === "text" || kind === "badge") && textOverrideKey) {
    clone.defaultText = String(textOverrides[textOverrideKey] ?? "");
  }
  const textStyle = options.textStyle as Dict | undefined;
  const textStyleTarget = String(textStyle?.componentId || "").trim();
  if (
    (kind === "text" || kind === "badge") &&
    textStyle &&
    textStyleTarget &&
    qualifiedTargets.includes(textStyleTarget)
  ) {
    clone.fontSize = textStyle.fontSize;
    clone.fontColor = textStyle.fontColor;
    // Styling a bound Layout Text Field must not disable the nested prefab's
    // authored fit contract. An explicit false on either authoring surface may
    // opt out, while the default preserves auto-fit after runtime text lands.
    if (Object.prototype.hasOwnProperty.call(textStyle, "autoFitText")) {
      clone.autoFitText = clone.autoFitText !== false && textStyle.autoFitText !== false;
    }
  }
  return clone;
}

function clearLayoutArtInstanceRenderer(renderers: Map<string, TreeRenderer>, elementId: string, host: El | null = null): void {
  const rendererKey = host?.dataset?.layoutRendererKey || elementId;
  const renderer = renderers.get(rendererKey);
  if (renderer) renderer.clear({ instant: true });
  if (renderer) layoutArtRenderSignatureByRenderer.delete(renderer);
  renderers.delete(rendererKey);
  if (host) layoutArtRendererByHost.delete(host);
  if (host) {
    for (const layer of Array.from(host.querySelectorAll(":scope > .stage-widget-art-layer, :scope > .controller-widget-art-layer, :scope > .layout-art-layer"))) {
      layer.remove();
    }
  }
}

function removeInactiveLayoutArtInstances(options: Dict): void {
  const root = options.root as El | null;
  const selector = options.selector as string;
  const activeIds = options.activeIds as Set<string>;
  const clearRenderer = options.clearRenderer as (id: string, el: El) => void;
  const registry = options.registry as { remove?: (id: string) => void } | undefined;
  if (!root) return;
  for (const node of Array.from(root.querySelectorAll(`${selector}[data-layout-element-id]`))) {
    const element = node as El;
    if (!activeIds.has(element.dataset.layoutElementId as string)) {
      clearRenderer(element.dataset.layoutElementId as string, element);
      registry?.remove?.(element.dataset.layoutElementId as string);
      element.remove();
    }
  }
}

function createDynamicLayoutArtInstanceApi(options: Dict = {}) {
  const renderers = (options.renderers as Map<string, unknown>) || new Map();
  const root = () => (typeof options.root === "function" ? (options.root as () => El)() : (options.root as El));
  const api = {
    getOrCreate(element: Dict) {
      return getOrCreateDynamicLayoutInstanceHost(element, root(), options.selector as string, options.className as string);
    },
    render(element: Dict, host: El, rendererKey = "", renderOptions: Dict = {}) {
      return renderLayoutArtInstance(element, host, {
        renderers,
        rendererKey,
        layerClassName: options.layerClassName,
        missingDatasetKey: options.missingDatasetKey,
        clearRenderer: api.clear,
        ...renderOptions
      });
    },
    clear(elementId: string, host: El | null = null) {
      clearLayoutArtInstanceRenderer(renderers as Map<string, TreeRenderer>, elementId, host);
    },
    removeInactive(activeIds: Set<string>, registry: unknown) {
      removeInactiveLayoutArtInstances({ root: root(), selector: options.selector, activeIds, clearRenderer: api.clear, registry });
    }
  };
  return api;
}

function activeDynamicLayoutInstanceIds(state: Dict | null, globalLayout: Dict | null, isDynamicInstance: (el: Dict) => boolean): Set<string> {
  const ids = new Set<string>();
  for (const element of (state?.elements as Dict[]) || []) {
    if (isDynamicInstance(element)) ids.add(element.id as string);
  }
  if (globalLayout?.hiddenInStates === true) return ids;
  const hiddenGlobals = new Set((state?.hiddenGlobals as string[]) || []);
  for (const element of (globalLayout?.elements as Dict[]) || []) {
    if (isDynamicInstance(element) && !hiddenGlobals.has(element.id as string)) ids.add(element.id as string);
  }
  return ids;
}

// Compatibility name for existing browser/runtime consumers. Dynamic structural
// hosts share the generic collector without becoming Art hosts.
const activeDynamicLayoutArtInstanceIds = activeDynamicLayoutInstanceIds;

function beginLayoutElementTargetApplication(target: El | null, options: Dict = {}): boolean {
  if (!target) return false;
  const isNewLayoutTarget = !target.classList.contains(options.targetClass as string);
  if (isNewLayoutTarget) target.classList.add(options.suppressedClass as string);
  target.classList.remove(options.hiddenClass as string);
  target.classList.add(options.targetClass as string);
  return isNewLayoutTarget;
}

function applyLayoutElementBoxStyles(target: El | null, element: Dict | null, prefix: string): void {
  if (!target || !element || !prefix) return;
  target.style.setProperty(`--${prefix}-layout-x`, `${element.x}px`);
  target.style.setProperty(`--${prefix}-layout-y`, `${element.y}px`);
  target.style.setProperty(`--${prefix}-layout-w`, `${element.width}px`);
  target.style.setProperty(`--${prefix}-layout-h`, `${element.height}px`);
  target.style.setProperty(`--${prefix}-layout-scale`, `${element.scale || 1}`);
  target.style.setProperty(`--${prefix}-layout-rotation`, `${Number(element.rotation || 0)}deg`);
}

function finishLayoutElementTargetApplication(target: El | null, isNewLayoutTarget: boolean, suppressedClass: string): void {
  if (!target || !isNewLayoutTarget) return;
  // Avoid a synchronous style/layout flush for every authored element. The
  // suppression class only needs to cover the current reconciliation turn.
  queueMicrotask(() => target.isConnected && target.classList.remove(suppressedClass));
}

function layoutTargetByElementId(options: Dict): El | null {
  const root = options.root as El | null;
  const elementId = options.elementId as string;
  const layoutAttribute = options.layoutAttribute as string;
  const dynamicSelector = options.dynamicSelector as string;
  const globalClass = (options.globalClass as string) || "";
  const scope = (options.scope as string) || "";
  if (!root || !elementId) return null;
  const escapedId = CSS.escape(elementId);
  const escapedGlobalClass = globalClass ? CSS.escape(globalClass) : "";
  const scopedSuffix =
    scope === "global" && escapedGlobalClass
      ? `.${escapedGlobalClass}`
      : (scope === "moment" || scope === "controller") && escapedGlobalClass
        ? `:not(.${escapedGlobalClass})`
        : "";
  const scopedTarget =
    (root.querySelector(`[${layoutAttribute}="${escapedId}"]${scopedSuffix}`) as El | null) ||
    (root.querySelector(`${dynamicSelector}[data-layout-element-id="${escapedId}"]${scopedSuffix}`) as El | null);
  if (scope) return scopedTarget;
  return scopedTarget ||
    (root.querySelector(`[${layoutAttribute}="${escapedId}"]`) as El | null) ||
    (root.querySelector(`${dynamicSelector}[data-layout-element-id="${escapedId}"]`) as El | null);
}

function layoutElementVisibilityKey(elementId: string, target: El | null, options: Dict = {}): unknown {
  const keyFor = options.keyFor as (id: string, isGlobal?: boolean) => unknown;
  if (options.scope === "global") return keyFor(elementId, true);
  if (options.scope === "moment") return keyFor(elementId, false);
  const visibilityDatasetKey = options.visibilityDatasetKey as string;
  if (target?.dataset?.[visibilityDatasetKey]) return target.dataset[visibilityDatasetKey];
  if (((options.currentElements as (() => Dict[]) | undefined)?.() || []).some((element) => element.id === elementId)) {
    return keyFor(elementId, false);
  }
  if (((options.globalElements as (() => Dict[]) | undefined)?.() || []).some((element) => element.id === elementId)) {
    return keyFor(elementId, true);
  }
  return keyFor(elementId);
}

function layoutEntityForElementId(elementId: string, target: El | null = null, options: Dict = {}): Dict | null {
  if (!elementId) return null;
  const registryKey = (options.registryKeyFor as ((id: string, scope: string, t: El | null) => string) | undefined)?.(elementId, (options.scope as string) || "", target) || elementId;
  const registry = options.registry as { get?: (id: string, o: Dict) => Dict | null; register?: (e: Dict) => Dict } | undefined;
  const entity = registry?.get?.(elementId, { registryKey });
  if (entity && (!options.scope || (options.scope === "global") === entity.isGlobal)) {
    const renderer = entity.target ? layoutArtRendererByHost.get(entity.target as El) : null;
    if (renderer && entity.artRenderer !== renderer && typeof entity.update === "function") {
      (entity.update as (o: Dict) => void).call(entity, { artRenderer: renderer, syncArtRendererOnShow: true });
    }
    return entity;
  }
  // A DOM node is not proof of an authored game object. Only placement can
  // register an entity, so a legacy/static node with a matching id can never
  // be promoted into the flow runtime as a substitute game object.
  return null;
}

function layoutElementTargetMatchesSelector(element: Dict | null, target: El | null): boolean {
  const selector = String(element?.selector || "");
  if (!selector || !target) return false;
  try {
    return target.matches(selector);
  } catch {
    return false;
  }
}

function normalizeLayoutPlacementScope(scopeOrGlobal: boolean | string = false): string {
  if (typeof scopeOrGlobal === "string") return scopeOrGlobal.trim() || "moment";
  return scopeOrGlobal ? "global" : "moment";
}

function registerPlacedLayoutEntity(element: Dict | null, target: El | null, scopeOrGlobal: boolean | string = false, options: Dict = {}): Dict {
  const id = (element?.id as string) || "";
  const scope = normalizeLayoutPlacementScope(scopeOrGlobal);
  const isGlobal = scope === "global";
  const entity: Dict = {
    element,
    id,
    registryKey: (options.registryKeyFor as ((id: string, scope: string, t: El | null) => string) | undefined)?.(id, scope, target) || id,
    isArt: (options.isArt as ((e: Dict | null, t: El | null) => boolean) | undefined)?.(element, target) === true,
    isDynamic: (options.isDynamic as ((e: Dict | null, t: El | null) => boolean) | undefined)?.(element, target) === true,
    isGlobal: isGlobal === true,
    layoutScope: scope,
    target,
    visibilityKey: (options.visibilityKeyFor as ((id: string, scope: string) => string) | undefined)?.(id, scope) || ""
  };
  return (options.registry as (() => { register?: (e: Dict) => Dict }) | undefined)?.()?.register?.(entity) || entity;
}

function createPlacedLayoutEntityRegistrar(options: Dict = {}) {
  return (element: Dict | null, target: El | null, scopeOrGlobal: boolean | string = false) => registerPlacedLayoutEntity(element, target, scopeOrGlobal, options);
}

function attachRenderedLayoutArtEntity(entity: Dict | null, renderInstance: unknown, options: Dict = {}): unknown {
  const renderer = typeof renderInstance === "function" ? (renderInstance as () => unknown)() : null;
  if (typeof entity?.update === "function") {
    (entity.update as (o: Dict) => void).call(entity, { artRenderer: renderer, syncArtRendererOnShow: Boolean(renderer) });
  }
  void options;
  return renderer;
}

function createPlacedLayoutGameObjectTargetResolver(options: Dict = {}) {
  const resolver = {
    entityForElementId(elementId: string, target: El | null = null, scope = ""): Dict | null {
      return layoutEntityForElementId(elementId, target, {
        registry: (options.registry as (() => unknown) | undefined)?.(),
        targetByElementId: options.targetByElementId,
        visibilityKeyForTarget: resolver.visibilityKeyForTarget,
        registryKeyFor: options.registryKeyFor,
        scope,
        isGameObjectArtTarget: options.isGameObjectArtTarget,
        isDynamicTarget: options.isDynamicTarget,
        isGlobalTarget: options.isGlobalTarget
      });
    },
    visibilityKeyForTarget(elementId: string, target: El | null = null, scope = ""): string {
      return (options.visibilityKeyForTarget as ((id: string, t: El | null, scope: string) => string) | undefined)?.(elementId, target, scope) || "";
    },
    setShownForAction(action: Dict, showOptions: Dict = {}): unknown {
      return setLayoutEntityShownForAction(action, {
        entityForElementId: resolver.entityForElementId,
        visibilityKeyForTarget: resolver.visibilityKeyForTarget,
        complete: showOptions.complete,
        returnResult: showOptions.returnResult === true,
        suppressMissingWarning: showOptions.suppressMissingWarning === true
      });
    },
    playAnimationForAction(action: Dict, playOptions: Dict = {}): unknown {
      return playLayoutEntityAnimationForAction(action, {
        entityForElementId: resolver.entityForElementId,
        visibilityKeyForTarget: resolver.visibilityKeyForTarget,
        complete: playOptions.complete,
        returnResult: playOptions.returnResult === true,
        suppressMissingWarning: playOptions.suppressMissingWarning === true
      });
    },
    applyVisibilityOverride(entity: Dict): void {
      applyLayoutVisibilityOverride(entity, {
        visibilityOverrides: options.visibilityOverrides,
        hiddenClass: options.hiddenClass,
        exitingClass: options.exitingClass
      });
    }
  };
  return resolver;
}

function layoutGameObjectVisualFor(entity: Dict | null): unknown {
  if (!entity?.target || !w().PartyGameVisualObject) return null;
  return typeof entity.createVisual === "function" ? (entity.createVisual as () => unknown)() : null;
}

function layoutDefaultVisibilityForEntity(entity: Dict | null): boolean | null {
  const gameObjectApi = (w().PartyGameGameObject || w().PartyGameStageGameObject) as { defaultVisibleFor?: (e: Dict | null) => boolean | null } | undefined;
  if (typeof gameObjectApi?.defaultVisibleFor === "function") return gameObjectApi.defaultVisibleFor(entity);
  return entity?.isDynamic && entity?.isArt ? false : null;
}

function applyLayoutEntityTargetVisibility(entity: Dict | null, isShown: boolean, options: Dict = {}): boolean {
  if (typeof entity?.applyTargetVisibility === "function") {
    (entity.applyTargetVisibility as (s: boolean) => void)(isShown === true);
    return true;
  }
  const target = entity?.target as El | undefined;
  if (!target) return false;
  target.dataset.visualVisible = isShown ? "true" : "false";
  if (isShown) {
    target.classList.remove(options.hiddenClass as string, options.exitingClass as string);
    return true;
  }
  if (!target.classList.contains(options.exitingClass as string)) {
    target.classList.add(options.hiddenClass as string);
  }
  return true;
}

function applyLayoutDefaultVisibility(entity: Dict | null, options: Dict = {}): boolean {
  const target = entity?.target as El | undefined;
  if (!target || (options.visibilityOverrides as Set<string> | undefined)?.has((entity?.visibilityKey as string) || "")) return false;
  const isShown = layoutDefaultVisibilityForEntity(entity);
  if (isShown === null) return false;
  return applyLayoutEntityTargetVisibility(entity, isShown, options);
}

function applyLayoutVisibilityOverride(entity: Dict | null, options: Dict = {}): void {
  if (typeof entity?.applyVisibilityState === "function") {
    (entity.applyVisibilityState as () => void)();
    return;
  }
  const overrides = options.visibilityOverrides as Map<string, boolean> | undefined;
  if (overrides?.has((entity?.visibilityKey as string) || "") && typeof entity?.applyVisibilityOverride === "function") {
    (entity.applyVisibilityOverride as () => void)();
    return;
  }
  const target = entity?.target as El | undefined;
  const visibilityKey = (entity?.visibilityKey as string) || "";
  if (!visibilityKey || !target) return;
  if (!overrides?.has(visibilityKey)) {
    applyLayoutDefaultVisibility(entity, options);
    return;
  }
  const isShown = overrides.get(visibilityKey) !== false;
  applyLayoutEntityTargetVisibility(entity, isShown, options);
}

function playLayoutEntityVisibility(entity: Dict | null, isShown: boolean, options: Dict = {}): number {
  const target = (entity?.target as El) || null;
  const lifecycleState = String(target?.dataset?.visualState || "");
  const alreadyTargetingVisibility = isShown
    ? lifecycleState === "shown" || lifecycleState === "appearing"
    : lifecycleState === "hidden" || lifecycleState === "disappearing";
  if (alreadyTargetingVisibility) {
    if (typeof options.complete === "function") (options.complete as () => void)();
    return 0;
  }
  if (!lifecycleState && typeof entity?.playAnimation === "function") {
    return Number(
      (entity.playAnimation as (animation: string, playOptions: Dict) => number)(
        isShown ? lifecycleLabels.on : lifecycleLabels.off,
        { instant: true, complete: options.complete }
      ) || 0
    );
  }
  if (typeof entity?.playVisibility === "function") {
    return (entity.playVisibility as (s: boolean, o: Dict) => number)(isShown, { instant: options.instant === true, complete: options.complete });
  }
  const visual = layoutGameObjectVisualFor(entity);
  if (!target || !visual) {
    (options.warn as ((r: string) => void) | undefined)?.("visual object unavailable");
    return 0;
  }
  const result = visualBridge()?.playVisibilityForTarget?.({ target, visual, isShown, playOptions: { instant: options.instant === true, complete: options.complete } });
  return result?.duration || 0;
}

function playLayoutEntityAnimation(entity: Dict | null, animation: string, options: Dict = {}): number {
  const cleanAnimation = String(animation || "").trim();
  if (!cleanAnimation) return 0;
  const componentId = String(options.componentId || "").trim();
  const playbackMode = options.playbackMode === "stop" ? "stop" : "play";
  const artRenderer = entity?.artRenderer as {
    playAll?: (a: string, o: Dict) => number;
    playComponent?: (id: string, a: string, o: Dict) => number;
    stopAtAll?: (a: string, o: Dict) => number;
    stopAtComponent?: (id: string, a: string, o: Dict) => number;
  } | undefined;
  if (componentId) {
    const componentPlayer = playbackMode === "stop" ? artRenderer?.stopAtComponent : artRenderer?.playComponent;
    if (typeof componentPlayer === "function") {
      return Number(componentPlayer(componentId, cleanAnimation, { instant: options.instant === true, complete: options.complete }) || 0);
    }
    (options.warn as ((r: string) => void) | undefined)?.(`component target unavailable: ${componentId}`);
    return 0;
  }
  if (playbackMode === "stop" && typeof entity?.stopAtAnimation === "function") {
    return (entity.stopAtAnimation as (a: string, o: Dict) => number)(cleanAnimation, { instant: options.instant === true, complete: options.complete });
  }
  if (playbackMode === "play" && typeof entity?.playAnimation === "function") {
    return (entity.playAnimation as (a: string, o: Dict) => number)(cleanAnimation, { instant: options.instant === true, complete: options.complete });
  }
  let duration = 0;
  const treePlayer = playbackMode === "stop" ? artRenderer?.stopAtAll : artRenderer?.playAll;
  if (typeof treePlayer === "function") {
    duration = Math.max(duration, Number(treePlayer(cleanAnimation, { instant: options.instant === true, complete: options.complete }) || 0));
  }
  const target = (entity?.target as El) || null;
  const visual = layoutGameObjectVisualFor(entity);
  if (!target || !visual) {
    if (!duration) (options.warn as ((r: string) => void) | undefined)?.("visual object unavailable");
    return duration;
  }
  const bridge = visualBridge();
  const bridgePlayer = playbackMode === "stop" ? bridge?.stopAtAnimationForTarget : bridge?.playAnimationForTarget;
  const result = bridgePlayer?.({ target, visual, animation: cleanAnimation, playOptions: { instant: options.instant === true, complete: options.complete } });
  return Math.max(duration, Number(result?.duration || 0));
}

function layoutGameObjectMissingTargetReason(details: Dict = {}): string {
  const actionVerb = details.isShown ? "show" : "hide";
  const scopeText = details.scope ? ` in ${details.scope} scope` : "";
  if (details.visibilityKey) return `placed instance not active${scopeText}; cannot ${actionVerb} ${details.visibilityKey}`;
  if (details.sourceArtAsset) {
    return `target id is a source prefab (${details.elementId}); add it to this layout and target the placed game object instance`;
  }
  return `no placed layout entity found for ${details.elementId || "unknown target"}${scopeText}`;
}

function setLayoutEntityShownForAction(action: Dict, options: Dict = {}): unknown {
  const elementId = (action?.targetLayoutElementId as string) || "";
  const result = (duration: unknown, missing = false, reason = "") =>
    options.returnResult ? { duration: Math.max(0, Number(duration || 0)), missing, reason } : Math.max(0, Number(duration || 0));
  if (action?.commandSource !== "flow-action") return result(0, true, "game object commands require an active flow action");
  if (!elementId || !w().PartyGameVisualObject) return result(0, true, "missing target id or visual runtime");
  const isShown = action.isShown !== false;
  const scope = ["global", "moment"].includes(String(action?.targetLayoutScope || "")) ? (action.targetLayoutScope as string) : "";
  const sourceArtAsset = artComposition(elementId);
  const warn = (reason: string) => {
    const warning = { elementId, name: action?.name || action?.actionName || "", scope, reason };
    const debug = w().PartyGameStageDebugRuntime;
    if (typeof debug?.showGameObjectWarning === "function") debug.showGameObjectWarning(warning);
    else debug?.showArtAssetWarning?.(warning);
  };
  const entityForElementId = options.entityForElementId as ((id: string, t: El | null, scope: string) => Dict | null) | undefined;
  const entity = entityForElementId?.(elementId, null, scope);
  const target = (entity?.target as El) || null;
  const visibilityKey = (entity?.visibilityKey as string) || (options.visibilityKeyForTarget as ((id: string, t: El | null, scope: string) => string) | undefined)?.(elementId, target, scope);
  if (!target) {
    const reason = layoutGameObjectMissingTargetReason({ elementId, isShown, scope, sourceArtAsset, visibilityKey });
    if (options.suppressMissingWarning !== true) warn(reason);
    return result(0, true, reason);
  }
  return result(
    playLayoutEntityVisibility(entity || entityForElementId?.(elementId, target, scope) || null, isShown, {
      instant: action.instant === true,
      complete: options.complete,
      warn
    })
  );
}

function setLayoutGameObjectShownForAction(action: Dict, options: Dict = {}): unknown {
  return setLayoutEntityShownForAction(action, options);
}

function activateLayoutEntity(entity: Dict | null, options: Dict = {}): number {
  if (!entity) return 0;
  void options;
  if (typeof entity.applyVisibilityState === "function") {
    (entity.applyVisibilityState as () => void).call(entity);
  }
  return 0;
}

function initializeLayoutEntity(entity: Dict | null, options: Dict = {}): boolean {
  if (!entity) return false;
  if (
    typeof entity.applyDefaultVisibility === "function" &&
    (entity.applyDefaultVisibility as () => boolean).call(entity)
  ) {
    return true;
  }
  return applyLayoutEntityTargetVisibility(entity, options.fallbackVisible !== false, options);
}

function deactivateLayoutEntity(entity: Dict | null): number {
  if (!entity) return 0;
  if (typeof entity.applyTargetVisibility === "function") {
    (entity.applyTargetVisibility as (shown: boolean) => void).call(entity, false);
  }
  return 0;
}

function playLayoutEntityAnimationForAction(action: Dict, options: Dict = {}): unknown {
  const elementId = (action?.targetLayoutElementId as string) || "";
  const result = (duration: unknown, missing = false, reason = "") =>
    options.returnResult ? { duration: Math.max(0, Number(duration || 0)), missing, reason } : Math.max(0, Number(duration || 0));
  const animation = String(action?.animationName || action?.timelineLabel || action?.animation || "").trim();
  const componentId = String(action?.targetComponentId || action?.componentId || "").trim();
  if (action?.commandSource !== "flow-action") return result(0, true, "game object commands require an active flow action");
  if (!elementId || !animation || !w().PartyGameVisualObject) return result(0, true, "missing target id, animation, or visual runtime");
  const scope = ["global", "moment", "controller"].includes(String(action?.targetLayoutScope || "")) ? (action.targetLayoutScope as string) : "";
  const sourceArtAsset = artComposition(elementId);
  const warn = (reason: string) => {
    const warning = { elementId, name: action?.name || action?.actionName || "", scope, reason };
    const debug = w().PartyGameStageDebugRuntime;
    if (typeof debug?.showGameObjectWarning === "function") debug.showGameObjectWarning(warning);
    else debug?.showArtAssetWarning?.(warning);
  };
  const entityForElementId = options.entityForElementId as ((id: string, t: El | null, scope: string) => Dict | null) | undefined;
  const entity = entityForElementId?.(elementId, null, scope);
  const target = (entity?.target as El) || null;
  const visibilityKey = (entity?.visibilityKey as string) || (options.visibilityKeyForTarget as ((id: string, t: El | null, scope: string) => string) | undefined)?.(elementId, target, scope);
  if (!target) {
    const reason = layoutGameObjectMissingTargetReason({ elementId, isShown: true, scope, sourceArtAsset, visibilityKey });
    if (options.suppressMissingWarning !== true) warn(reason);
    return result(0, true, reason);
  }
  return result(
    playLayoutEntityAnimation(entity || entityForElementId?.(elementId, target, scope) || null, animation, {
      componentId,
      complete: options.complete,
      instant: action.instant === true,
      playbackMode: action.timelinePlaybackMode === "stop" || action.type === "stopGameObjectAnimation" ? "stop" : "play",
      warn
    })
  );
}

export const PartyGameLayoutGameObjects = {
  activeDynamicLayoutArtInstanceIds,
  activeDynamicLayoutInstanceIds,
  artRendererForLayoutHost,
  activateLayoutEntity,
  deactivateLayoutEntity,
  applyLayoutElementBoxStyles,
  attachRenderedLayoutArtEntity,
  beginLayoutElementTargetApplication,
  cloneLayoutArtComponent,
  createDynamicLayoutArtInstanceApi,
  createPlacedLayoutEntityRegistrar,
  createPlacedLayoutGameObjectTargetResolver,
  finishLayoutElementTargetApplication,
  getOrCreateDynamicLayoutInstanceHost,
  initializeLayoutEntity,
  normalizeLayoutPlacementScope,
  layoutElementTargetMatchesSelector,
  layoutElementVisibilityKey,
  layoutTargetByElementId,
  playLayoutEntityAnimationForAction,
  setLayoutGameObjectShownForAction
};

export function installLayoutGameObjectGlobals(target: Window | typeof globalThis = globalThis): void {
  (target as Window).PartyGameLayoutGameObjects = PartyGameLayoutGameObjects;
}

installLayoutGameObjectGlobals(typeof window !== "undefined" ? window : globalThis);
