const stageLayoutArtVisibilityOverrides = new Map();
let stageLayoutGameObjects = null;
const controllerLayoutVisibilityOverrides = new Map();
let controllerLayoutGameObjects = null;
let currentControllerLayoutStateId = "";

function createLayoutGameObjectRegistry(visibilityOverrides, visualOptions = {}) {
  const registry = window.PartyGameGameObject?.GameObjectRegistry || window.PartyGameStageGameObject?.StageGameObjectRegistry;
  if (!registry) return null;
  return new registry({ visibilityOverrides, visualOptions });
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
  const isNewLayoutTarget = !target.classList.contains("controller-layout-target");
  if (isNewLayoutTarget) target.classList.add("controller-layout-transition-suppressed");
  target.classList.remove("controller-layout-hidden");
  target.classList.add("controller-layout-target");
  target.dataset.controllerLayoutElementId = entity.id || "";
  target.dataset.controllerLayoutVisibilityKey = entity.visibilityKey || "";
  target.style.setProperty("--controller-layout-x", `${element.x}px`);
  target.style.setProperty("--controller-layout-y", `${element.y}px`);
  target.style.setProperty("--controller-layout-w", `${element.width}px`);
  target.style.setProperty("--controller-layout-h", `${element.height}px`);
  target.style.setProperty("--controller-layout-scale", `${element.scale || 1}`);
  target.style.setProperty("--controller-layout-rotation", `${Number(element.rotation || 0)}deg`);
  if (element.kind === "text") {
    target.classList.add("controller-layout-text");
    applyControllerLayoutTextProperties(target, element);
  }
  if (typeof entity.applyVisibilityOverride === "function") entity.applyVisibilityOverride();
  if (isNewLayoutTarget) {
    void target.offsetWidth;
    target.classList.remove("controller-layout-transition-suppressed");
  }
}

function registerControllerLayoutEntity(element, target, isGlobal = false) {
  const id = element?.id || "";
  const selector = String(element?.selector || "");
  let matchesSelector = false;
  try {
    matchesSelector = selector ? target.matches(selector) : false;
  } catch (_error) {
    matchesSelector = false;
  }
  const entity = {
    element,
    id,
    isArt: false,
    isDynamic: element?.kind === "text" && !matchesSelector,
    isGlobal: isGlobal === true,
    target,
    visibilityKey: controllerLayoutVisibilityKey(id, isGlobal)
  };
  return controllerLayoutGameObjectRegistry()?.register(entity) || entity;
}

function controllerLayoutVisibilityKey(elementId, isGlobal = false) {
  if (!elementId) return "";
  return `${isGlobal ? "global" : currentControllerLayoutStateId || "controller"}:${elementId}`;
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
  const ids = new Set();
  for (const element of state?.elements || []) {
    if (isDynamicStageArtInstance(element)) ids.add(element.id);
  }
  const globalLayout = globalStageLayout();
  if (globalLayout.hiddenInStates !== true) {
    const hiddenGlobals = new Set(state?.hiddenGlobals || []);
    for (const element of globalLayout.elements || []) {
      if (isDynamicStageArtInstance(element) && !hiddenGlobals.has(element.id)) ids.add(element.id);
    }
  }
  return ids;
}

function removeInactiveStageArtInstances(activeIds) {
  for (const element of Array.from(stageBoard.querySelectorAll(".dynamic-stage-art-instance[data-layout-element-id]"))) {
    if (!activeIds.has(element.dataset.layoutElementId)) {
      clearStageArtInstanceRenderer(element.dataset.layoutElementId, element);
      stageLayoutGameObjectRegistry()?.remove(element.dataset.layoutElementId);
      element.remove();
    }
  }
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
  const isNewLayoutTarget = !target.classList.contains("stage-layout-target");
  if (isNewLayoutTarget) target.classList.add("stage-layout-transition-suppressed");
  target.classList.add("stage-layout-target");
  if (isGlobal) target.classList.add("stage-global-layout-target");
  target.dataset.stageLayoutElementId = entity.id || "";
  target.dataset.stageLayoutArtCompositionId = element.artCompositionId || "";
  target.dataset.stageLayoutVisibilityKey = entity.visibilityKey;
  target.style.setProperty("--stage-layout-x", `${element.x}px`);
  target.style.setProperty("--stage-layout-y", `${element.y}px`);
  target.style.setProperty("--stage-layout-w", `${element.width}px`);
  target.style.setProperty("--stage-layout-h", `${element.height}px`);
  target.style.setProperty("--stage-layout-scale", `${element.scale || 1}`);
  target.style.setProperty("--stage-layout-rotation", `${Number(element.rotation || 0)}deg`);
  if (element.kind === "text") {
    applyStageLayoutTextProperties(target, element);
    registerStageLayoutTextTarget(element, target, isGlobal);
  } else if (isDynamicStageArtInstance(element)) {
    renderStageArtInstance(element, target);
  }
  applyStageLayoutArtVisibilityOverride(entity);
  if (isNewLayoutTarget) {
    void target.offsetWidth;
    target.classList.remove("stage-layout-transition-suppressed");
  }
}

function registerStageLayoutEntity(element, target, isGlobal = false) {
  const id = element?.id || "";
  const entity = {
    element,
    id,
    isArt: element?.kind === "art" && Boolean(element?.artCompositionId),
    isDynamic: isDynamicStageArtInstance(element),
    isGlobal: isGlobal === true,
    target,
    visibilityKey: stageLayoutArtVisibilityKey(id, isGlobal)
  };
  return stageLayoutGameObjectRegistry()?.register(entity) || entity;
}

function stageLayoutEntityForElementId(elementId, target = null) {
  if (!elementId) return null;
  const entity = stageLayoutGameObjectRegistry()?.get(elementId);
  if (entity) return entity;
  const resolvedTarget = target || stageLayoutTargetByElementId(elementId);
  if (!resolvedTarget) return null;
  const fallbackEntity = {
    element: null,
    id: elementId,
    isArt: Boolean(resolvedTarget.dataset.stageLayoutArtCompositionId),
    isDynamic: resolvedTarget.classList.contains("dynamic-stage-art-instance"),
    isGlobal: resolvedTarget.classList.contains("stage-global-layout-target"),
    target: resolvedTarget,
    visibilityKey: stageLayoutElementVisibilityKey(elementId, resolvedTarget)
  };
  return stageLayoutGameObjectRegistry()?.register(fallbackEntity) || fallbackEntity;
}

function stageLayoutArtVisualFor(entity) {
  if (!entity?.target || !window.PartyGameVisualObject) return null;
  return typeof entity.createVisual === "function" ? entity.createVisual() : null;
}

function applyStageLayoutArtVisibilityOverride(entity) {
  if (typeof entity?.applyVisibilityOverride === "function") {
    entity.applyVisibilityOverride();
    return;
  }
  const target = entity?.target;
  const visibilityKey = entity?.visibilityKey || "";
  if (!visibilityKey || !target || !stageLayoutArtVisibilityOverrides.has(visibilityKey)) return;
  const isShown = stageLayoutArtVisibilityOverrides.get(visibilityKey) !== false;
  target.dataset.visualVisible = isShown ? "true" : "false";
  if (isShown) {
    target.classList.remove("stage-layout-visual-hidden", "stage-layout-visual-exiting");
    return;
  }
  if (!target.classList.contains("stage-layout-visual-exiting")) {
    target.classList.add("stage-layout-visual-hidden");
  }
}

function stageLayoutTargetByElementId(elementId) {
  if (!stageBoard || !elementId) return null;
  return stageBoard.querySelector(`[data-stage-layout-element-id="${CSS.escape(elementId)}"]`)
    || stageBoard.querySelector(`.dynamic-stage-art-instance[data-layout-element-id="${CSS.escape(elementId)}"]`);
}

function stageLayoutElementVisibilityKey(elementId, target = null) {
  if (target?.dataset.stageLayoutVisibilityKey) return target.dataset.stageLayoutVisibilityKey;
  const state = stageLayoutState(currentStageLayoutStateId);
  if ((state?.elements || []).some((element) => element.id === elementId)) {
    return stageLayoutArtVisibilityKey(elementId, false);
  }
  if ((globalStageLayout().elements || []).some((element) => element.id === elementId)) {
    return stageLayoutArtVisibilityKey(elementId, true);
  }
  return stageLayoutArtVisibilityKey(elementId);
}

function stageLayoutArtVisibilityKey(elementId, isGlobal = false) {
  if (!elementId) return "";
  return `${isGlobal ? "global" : currentStageLayoutStateId || "moment"}:${elementId}`;
}

function setStageLayoutArtElementShownForAction(action) {
  const elementId = action?.targetLayoutElementId || "";
  if (!elementId || !window.PartyGameVisualObject) return 0;
  const isShown = action.isShown !== false;
  const entity = stageLayoutEntityForElementId(elementId);
  const target = entity?.target || null;
  const visibilityKey = entity?.visibilityKey || stageLayoutElementVisibilityKey(elementId, target);
  if (!target) {
    stageLayoutArtVisibilityOverrides.set(visibilityKey, isShown);
    return 0;
  }
  if (typeof entity?.playVisibility === "function") {
    return entity.playVisibility(isShown, { instant: action.instant === true });
  }
  const visual = stageLayoutArtVisualFor(entity || stageLayoutEntityForElementId(elementId, target));
  if (!visual) return 0;
  const animation = window.PartyGameVisualObject.animationForVisibility(isShown, visual.isVisible());
  return visual.play(animation, { instant: action.instant === true });
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
  if (!stageBoard || !element?.id) return null;
  let host = stageBoard.querySelector(`.dynamic-stage-art-instance[data-layout-element-id="${CSS.escape(element.id)}"]`);
  if (host) return host;
  host = document.createElement("div");
  host.className = "dynamic-stage-art-instance stage-widget-art-host has-stage-widget-art";
  host.dataset.layoutElementId = element.id;
  stageBoard.appendChild(host);
  return host;
}

function renderStageArtInstance(element, host) {
  const composition = artComposition(element.artCompositionId);
  const artRuntime = window.PartyGameArtObject;
  if (!host) return false;
  if (!composition || !artRuntime) {
    clearStageArtInstanceRenderer(element.id, host);
    host.dataset.stageLayoutArtMissing = "true";
    return false;
  }
  delete host.dataset.stageLayoutArtMissing;
  let renderer = stageArtInstanceRenderers.get(element.id);
  if (!renderer) {
    const layer = document.createElement("div");
    layer.className = "stage-widget-art-layer";
    host.replaceChildren(layer);
    renderer = new artRuntime.ArtObjectTreeRenderer({
      host: layer,
      document,
      gameObjectApi: window.PartyGameGameObject || window.PartyGameStageGameObject,
      visualAnimation: window.PartyGameVisualObject
    });
    stageArtInstanceRenderers.set(element.id, renderer);
  }
  renderer.render(composition.components || [], composition.canvas || { width: 1, height: 1 }, { instant: true });
  return true;
}

function clearStageArtInstanceRenderer(elementId, host = null) {
  const renderer = stageArtInstanceRenderers.get(elementId);
  if (renderer) renderer.clear({ instant: true });
  stageArtInstanceRenderers.delete(elementId);
  if (host) host.replaceChildren();
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
