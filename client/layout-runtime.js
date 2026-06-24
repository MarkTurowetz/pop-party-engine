const stageLayoutArtVisibilityOverrides = new Map();
let stageLayoutGameObjects = null;
const controllerLayoutVisibilityOverrides = new Map();
let controllerLayoutGameObjects = null;
let currentControllerLayoutStateId = "";

function createLayoutGameObjectRegistry(visibilityOverrides, visualOptions = {}) {
  const gameObjects = window.PartyGameGameObject || window.PartyGameStageGameObject;
  return typeof gameObjects?.createRegistry === "function"
    ? gameObjects.createRegistry({ visibilityOverrides, visualOptions })
    : null;
}

function stageLayoutGameObjectRegistry() {
  if (stageLayoutGameObjects) return stageLayoutGameObjects;
  stageLayoutGameObjects = createLayoutGameObjectRegistry(
    stageLayoutArtVisibilityOverrides,
    {
      hiddenClasses: ["stage-layout-visual-hidden"],
      motionHiddenClasses: ["stage-layout-visual-hidden"],
      exitingClass: "stage-layout-visual-exiting",
      updateClass: "stage-layout-visual-update",
      instantClass: "stage-layout-visual-instant"
    }
  );
  return stageLayoutGameObjects;
}

function controllerLayoutGameObjectRegistry() {
  if (!controllerLayoutGameObjects) {
    controllerLayoutGameObjects = createLayoutGameObjectRegistry(
      controllerLayoutVisibilityOverrides,
      {
        hiddenClasses: ["controller-layout-visual-hidden"],
        motionHiddenClasses: ["controller-layout-visual-hidden"],
        exitingClass: "controller-layout-visual-exiting",
        updateClass: "controller-layout-visual-update",
        instantClass: "controller-layout-visual-instant",
        layoutHiddenClasses: ["controller-layout-hidden"]
      }
    );
  }
  return controllerLayoutGameObjects;
}

function getOrCreateLayoutArtInstance(element, root, selector, className) {
  const id = String(element?.id || "");
  if (!id || !root) return null;
  let host = root.querySelector(`${selector}[data-layout-element-id="${CSS.escape(id)}"]`);
  if (!host) {
    host = document.createElement("div");
    host.className = className;
    host.dataset.layoutElementId = id;
    root.appendChild(host);
  }
  return host;
}

function renderLayoutArtInstance(element, host, options = {}) {
  const composition = artComposition(element?.artCompositionId);
  const artRuntime = window.PartyGameArtObject;
  const rendererKey = options.rendererKey || element?.id || "";
  if (!host) return null;
  if (!composition || !artRuntime) {
    options.clearRenderer?.(element?.id, host);
    host.dataset[options.missingDatasetKey] = "true";
    return null;
  }
  delete host.dataset[options.missingDatasetKey];
  host.dataset.layoutRendererKey = rendererKey;
  let renderer = options.renderers.get(rendererKey);
  if (!renderer) {
    const layer = document.createElement("div");
    layer.className = options.layerClassName;
    host.replaceChildren(layer);
    renderer = new artRuntime.ArtObjectTreeRenderer({
      host: layer,
      document,
      instanceId: `layout:${rendererKey}`,
      gameObjectApi: window.PartyGameGameObject || window.PartyGameStageGameObject,
      visualAnimation: window.PartyGameVisualObject
    });
    options.renderers.set(rendererKey, renderer);
  }
  renderer.render(composition.components || [], composition.canvas || { width: 1, height: 1 }, {
    defaultAnimation: "on",
    instant: true,
    respectDefaultAnimationState: false
  });
  return renderer;
}

function clearLayoutArtInstanceRenderer(renderers, elementId, host = null) {
  const rendererKey = host?.dataset?.layoutRendererKey || elementId;
  const renderer = renderers.get(rendererKey);
  if (renderer) renderer.clear({ instant: true });
  renderers.delete(rendererKey);
  if (host) host.replaceChildren();
}

function removeInactiveLayoutArtInstances({ root, selector, activeIds, clearRenderer, registry }) {
  if (!root) return;
  for (const element of Array.from(root.querySelectorAll(`${selector}[data-layout-element-id]`))) {
    if (!activeIds.has(element.dataset.layoutElementId)) {
      clearRenderer(element.dataset.layoutElementId, element);
      registry?.remove(element.dataset.layoutElementId);
      element.remove();
    }
  }
}

function activeDynamicLayoutArtInstanceIds(state, globalLayout, isDynamicInstance) {
  const ids = new Set();
  for (const element of state?.elements || []) {
    if (isDynamicInstance(element)) ids.add(element.id);
  }
  if (globalLayout?.hiddenInStates === true) return ids;
  const hiddenGlobals = new Set(state?.hiddenGlobals || []);
  for (const element of globalLayout?.elements || []) {
    if (isDynamicInstance(element) && !hiddenGlobals.has(element.id)) ids.add(element.id);
  }
  return ids;
}

function beginLayoutElementTargetApplication(target, options = {}) {
  if (!target) return false;
  const isNewLayoutTarget = !target.classList.contains(options.targetClass);
  if (isNewLayoutTarget) target.classList.add(options.suppressedClass);
  target.classList.remove(options.hiddenClass);
  target.classList.add(options.targetClass);
  return isNewLayoutTarget;
}

function applyLayoutElementBoxStyles(target, element, prefix) {
  if (!target || !element || !prefix) return;
  target.style.setProperty(`--${prefix}-layout-x`, `${element.x}px`);
  target.style.setProperty(`--${prefix}-layout-y`, `${element.y}px`);
  target.style.setProperty(`--${prefix}-layout-w`, `${element.width}px`);
  target.style.setProperty(`--${prefix}-layout-h`, `${element.height}px`);
  target.style.setProperty(`--${prefix}-layout-scale`, `${element.scale || 1}`);
  target.style.setProperty(`--${prefix}-layout-rotation`, `${Number(element.rotation || 0)}deg`);
}

function finishLayoutElementTargetApplication(target, isNewLayoutTarget, suppressedClass) {
  if (!target || !isNewLayoutTarget) return;
  void target.offsetWidth;
  target.classList.remove(suppressedClass);
}

function layoutTargetByElementId({ root, elementId, layoutAttribute, dynamicSelector, globalClass = "", scope = "" }) {
  if (!root || !elementId) return null;
  const escapedId = CSS.escape(elementId);
  const escapedGlobalClass = globalClass ? CSS.escape(globalClass) : "";
  const scopedSuffix = scope === "global" && escapedGlobalClass
    ? `.${escapedGlobalClass}`
    : (scope === "moment" || scope === "controller") && escapedGlobalClass
      ? `:not(.${escapedGlobalClass})`
      : "";
  return root.querySelector(`[${layoutAttribute}="${escapedId}"]${scopedSuffix}`)
    || root.querySelector(`${dynamicSelector}[data-layout-element-id="${escapedId}"]${scopedSuffix}`)
    || root.querySelector(`[${layoutAttribute}="${escapedId}"]`)
    || root.querySelector(`${dynamicSelector}[data-layout-element-id="${escapedId}"]`);
}

function layoutElementVisibilityKey(elementId, target, options = {}) {
  if (options.scope === "global") return options.keyFor(elementId, true);
  if (options.scope === "moment") return options.keyFor(elementId, false);
  if (target?.dataset?.[options.visibilityDatasetKey]) return target.dataset[options.visibilityDatasetKey];
  if ((options.currentElements?.() || []).some((element) => element.id === elementId)) {
    return options.keyFor(elementId, false);
  }
  if ((options.globalElements?.() || []).some((element) => element.id === elementId)) {
    return options.keyFor(elementId, true);
  }
  return options.keyFor(elementId);
}

function layoutEntityForElementId(elementId, target = null, options = {}) {
  if (!elementId) return null;
  const registryKey = options.registryKeyFor?.(elementId, options.scope || "", target) || elementId;
  const entity = options.registry?.get(elementId, { registryKey });
  if (entity && (!options.scope || (options.scope === "global") === entity.isGlobal)) return entity;
  const resolvedTarget = target || options.targetByElementId?.(elementId, options.scope || "");
  if (!resolvedTarget) return null;
  const resolvedRegistryKey = options.registryKeyFor?.(elementId, options.scope || "", resolvedTarget) || registryKey;
  const fallbackEntity = {
    element: null,
    id: elementId,
    registryKey: resolvedRegistryKey,
    isArt: options.isArtTarget?.(resolvedTarget) === true,
    isDynamic: options.isDynamicTarget?.(resolvedTarget) === true,
    isGlobal: options.isGlobalTarget?.(resolvedTarget) === true,
    target: resolvedTarget,
    visibilityKey: options.visibilityKeyForTarget?.(elementId, resolvedTarget, options.scope || "") || ""
  };
  return options.registry?.register(fallbackEntity) || fallbackEntity;
}

function layoutElementTargetMatchesSelector(element, target) {
  const selector = String(element?.selector || "");
  if (!selector || !target) return false;
  try {
    return target.matches(selector);
  } catch (_error) {
    return false;
  }
}

function registerPlacedLayoutEntity(element, target, isGlobal = false, options = {}) {
  const id = element?.id || "";
  const entity = {
    element,
    id,
    registryKey: options.registryKeyFor?.(id, isGlobal, target) || id,
    isArt: options.isArt?.(element, target) === true,
    isDynamic: options.isDynamic?.(element, target) === true,
    isGlobal: isGlobal === true,
    target,
    visibilityKey: options.visibilityKeyFor?.(id, isGlobal) || ""
  };
  return options.registry?.()?.register(entity) || entity;
}

function attachRenderedLayoutArtEntity(entity, renderInstance) {
  const renderer = typeof renderInstance === "function" ? renderInstance() : null;
  entity?.update?.({
    artRenderer: renderer,
    syncArtRendererOnShow: Boolean(renderer)
  });
  return renderer;
}

function createPlacedLayoutArtTargetResolver(options = {}) {
  const resolver = {
    entityForElementId(elementId, target = null, scope = "") {
      return layoutEntityForElementId(elementId, target, {
        registry: options.registry?.(),
        targetByElementId: options.targetByElementId,
        visibilityKeyForTarget: resolver.visibilityKeyForTarget,
        registryKeyFor: options.registryKeyFor,
        scope,
        isArtTarget: options.isArtTarget,
        isDynamicTarget: options.isDynamicTarget,
        isGlobalTarget: options.isGlobalTarget
      });
    },
    visibilityKeyForTarget(elementId, target = null, scope = "") {
      return options.visibilityKeyForTarget?.(elementId, target, scope) || "";
    },
    setShownForAction(action) {
      return setLayoutArtElementShownForAction(action, {
        entityForElementId: resolver.entityForElementId,
        visibilityKeyForTarget: resolver.visibilityKeyForTarget,
        visibilityOverrides: options.visibilityOverrides
      });
    },
    applyVisibilityOverride(entity) {
      applyLayoutVisibilityOverride(entity, {
        visibilityOverrides: options.visibilityOverrides,
        hiddenClass: options.hiddenClass,
        exitingClass: options.exitingClass
      });
    }
  };
  return resolver;
}

function layoutArtVisualFor(entity) {
  if (!entity?.target || !window.PartyGameVisualObject) return null;
  return typeof entity.createVisual === "function" ? entity.createVisual() : null;
}

function layoutDefaultVisibilityForEntity(entity) {
  const gameObjectApi = window.PartyGameGameObject || window.PartyGameStageGameObject;
  if (typeof gameObjectApi?.defaultVisibleFor === "function") return gameObjectApi.defaultVisibleFor(entity);
  return entity?.isDynamic && entity?.isArt ? false : null;
}

function applyLayoutEntityTargetVisibility(entity, isShown, options = {}) {
  if (typeof entity?.applyTargetVisibility === "function") {
    entity.applyTargetVisibility(isShown === true);
    return true;
  }
  const target = entity?.target;
  if (!target) return false;
  target.dataset.visualVisible = isShown ? "true" : "false";
  if (isShown) {
    target.classList.remove(options.hiddenClass, options.exitingClass);
    return true;
  }
  if (!target.classList.contains(options.exitingClass)) {
    target.classList.add(options.hiddenClass);
  }
  return true;
}

function applyLayoutDefaultVisibility(entity, options = {}) {
  const target = entity?.target;
  if (!target || options.visibilityOverrides?.has(entity?.visibilityKey || "")) return false;
  const isShown = layoutDefaultVisibilityForEntity(entity);
  if (isShown === null) return false;
  return applyLayoutEntityTargetVisibility(entity, isShown, options);
}

function applyLayoutVisibilityOverride(entity, options = {}) {
  if (typeof entity?.applyVisibilityState === "function") {
    entity.applyVisibilityState();
    return;
  }
  if (options.visibilityOverrides?.has(entity?.visibilityKey || "") && typeof entity?.applyVisibilityOverride === "function") {
    entity.applyVisibilityOverride();
    return;
  }
  const target = entity?.target;
  const visibilityKey = entity?.visibilityKey || "";
  if (!visibilityKey || !target) return;
  if (!options.visibilityOverrides?.has(visibilityKey)) {
    applyLayoutDefaultVisibility(entity, options);
    return;
  }
  const isShown = options.visibilityOverrides.get(visibilityKey) !== false;
  applyLayoutEntityTargetVisibility(entity, isShown, options);
}

function playLayoutEntityVisibility(entity, isShown, options = {}) {
  if (typeof entity?.playVisibility === "function") {
    return entity.playVisibility(isShown, { instant: options.instant === true });
  }
  const target = entity?.target || null;
  const visual = layoutArtVisualFor(entity);
  if (!target || !visual) {
    options.warn?.("visual object unavailable");
    return 0;
  }
  const result = window.PartyGameVisualBridge?.playVisibilityForTarget?.({
    target,
    visual,
    isShown,
    playOptions: { instant: options.instant === true }
  });
  return result?.duration || 0;
}

function layoutArtMissingTargetReason(details = {}) {
  const actionVerb = details.isShown ? "show" : "hide";
  const scopeText = details.scope ? ` in ${details.scope} scope` : "";
  if (details.visibilityKey) {
    return `placed instance not active${scopeText}; saved pending ${actionVerb} for ${details.visibilityKey}`;
  }
  if (details.sourceArtAsset) {
    return `target id is a source prefab (${details.elementId}); add it to this layout and target the placed instance`;
  }
  return `no placed layout entity found for ${details.elementId || "unknown target"}${scopeText}`;
}

function setLayoutArtElementShownForAction(action, options = {}) {
  const elementId = action?.targetLayoutElementId || "";
  if (!elementId || !window.PartyGameVisualObject) return 0;
  const isShown = action.isShown !== false;
  const scope = ["global", "moment"].includes(String(action?.targetLayoutScope || "")) ? action.targetLayoutScope : "";
  const sourceArtAsset = typeof artComposition === "function" ? artComposition(elementId) : null;
  const warn = (reason) => {
    window.PartyGameStageDebugRuntime?.showArtAssetWarning?.({
      elementId,
      name: action?.name || action?.actionName || "",
      scope,
      reason
    });
  };
  const entity = options.entityForElementId?.(elementId, null, scope);
  const target = entity?.target || null;
  const visibilityKey = entity?.visibilityKey || options.visibilityKeyForTarget?.(elementId, target, scope);
  if (!target) {
    if (visibilityKey) options.visibilityOverrides?.set(visibilityKey, isShown);
    warn(layoutArtMissingTargetReason({
      elementId,
      isShown,
      scope,
      sourceArtAsset,
      visibilityKey
    }));
    return 0;
  }
  return playLayoutEntityVisibility(entity || options.entityForElementId?.(elementId, target, scope), isShown, {
    instant: action.instant === true,
    warn
  });
}

async function loadStageLayouts({ forceServer = false } = {}) {
  if (runtimeTestLayouts && !forceServer) {
    stageLayouts = runtimeTestLayouts;
    return stageLayouts;
  }
  if (!canUseServer) return stageLayouts;
  const result = await getJson("/api/stage-layouts");
  stageLayouts = result.layouts || stageLayouts;
  return stageLayouts;
}

async function loadControllerLayouts({ forceServer = false } = {}) {
  if (runtimeTestControllerLayouts && !forceServer) {
    controllerLayouts = runtimeTestControllerLayouts;
    return controllerLayouts;
  }
  if (!canUseServer) return controllerLayouts;
  const result = await getJson("/api/controller-layouts");
  controllerLayouts = result.layouts || controllerLayouts;
  return controllerLayouts;
}

function stageLayoutState(stateId) {
  return (stageLayouts.states || []).find((state) => state.id === stateId) || null;
}

function globalStageLayout() {
  return stageLayouts.global || { id: "global", name: "Global Layout", elements: [] };
}


function controllerLayoutState(stateId) {
  return (controllerLayouts.states || []).find((state) => state.id === stateId) || null;
}

function globalControllerLayout() {
  return controllerLayouts.global || { id: "global", name: "Global Layout", elements: [] };
}

function controllerLayoutStateForPhase(phase) {
  if (!controllerState) return controllerLayoutState("join") || (controllerLayouts.states || [])[0] || null;
  const selectedLayoutId = controllerState?.lobby?.controllerLayoutId || "";
  const preferred = selectedLayoutId || (phase === "starting" ? "lobby" : phase || "lobby");
  return controllerLayoutState(preferred) || controllerLayoutState("lobby") || (controllerLayouts.states || [])[0] || null;
}

function allControllerLayoutSelectors() {
  const selectors = new Set();
  for (const element of globalControllerLayout().elements || []) {
    if (element.selector) selectors.add(element.selector);
  }
  for (const state of controllerLayouts.states || []) {
    for (const element of state.elements || []) {
      if (element.selector) selectors.add(element.selector);
    }
  }
  return selectors;
}

function clearControllerLayoutTargets() {
  const targets = new Set(controllerPanel.querySelectorAll(".controller-layout-target"));
  for (const selector of allControllerLayoutSelectors()) {
    const target = controllerPanel.querySelector(selector);
    if (target) targets.add(target);
  }
  for (const target of targets) {
    if (target.classList.contains("controller-dynamic-text")) {
      target.remove();
      continue;
    }
    target.classList.remove("controller-layout-target");
    target.classList.add("controller-layout-hidden");
    target.classList.remove("controller-layout-visual-hidden");
    target.classList.remove("controller-layout-visual-exiting");
    target.classList.remove("controller-layout-visual-update");
    target.classList.remove("controller-layout-visual-instant");
    target.classList.remove("controller-layout-transition-suppressed");
    target.classList.remove("controller-global-layout-target");
    target.style.removeProperty("--controller-layout-x");
    target.style.removeProperty("--controller-layout-y");
    target.style.removeProperty("--controller-layout-w");
    target.style.removeProperty("--controller-layout-h");
    target.style.removeProperty("--controller-layout-scale");
    target.style.removeProperty("--controller-layout-rotation");
    target.style.removeProperty("--controller-text-color");
    target.style.removeProperty("--controller-text-font-size");
    target.style.removeProperty("color");
    target.style.removeProperty("font-size");
    delete target.dataset.controllerLayoutElementId;
    delete target.dataset.controllerLayoutVisibilityKey;
  }
}

function applyControllerLayoutForPhase(phase) {
  if (!controllerScreen || !controllerPanel) return;
  const state = controllerLayoutStateForPhase(phase);
  if (!state) return;
  currentControllerLayoutStateId = state.id;
  controllerLayoutGameObjectRegistry()?.beginFrame();
  removeInactiveControllerArtInstances(activeControllerArtInstanceIds(state));
  clearControllerLayoutTargets();
  const canvas = controllerLayouts.canvas || { width: 390, height: 844 };
  const screenRect = controllerScreen.getBoundingClientRect();
  const fitScale = Math.min(screenRect.width / canvas.width, screenRect.height / canvas.height);
  controllerPanel.style.width = `${canvas.width}px`;
  controllerPanel.style.height = `${canvas.height}px`;
  controllerPanel.style.setProperty("--controller-board-scale", `${fitScale}`);
  for (const element of state.elements || []) {
    applyControllerElementLayout(element, false);
  }
  const hiddenGlobals = new Set(state.hiddenGlobals || []);
  const globalLayout = globalControllerLayout();
  if (globalLayout.hiddenInStates === true) return;
  for (const element of globalLayout.elements || []) {
    if (hiddenGlobals.has(element.id)) continue;
    applyControllerElementLayout(element, true);
  }
}

function applyControllerElementLayout(element, isGlobal = false) {
  const target = controllerLayoutTargetElement(element);
  if (!target) return;
  const entity = registerControllerLayoutEntity(element, target, isGlobal);
  const isNewLayoutTarget = beginLayoutElementTargetApplication(target, {
    targetClass: "controller-layout-target",
    hiddenClass: "controller-layout-hidden",
    suppressedClass: "controller-layout-transition-suppressed"
  });
  target.classList.toggle("controller-global-layout-target", isGlobal);
  target.dataset.controllerLayoutElementId = entity.id || "";
  target.dataset.controllerLayoutVisibilityKey = entity.visibilityKey || "";
  applyLayoutElementBoxStyles(target, element, "controller");
  if (element.kind === "text") {
    target.classList.add("controller-layout-text");
    applyControllerLayoutTextProperties(target, element);
  } else if (isDynamicControllerArtInstance(element)) {
    attachRenderedLayoutArtEntity(entity, () => renderControllerArtInstance(element, target, entity.visibilityKey));
  }
  applyControllerLayoutArtVisibilityOverride(entity);
  finishLayoutElementTargetApplication(target, isNewLayoutTarget, "controller-layout-transition-suppressed");
}

function registerControllerLayoutEntity(element, target, isGlobal = false) {
  return registerPlacedLayoutEntity(element, target, isGlobal, {
    registry: controllerLayoutGameObjectRegistry,
    registryKeyFor: controllerLayoutRegistryKeyForElement,
    visibilityKeyFor: controllerLayoutVisibilityKey,
    isArt: (layoutElement) => layoutElement?.kind === "art" || Boolean(layoutElement?.artCompositionId),
    isDynamic: (layoutElement, layoutTarget) => (
      isDynamicControllerArtInstance(layoutElement)
        || (layoutElement?.kind === "text" && !layoutElementTargetMatchesSelector(layoutElement, layoutTarget))
    )
  });
}

function controllerLayoutVisibilityKey(elementId, isGlobal = false) {
  if (!elementId) return "";
  return `${isGlobal ? "global" : currentControllerLayoutStateId || "controller"}:${elementId}`;
}

function controllerLayoutRegistryKeyForElement(elementId, scopeOrGlobal = "", target = null) {
  if (scopeOrGlobal === true || scopeOrGlobal === "global") return controllerLayoutVisibilityKey(elementId, true);
  if (scopeOrGlobal === false || scopeOrGlobal === "moment" || scopeOrGlobal === "controller") return controllerLayoutVisibilityKey(elementId, false);
  return controllerLayoutVisibilityKey(elementId, target?.classList?.contains("controller-global-layout-target") === true);
}

function controllerLayoutTargetByElementId(elementId, scope = "") {
  return layoutTargetByElementId({
    root: controllerPanel,
    elementId,
    layoutAttribute: "data-controller-layout-element-id",
    dynamicSelector: ".dynamic-controller-art-instance",
    globalClass: "controller-global-layout-target",
    scope
  });
}

function controllerLayoutElementVisibilityKey(elementId, target = null, scope = "") {
  return layoutElementVisibilityKey(elementId, target, {
    visibilityDatasetKey: "controllerLayoutVisibilityKey",
    scope,
    currentElements: () => controllerLayoutState(currentControllerLayoutStateId)?.elements || [],
    globalElements: () => globalControllerLayout().elements || [],
    keyFor: controllerLayoutVisibilityKey
  });
}

const controllerLayoutArtTargets = createPlacedLayoutArtTargetResolver({
  registry: controllerLayoutGameObjectRegistry,
  targetByElementId: controllerLayoutTargetByElementId,
  visibilityKeyForTarget: controllerLayoutElementVisibilityKey,
  registryKeyFor: controllerLayoutRegistryKeyForElement,
  visibilityOverrides: controllerLayoutVisibilityOverrides,
  hiddenClass: "controller-layout-visual-hidden",
  exitingClass: "controller-layout-visual-exiting",
  isArtTarget: (resolvedTarget) => resolvedTarget.classList.contains("dynamic-controller-art-instance"),
  isDynamicTarget: (resolvedTarget) => resolvedTarget.classList.contains("dynamic-controller-art-instance"),
  isGlobalTarget: (resolvedTarget) => resolvedTarget.classList.contains("controller-global-layout-target")
});

function controllerLayoutEntityForElementId(elementId, target = null, scope = "") {
  return controllerLayoutArtTargets.entityForElementId(elementId, target, scope);
}

function setControllerLayoutArtElementShownForAction(action) {
  return controllerLayoutArtTargets.setShownForAction(action);
}

function applyControllerLayoutArtVisibilityOverride(entity) {
  controllerLayoutArtTargets.applyVisibilityOverride(entity);
}

function controllerLayoutComputedFontSize(element, textOverride = "") {
  const baseSize = Number(element.fontSize || 42);
  if (!element.autoFitText) return baseSize;
  return fittedLayoutTextSize(element, textOverride || layoutDefaultText(element) || String(element.name || "Text"), baseSize);
}

function applyControllerLayoutTextProperties(target, element) {
  const fontColor = normalizeUiColor(element.fontColor) || "#17131f";
  const text = target.textContent.trim() || layoutDefaultText(element);
  const fontSize = `${controllerLayoutComputedFontSize(element, text)}px`;
  target.style.setProperty("--controller-text-color", fontColor);
  target.style.setProperty("--controller-text-font-size", fontSize);
  target.style.setProperty("color", fontColor, "important");
  target.style.setProperty("font-size", fontSize, "important");
}

function controllerLayoutTargetElement(element) {
  if (isDynamicControllerArtInstance(element)) return getOrCreateControllerArtInstance(element);
  const target = controllerPanel.querySelector(element.selector);
  if (target || element.kind !== "text") return target;
  const id = String(element.selector || "").replace(/^#/, "") || element.id;
  let dynamic = controllerPanel.querySelector(`#${CSS.escape(id)}`);
  if (!dynamic) {
    dynamic = document.createElement("div");
    dynamic.id = id;
    dynamic.className = "controller-dynamic-text controller-layout-text";
    dynamic.textContent = layoutDefaultText(element);
    controllerPanel.appendChild(dynamic);
  }
  return dynamic;
}

const controllerArtInstanceRenderers = new Map();

function isDynamicControllerArtInstance(element) {
  return Boolean(element?.artCompositionId && !element.selector);
}

function activeControllerArtInstanceIds(state) {
  return activeDynamicLayoutArtInstanceIds(state, globalControllerLayout(), isDynamicControllerArtInstance);
}

function removeInactiveControllerArtInstances(activeIds) {
  removeInactiveLayoutArtInstances({
    root: controllerPanel,
    selector: ".dynamic-controller-art-instance",
    activeIds,
    clearRenderer: clearControllerArtInstanceRenderer,
    registry: controllerLayoutGameObjectRegistry()
  });
}

function getOrCreateControllerArtInstance(element) {
  return getOrCreateLayoutArtInstance(
    element,
    controllerPanel,
    ".dynamic-controller-art-instance",
    "dynamic-controller-art-instance controller-widget-art-host"
  );
}

function renderControllerArtInstance(element, host, rendererKey = "") {
  return renderLayoutArtInstance(element, host, {
    renderers: controllerArtInstanceRenderers,
    rendererKey,
    layerClassName: "controller-widget-art-layer",
    missingDatasetKey: "controllerLayoutArtMissing",
    clearRenderer: clearControllerArtInstanceRenderer
  });
}

function clearControllerArtInstanceRenderer(elementId, host = null) {
  clearLayoutArtInstanceRenderer(controllerArtInstanceRenderers, elementId, host);
}

function stageLayoutStateForPhase(phase) {
  const preferred = phase === "starting" ? "lobby" : phase === "intro" ? "intro" : phase || "lobby";
  return stageLayoutState(preferred) || stageLayoutState("lobby") || (stageLayouts.states || [])[0] || null;
}

function allStageLayoutSelectors() {
  const selectors = new Set();
  for (const element of globalStageLayout().elements || []) {
    if (element.selector) selectors.add(element.selector);
  }
  for (const state of stageLayouts.states || []) {
    for (const element of state.elements || []) {
      if (element.selector) selectors.add(element.selector);
    }
  }
  return selectors;
}

const stageArtInstanceRenderers = new Map();

function activeStageArtInstanceIds(state) {
  return activeDynamicLayoutArtInstanceIds(state, globalStageLayout(), isDynamicStageArtInstance);
}

function removeInactiveStageArtInstances(activeIds) {
  removeInactiveLayoutArtInstances({
    root: stageBoard,
    selector: ".dynamic-stage-art-instance",
    activeIds,
    clearRenderer: clearStageArtInstanceRenderer,
    registry: stageLayoutGameObjectRegistry()
  });
}

function clearStageLayoutTargets() {
  const targets = new Set(stageBoard.querySelectorAll(".stage-layout-target"));
  for (const selector of allStageLayoutSelectors()) {
    const target = stageBoard.querySelector(selector);
    if (target) targets.add(target);
  }
  for (const target of targets) {
    target.classList.remove("stage-layout-target");
    target.classList.remove("stage-global-layout-target");
    target.classList.remove("stage-layout-hidden");
    target.classList.remove("stage-layout-visual-update");
    target.classList.remove("stage-layout-visual-instant");
    target.classList.remove("stage-layout-transition-suppressed");
    target.style.removeProperty("--stage-layout-x");
    target.style.removeProperty("--stage-layout-y");
    target.style.removeProperty("--stage-layout-w");
    target.style.removeProperty("--stage-layout-h");
    target.style.removeProperty("--stage-layout-scale");
    target.style.removeProperty("--stage-layout-rotation");
    target.style.removeProperty("--stage-object-visible-scale");
    target.style.removeProperty("--stage-text-color");
    target.style.removeProperty("--stage-text-font-size");
    target.style.removeProperty("color");
    target.style.removeProperty("font-size");
    delete target.dataset.stageLayoutElementId;
    delete target.dataset.stageLayoutArtCompositionId;
    delete target.dataset.stageLayoutVisibilityKey;
  }
}

function applyStageLayoutForPhase(phase) {
  const state = stageLayoutStateForPhase(phase);
  if (!state || !stageScreen || !stageBoard) return;
  currentStageLayoutStateId = state.id;
  stageLayoutGameObjectRegistry()?.beginFrame();
  hideStageMomentTextOutsideLayout(state);
  clearStageLayoutTargets();
  removeInactiveStageArtInstances(activeStageArtInstanceIds(state));
  const canvas = stageLayouts.canvas || { width: 1920, height: 1080 };
  const stageRect = stageScreen.getBoundingClientRect();
  const fitScale = Math.min(stageRect.width / canvas.width, stageRect.height / canvas.height);
  stageBoard.style.width = `${canvas.width}px`;
  stageBoard.style.height = `${canvas.height}px`;
  stageBoard.style.setProperty("--stage-board-scale", `${fitScale}`);
  for (const element of state.elements || []) {
    applyStageElementLayout(element, false);
  }
  const hiddenGlobals = new Set(state.hiddenGlobals || []);
  const globalLayout = globalStageLayout();
  if (globalLayout.hiddenInStates === true) {
    for (const element of globalLayout.elements || []) {
      const target = stageLayoutTargetElement(element);
      if (target) target.classList.add("stage-layout-hidden");
    }
    return;
  }
  for (const element of globalLayout.elements || []) {
    if (hiddenGlobals.has(element.id)) {
      const target = stageLayoutTargetElement(element);
      if (target) target.classList.add("stage-layout-hidden");
      continue;
    }
    applyStageElementLayout(element, true);
  }
}

function applyStageElementLayout(element, isGlobal) {
  const target = stageLayoutTargetElement(element);
  if (!target) return;
  const entity = registerStageLayoutEntity(element, target, isGlobal);
  const isNewLayoutTarget = beginLayoutElementTargetApplication(target, {
    targetClass: "stage-layout-target",
    hiddenClass: "stage-layout-hidden",
    suppressedClass: "stage-layout-transition-suppressed"
  });
  if (isGlobal) target.classList.add("stage-global-layout-target");
  target.dataset.stageLayoutElementId = entity.id || "";
  target.dataset.stageLayoutArtCompositionId = element.artCompositionId || "";
  target.dataset.stageLayoutVisibilityKey = entity.visibilityKey;
  applyLayoutElementBoxStyles(target, element, "stage");
  if (element.kind === "text") {
    applyStageLayoutTextProperties(target, element);
    registerStageLayoutTextTarget(element, target, isGlobal);
  } else if (isDynamicStageArtInstance(element)) {
    attachRenderedLayoutArtEntity(entity, () => renderStageArtInstance(element, target, entity.visibilityKey));
  }
  applyStageLayoutArtVisibilityOverride(entity);
  finishLayoutElementTargetApplication(target, isNewLayoutTarget, "stage-layout-transition-suppressed");
}

function registerStageLayoutEntity(element, target, isGlobal = false) {
  return registerPlacedLayoutEntity(element, target, isGlobal, {
    registry: stageLayoutGameObjectRegistry,
    registryKeyFor: (id, globalTarget) => stageLayoutArtVisibilityKey(id, globalTarget),
    visibilityKeyFor: stageLayoutArtVisibilityKey,
    isArt: (layoutElement) => layoutElement?.kind === "art" && Boolean(layoutElement?.artCompositionId),
    isDynamic: isDynamicStageArtInstance
  });
}

function applyStageLayoutArtVisibilityOverride(entity) {
  stageLayoutArtTargets.applyVisibilityOverride(entity);
}

function stageLayoutTargetByElementId(elementId, scope = "") {
  return layoutTargetByElementId({
    root: stageBoard,
    elementId,
    layoutAttribute: "data-stage-layout-element-id",
    dynamicSelector: ".dynamic-stage-art-instance",
    globalClass: "stage-global-layout-target",
    scope
  });
}

function stageLayoutElementVisibilityKey(elementId, target = null, scope = "") {
  return layoutElementVisibilityKey(elementId, target, {
    visibilityDatasetKey: "stageLayoutVisibilityKey",
    scope,
    currentElements: () => stageLayoutState(currentStageLayoutStateId)?.elements || [],
    globalElements: () => globalStageLayout().elements || [],
    keyFor: stageLayoutArtVisibilityKey
  });
}

function stageLayoutArtVisibilityKey(elementId, isGlobal = false) {
  if (!elementId) return "";
  return `${isGlobal ? "global" : currentStageLayoutStateId || "moment"}:${elementId}`;
}

function stageLayoutRegistryKeyForElement(elementId, scope = "", target = null) {
  if (scope === "global") return stageLayoutArtVisibilityKey(elementId, true);
  if (scope === "moment") return stageLayoutArtVisibilityKey(elementId, false);
  return stageLayoutArtVisibilityKey(elementId, target?.classList?.contains("stage-global-layout-target") === true);
}

const stageLayoutArtTargets = createPlacedLayoutArtTargetResolver({
  registry: stageLayoutGameObjectRegistry,
  targetByElementId: stageLayoutTargetByElementId,
  visibilityKeyForTarget: stageLayoutElementVisibilityKey,
  registryKeyFor: stageLayoutRegistryKeyForElement,
  visibilityOverrides: stageLayoutArtVisibilityOverrides,
  hiddenClass: "stage-layout-visual-hidden",
  exitingClass: "stage-layout-visual-exiting",
  isArtTarget: (resolvedTarget) => Boolean(resolvedTarget.dataset.stageLayoutArtCompositionId),
  isDynamicTarget: (resolvedTarget) => resolvedTarget.classList.contains("dynamic-stage-art-instance"),
  isGlobalTarget: (resolvedTarget) => resolvedTarget.classList.contains("stage-global-layout-target")
});

function stageLayoutEntityForElementId(elementId, target = null, scope = "") {
  return stageLayoutArtTargets.entityForElementId(elementId, target, scope);
}

function setStageLayoutArtElementShownForAction(action) {
  const surface = String(action?.targetLayoutSurface || "stage").toLowerCase();
  if (surface !== "stage") {
    window.PartyGameStageDebugRuntime?.showArtAssetWarning?.({
      elementId: action?.targetLayoutElementId || "",
      name: action?.name || action?.actionName || "",
      scope: action?.targetLayoutScope || "",
      reason: `target layout surface ${surface} is not handled by the stage runner`
    });
    return 0;
  }
  return stageLayoutArtTargets.setShownForAction(action);
}

function stageLayoutTargetElement(element) {
  if (isDynamicStageArtInstance(element)) return getOrCreateStageArtInstance(element);
  if (element.kind !== "text") return stageBoard.querySelector(element.selector);
  const dynamicId = dynamicStageTextElementId(element);
  const selectorTarget = stageBoard.querySelector(element.selector);
  const selectorId = normalizeTextTargetId(String(element.selector || "").replace(/^#/, ""));
  const elementId = normalizeTextTargetId(element.id);
  const shouldUseDynamicTextTarget = elementId && selectorId && selectorId !== elementId;
  if (!shouldUseDynamicTextTarget && selectorTarget) return selectorTarget;
  return getOrCreateDynamicStageTextElement(dynamicId || elementId || selectorId);
}

function isDynamicStageArtInstance(element) {
  return Boolean(element?.artCompositionId && !element.selector);
}

function getOrCreateStageArtInstance(element) {
  return getOrCreateLayoutArtInstance(
    element,
    stageBoard,
    ".dynamic-stage-art-instance",
    "dynamic-stage-art-instance stage-widget-art-host has-stage-widget-art"
  );
}

function renderStageArtInstance(element, host, rendererKey = "") {
  return renderLayoutArtInstance(element, host, {
    renderers: stageArtInstanceRenderers,
    rendererKey,
    layerClassName: "stage-widget-art-layer",
    missingDatasetKey: "stageLayoutArtMissing",
    clearRenderer: clearStageArtInstanceRenderer
  });
}

function clearStageArtInstanceRenderer(elementId, host = null) {
  clearLayoutArtInstanceRenderer(stageArtInstanceRenderers, elementId, host);
}

function dynamicStageTextElementId(element) {
  return normalizeTextTargetId(element?.id || element?.name || "");
}

function getOrCreateDynamicStageTextElement(id) {
  if (!id) return null;
  let element = stageBoard.querySelector(`#${CSS.escape(id)}`);
  if (element) return element;
  element = document.createElement("div");
  element.id = id;
  element.className = "stage-presentation-text stage-text-object text-hidden hidden";
  stageBoard.appendChild(element);
  return element;
}

function registerStageLayoutTextTarget(layoutElement, targetElement, isGlobal = false) {
  const targetId = normalizeTextTargetId(layoutElement.id);
  if (!targetId || !targetElement) return;
  const existing = stageTextObjects[targetId];
  const isExistingTarget = existing?.element === targetElement;
  stageTextObjects[targetId] = {
    element: targetElement,
    layoutElement,
    isGlobal,
    visible: isExistingTarget
      ? existing.visible
      : targetElement.dataset.visualVisible === "true",
    text: isExistingTarget ? existing.text : targetElement.textContent || ""
  };
}

function hideStageMomentTextOutsideLayout(state) {
  if (!state) return;
  const activeMomentTextIds = new Set((state.elements || [])
    .filter((element) => element.kind === "text")
    .map((element) => normalizeTextTargetId(element.id))
    .filter(Boolean));
  for (const [targetId, object] of Object.entries(stageTextObjects)) {
    if (!object?.layoutElement || object.isGlobal) continue;
    if (!activeMomentTextIds.has(targetId)) {
      setStageTextObject(targetId, { isShown: false, instant: true });
    }
  }
}

function stageLayoutTextDefault(element) {
  const id = String(element?.id || "").toLowerCase();
  if (element?.defaultText !== undefined && String(element.defaultText).length) return String(element.defaultText);
  if (id === "roundintrotext") return "Round One";
  if (id === "roundintroinfotext") return "Additional round info";
  if (id === "stageprompttext") return "Prompt Text";
  if (id === "stagepresentationtext") return "";
  return String(element?.name || "");
}

function textFieldPadding(element) {
  const id = String(element?.id || "").toLowerCase();
  if (id === "waitingstatus" || id === "joinprompt") return { x: 40, y: 24 };
  return { x: 0, y: 0 };
}

function fittedLayoutTextSize(element, text, fallbackSize) {
  const padding = textFieldPadding(element);
  const availableWidth = Math.max(8, Number(element.width || 1) - padding.x);
  const availableHeight = Math.max(8, Number(element.height || 1) - padding.y);
  const rawLines = String(text || "Text").split("\n");
  const words = rawLines.flatMap((line) => line.split(/\s+/).filter(Boolean));
  const longestWord = Math.max(1, ...words.map((word) => word.length));
  const maxSize = Math.min(260, Math.max(8, availableHeight));
  const minSize = 8;
  const averageGlyphWidth = 0.68;
  const lineHeight = 1.08;
  const linesForSize = (size) => {
    const averageCharWidth = size * averageGlyphWidth;
    const maxCharsPerLine = Math.max(1, Math.floor(availableWidth / averageCharWidth));
    return rawLines.reduce((total, rawLine) => {
      const lineWords = rawLine.split(/\s+/).filter(Boolean);
      if (!lineWords.length) return total + 1;
      let lineCount = 1;
      let currentLength = 0;
      for (const word of lineWords) {
        const wordLength = word.length;
        if (currentLength === 0) {
          currentLength = wordLength;
        } else if (currentLength + 1 + wordLength <= maxCharsPerLine) {
          currentLength += 1 + wordLength;
        } else {
          lineCount += 1;
          currentLength = wordLength;
        }
      }
      return total + lineCount;
    }, 0);
  };
  for (let size = maxSize; size >= minSize; size -= 1) {
    const averageCharWidth = size * averageGlyphWidth;
    const wordFits = longestWord * averageCharWidth <= availableWidth * 0.98;
    const wrappedLines = linesForSize(size);
    if (wordFits && wrappedLines * size * lineHeight <= availableHeight) return size;
  }
  return Math.max(minSize, Math.min(maxSize, Number(fallbackSize || 58)));
}

function stageLayoutComputedFontSize(element, textOverride = "") {
  const baseSize = Number(element.fontSize || 58);
  if (!element.autoFitText) return baseSize;
  return fittedLayoutTextSize(element, textOverride || stageLayoutTextDefault(element) || String(element.name || "Text"), baseSize);
}

function applyStageLayoutTextProperties(target, element) {
  const fontColor = normalizeUiColor(element.fontColor) || "#ffffff";
  const fontSize = `${stageLayoutComputedFontSize(element, target.textContent.trim())}px`;
  target.style.setProperty("color", fontColor, "important");
  target.style.setProperty("font-size", fontSize, "important");
  target.style.setProperty("--stage-text-color", fontColor);
  target.style.setProperty("--stage-text-font-size", fontSize);
  if (!target.textContent.trim() && element.defaultText) {
    target.textContent = stageLayoutTextDefault(element);
  }
}
