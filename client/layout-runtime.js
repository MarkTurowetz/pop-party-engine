const stageLayoutGameObjectVisibilityOverrides = new Map();
let stageLayoutGameObjects = null;
const controllerLayoutVisibilityOverrides = new Map();
let controllerLayoutGameObjects = null;
let currentControllerLayoutStateId = "";
const {
  activeDynamicLayoutArtInstanceIds,
  applyLayoutElementBoxStyles,
  attachRenderedLayoutArtEntity,
  beginLayoutElementTargetApplication,
  createDynamicLayoutArtInstanceApi,
  createPlacedLayoutEntityRegistrar,
  createPlacedLayoutGameObjectTargetResolver,
  finishLayoutElementTargetApplication,
  layoutElementTargetMatchesSelector,
  layoutElementVisibilityKey,
  layoutTargetByElementId
} = window.PartyGameLayoutGameObjects;

function createLayoutGameObjectRegistry(visibilityOverrides, visualOptions = {}) {
  const gameObjects = window.PartyGameGameObject || window.PartyGameStageGameObject;
  return typeof gameObjects?.createRegistry === "function"
    ? gameObjects.createRegistry({ visibilityOverrides, visualOptions })
    : null;
}

function stageLayoutGameObjectRegistry() {
  if (stageLayoutGameObjects) return stageLayoutGameObjects;
  stageLayoutGameObjects = createLayoutGameObjectRegistry(
    stageLayoutGameObjectVisibilityOverrides,
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

const registerControllerLayoutEntity = createPlacedLayoutEntityRegistrar({
  registry: controllerLayoutGameObjectRegistry,
  registryKeyFor: controllerLayoutRegistryKeyForElement,
  visibilityKeyFor: controllerLayoutVisibilityKey,
  isArt: (layoutElement) => layoutElement?.kind === "art" || Boolean(layoutElement?.artCompositionId),
  isDynamic: (layoutElement, layoutTarget) => (
    isDynamicControllerArtInstance(layoutElement)
      || (layoutElement?.kind === "text" && !layoutElementTargetMatchesSelector(layoutElement, layoutTarget))
  )
});

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

const controllerLayoutGameObjectTargets = createPlacedLayoutGameObjectTargetResolver({
  registry: controllerLayoutGameObjectRegistry,
  targetByElementId: controllerLayoutTargetByElementId,
  visibilityKeyForTarget: controllerLayoutElementVisibilityKey,
  registryKeyFor: controllerLayoutRegistryKeyForElement,
  visibilityOverrides: controllerLayoutVisibilityOverrides,
  hiddenClass: "controller-layout-visual-hidden",
  exitingClass: "controller-layout-visual-exiting",
  isGameObjectArtTarget: (resolvedTarget) => resolvedTarget.classList.contains("dynamic-controller-art-instance"),
  isDynamicTarget: (resolvedTarget) => resolvedTarget.classList.contains("dynamic-controller-art-instance"),
  isGlobalTarget: (resolvedTarget) => resolvedTarget.classList.contains("controller-global-layout-target")
});

function controllerLayoutEntityForElementId(elementId, target = null, scope = "") {
  return controllerLayoutGameObjectTargets.entityForElementId(elementId, target, scope);
}

function setControllerLayoutGameObjectShownForAction(action) {
  return controllerLayoutGameObjectTargets.setShownForAction(action);
}

function setControllerLayoutArtElementShownForAction(action) {
  return setControllerLayoutGameObjectShownForAction(action);
}

function applyControllerLayoutGameObjectVisibilityOverride(entity) {
  controllerLayoutGameObjectTargets.applyVisibilityOverride(entity);
}

function applyControllerLayoutArtVisibilityOverride(entity) {
  applyControllerLayoutGameObjectVisibilityOverride(entity);
}

function controllerLayoutComputedFontSize(element, textOverride = "") {
  const baseSize = Number(element.fontSize || 42);
  if (!element.autoFitText) return baseSize;
  return fittedLayoutTextSize(element, textOverride || layoutDefaultText(element) || String(element.name || "Text"), baseSize);
}

function applyControllerLayoutTextProperties(target, element) {
  const fontColor = normalizeUiColor(element.fontColor) || "#17131f";
  const hasRenderedFitText = Boolean(target.querySelector(":scope > .text-fit-lines, :scope > .text-fit-svg"));
  const text = (hasRenderedFitText ? target.dataset.textFitSource : target.textContent.trim()) || layoutDefaultText(element);
  const baseSize = Number(element.fontSize || 42);
  const layout = element.autoFitText && typeof window.PartyGameTextFit?.fitTextLayout === "function"
    ? window.PartyGameTextFit.fitTextLayout(element, text, baseSize, { padding: textFieldPadding(element) })
    : null;
  const fontSize = `${layout?.fontSize || controllerLayoutComputedFontSize(element, text)}px`;
  target.style.setProperty("--controller-text-color", fontColor);
  target.style.setProperty("--controller-text-font-size", fontSize);
  target.style.setProperty("color", fontColor, "important");
  target.style.setProperty("font-size", fontSize, "important");
  if (layout) window.PartyGameTextFit.renderTextElement?.(target, text, layout);
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
const controllerDynamicArtInstances = createDynamicLayoutArtInstanceApi({
  root: () => controllerPanel,
  selector: ".dynamic-controller-art-instance",
  className: "dynamic-controller-art-instance controller-widget-art-host",
  renderers: controllerArtInstanceRenderers,
  layerClassName: "controller-widget-art-layer",
  missingDatasetKey: "controllerLayoutArtMissing"
});

function isDynamicControllerArtInstance(element) {
  return Boolean(element?.artCompositionId && !element.selector);
}

function activeControllerArtInstanceIds(state) {
  return activeDynamicLayoutArtInstanceIds(state, globalControllerLayout(), isDynamicControllerArtInstance);
}

function removeInactiveControllerArtInstances(activeIds) {
  controllerDynamicArtInstances.removeInactive(activeIds, controllerLayoutGameObjectRegistry());
}

function getOrCreateControllerArtInstance(element) {
  return controllerDynamicArtInstances.getOrCreate(element);
}

function renderControllerArtInstance(element, host, rendererKey = "") {
  return controllerDynamicArtInstances.render(element, host, rendererKey);
}

function clearControllerArtInstanceRenderer(elementId, host = null) {
  controllerDynamicArtInstances.clear(elementId, host);
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
const stageDynamicArtInstances = createDynamicLayoutArtInstanceApi({
  root: () => stageBoard,
  selector: ".dynamic-stage-art-instance",
  className: "dynamic-stage-art-instance stage-widget-art-host has-stage-widget-art",
  renderers: stageArtInstanceRenderers,
  layerClassName: "stage-widget-art-layer",
  missingDatasetKey: "stageLayoutArtMissing"
});

function activeStageArtInstanceIds(state) {
  return activeDynamicLayoutArtInstanceIds(state, globalStageLayout(), isDynamicStageArtInstance);
}

function removeInactiveStageArtInstances(activeIds) {
  stageDynamicArtInstances.removeInactive(activeIds, stageLayoutGameObjectRegistry());
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

const registerStageLayoutEntity = createPlacedLayoutEntityRegistrar({
  registry: stageLayoutGameObjectRegistry,
  registryKeyFor: (id, globalTarget) => stageLayoutGameObjectVisibilityKey(id, globalTarget),
  visibilityKeyFor: stageLayoutGameObjectVisibilityKey,
  isArt: (layoutElement) => layoutElement?.kind === "art" && Boolean(layoutElement?.artCompositionId),
  isDynamic: isDynamicStageArtInstance
});

function applyStageLayoutGameObjectVisibilityOverride(entity) {
  stageLayoutGameObjectTargets.applyVisibilityOverride(entity);
}

function applyStageLayoutArtVisibilityOverride(entity) {
  applyStageLayoutGameObjectVisibilityOverride(entity);
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
    keyFor: stageLayoutGameObjectVisibilityKey
  });
}

function stageLayoutGameObjectVisibilityKey(elementId, isGlobal = false) {
  if (!elementId) return "";
  return `${isGlobal ? "global" : currentStageLayoutStateId || "moment"}:${elementId}`;
}

function stageLayoutRegistryKeyForElement(elementId, scope = "", target = null) {
  if (scope === "global") return stageLayoutGameObjectVisibilityKey(elementId, true);
  if (scope === "moment") return stageLayoutGameObjectVisibilityKey(elementId, false);
  return stageLayoutGameObjectVisibilityKey(elementId, target?.classList?.contains("stage-global-layout-target") === true);
}

const stageLayoutGameObjectTargets = createPlacedLayoutGameObjectTargetResolver({
  registry: stageLayoutGameObjectRegistry,
  targetByElementId: stageLayoutTargetByElementId,
  visibilityKeyForTarget: stageLayoutElementVisibilityKey,
  registryKeyFor: stageLayoutRegistryKeyForElement,
  visibilityOverrides: stageLayoutGameObjectVisibilityOverrides,
  hiddenClass: "stage-layout-visual-hidden",
  exitingClass: "stage-layout-visual-exiting",
  isGameObjectArtTarget: (resolvedTarget) => Boolean(resolvedTarget.dataset.stageLayoutArtCompositionId),
  isDynamicTarget: (resolvedTarget) => resolvedTarget.classList.contains("dynamic-stage-art-instance"),
  isGlobalTarget: (resolvedTarget) => resolvedTarget.classList.contains("stage-global-layout-target")
});

function stageLayoutEntityForElementId(elementId, target = null, scope = "") {
  return stageLayoutGameObjectTargets.entityForElementId(elementId, target, scope);
}

function setStageLayoutGameObjectShownForAction(action, options = {}) {
  const surface = String(action?.targetLayoutSurface || "stage").toLowerCase();
  if (surface !== "stage") {
    const warning = {
      elementId: action?.targetLayoutElementId || "",
      name: action?.name || action?.actionName || "",
      scope: action?.targetLayoutScope || "",
      reason: `target layout surface ${surface} is not handled by the stage runner`
    };
    if (typeof window.PartyGameStageDebugRuntime?.showGameObjectWarning === "function") {
      window.PartyGameStageDebugRuntime.showGameObjectWarning(warning);
    } else {
      window.PartyGameStageDebugRuntime?.showArtAssetWarning?.(warning);
    }
    return options.returnResult ? { duration: 0, missing: true, reason: `target layout surface ${surface} is not handled by the stage runner` } : 0;
  }
  return stageLayoutGameObjectTargets.setShownForAction(action, options);
}

function setStageLayoutArtElementShownForAction(action, options = {}) {
  return setStageLayoutGameObjectShownForAction(action, options);
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
  return stageDynamicArtInstances.getOrCreate(element);
}

function renderStageArtInstance(element, host, rendererKey = "") {
  return stageDynamicArtInstances.render(element, host, rendererKey);
}

function clearStageArtInstanceRenderer(elementId, host = null) {
  stageDynamicArtInstances.clear(elementId, host);
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
  const sharedFit = window.PartyGameTextFit?.measureFittedTextSize;
  if (typeof sharedFit === "function") {
    return sharedFit(element, text, fallbackSize || 58, {
      padding: textFieldPadding(element)
    });
  }
  return Math.max(8, Number(fallbackSize || 58));
}

window.PartyGameTextFit = {
  ...(window.PartyGameTextFit || {}),
  fittedLayoutTextSize
};
window.fittedLayoutTextSize = fittedLayoutTextSize;

function stageLayoutComputedFontSize(element, textOverride = "") {
  const baseSize = Number(element.fontSize || 58);
  if (!element.autoFitText) return baseSize;
  return fittedLayoutTextSize(element, textOverride || stageLayoutTextDefault(element) || String(element.name || "Text"), baseSize);
}

function applyStageLayoutTextProperties(target, element) {
  const fontColor = normalizeUiColor(element.fontColor) || "#ffffff";
  const hasRenderedFitText = Boolean(target.querySelector(":scope > .text-fit-lines, :scope > .text-fit-svg"));
  const text = (hasRenderedFitText ? target.dataset.textFitSource : target.textContent.trim()) || stageLayoutTextDefault(element);
  const baseSize = Number(element.fontSize || 58);
  const layout = element.autoFitText && typeof window.PartyGameTextFit?.fitTextLayout === "function"
    ? window.PartyGameTextFit.fitTextLayout(element, text, baseSize, { padding: textFieldPadding(element) })
    : null;
  const fontSize = `${layout?.fontSize || stageLayoutComputedFontSize(element, text)}px`;
  target.style.setProperty("color", fontColor, "important");
  target.style.setProperty("font-size", fontSize, "important");
  target.style.setProperty("--stage-text-color", fontColor);
  target.style.setProperty("--stage-text-font-size", fontSize);
  if (layout) window.PartyGameTextFit.renderTextElement?.(target, text, layout);
  if (!text.trim() && element.defaultText) {
    target.textContent = stageLayoutTextDefault(element);
  }
}
