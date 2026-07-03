const {
  stageLayoutWidgetArtCompositionId
} = require("../shared/stage-layout-art-widgets");
const {
  controllerLayoutWidgetArtCompositionId
} = require("../shared/controller-layout-art-widgets");
const artComponentSchema = require("../shared/art-component-schema");
const {
  isLayoutTextArtElementId,
  isLayoutTextArtSelector,
  layoutTextArtCompositionId
} = require("../shared/layout-text-art");

function createLayoutNormalizationRuntime({
  cleanFlowText,
  cleanLayoutSelector,
  cleanLayoutText,
  defaultCanvas,
  normalizeColor,
  normalizeFlowId,
  normalizeLayoutNumber
}) {
  function normalizeLayoutState(state, stateIndex) {
    if (!state || typeof state !== "object") return null;
    const fallbackId = stateIndex === 0 ? "lobby" : `layout-state-${stateIndex + 1}`;
    return {
      id: normalizeFlowId(state.id || state.name, fallbackId),
      name: cleanFlowText(state.name, state.id || fallbackId),
      hiddenInStates: state.id === "global" || stateIndex < 0 ? state.hiddenInStates === true : false,
      hiddenGlobals: Array.isArray(state.hiddenGlobals)
        ? [...new Set(state.hiddenGlobals.map((id) => normalizeFlowId(id, "")).filter(Boolean))]
        : null,
      elements: Array.isArray(state.elements)
        ? state.elements.map((element, elementIndex) => normalizeLayoutElement(element, elementIndex)).filter(Boolean)
        : []
    };
  }

  function normalizeLayoutElement(element, elementIndex) {
    if (!element || typeof element !== "object") return null;
    const fallbackId = `layout-element-${elementIndex + 1}`;
    const id = normalizeFlowId(element.id || element.name, fallbackId);
    const width = normalizeLayoutNumber(element.width, 240, 24, 4000);
    const height = normalizeLayoutNumber(element.height, 100, 24, 4000);
    const selector = cleanLayoutSelector(element.selector);
    const stageWidgetArtCompositionId = stageLayoutWidgetArtCompositionId(id);
    const controllerWidgetArtCompositionId =
      controllerLayoutWidgetArtCompositionId(id) || controllerLayoutWidgetArtCompositionId(selector);
    const widgetArtCompositionId = stageWidgetArtCompositionId || controllerWidgetArtCompositionId;
    const shouldPromoteTextToArt = isLayoutTextArtElementId(id) || isLayoutTextArtSelector(selector);
    const kind = widgetArtCompositionId || shouldPromoteTextToArt ? "art" : normalizeLayoutElementKind(element.kind, selector);
    const artCompositionId = normalizeFlowId(element.artCompositionId, "") || widgetArtCompositionId || (shouldPromoteTextToArt ? layoutTextArtCompositionId : "");
    const textDefaultsEnabled = kind === "text" || shouldPromoteTextToArt;
    const defaultAnimationState = normalizeLayoutDefaultAnimationState(element.defaultAnimationState)
      || (id === "startpopup" ? "park" : controllerWidgetArtCompositionId ? "on" : "");
    return {
      id,
      name: cleanFlowText(element.name, element.id || fallbackId),
      selector: shouldPromoteTextToArt ? "" : selector,
      kind,
      artCompositionId: kind === "art" ? artCompositionId : "",
      hidden: element.hidden === true,
      locked: element.locked === true,
      x: normalizeLayoutNumber(element.x, defaultCanvas.width / 2, -5000, 15000),
      y: normalizeLayoutNumber(element.y, defaultCanvas.height / 2, -5000, 15000),
      width,
      height,
      scale: normalizeLayoutNumber(element.scale, 1, 0.05, 10),
      rotation: normalizeLayoutNumber(element.rotation, 0, -3600, 3600),
      defaultAnimationState,
      defaultText: textDefaultsEnabled ? cleanLayoutText(element.defaultText) : "",
      fontSize: textDefaultsEnabled ? normalizeLayoutNumber(element.fontSize, 58, 6, 260) : 58,
      autoFitText: textDefaultsEnabled ? element.autoFitText === true : false,
      fontFamily: textDefaultsEnabled ? artComponentSchema.normalizeTextFontFamily(element.fontFamily) : "",
      fontColor: textDefaultsEnabled ? normalizeColor(element.fontColor) || "#ffffff" : "#ffffff"
    };
  }

  function normalizeLayoutElementKind(kind, selector) {
    const cleanKind = String(kind || "").trim().toLowerCase();
    if (cleanKind === "text") return "text";
    return /waitingstatus|joinprompt|stage-title|stage(?:presentation|prompt|intro)|roundintro.*text/i.test(String(selector || "")) ? "text" : "art";
  }

  function normalizeLayoutDefaultAnimationState(value) {
    const cleanValue = String(value || "").trim().toLowerCase();
    return ["park", "on", "off", "appear", "disappear", "update"].includes(cleanValue) ? cleanValue : "";
  }

  function dedupeLayoutElements(elements) {
    const seen = new Set();
    const deduped = [];
    for (const element of elements || []) {
      const normalizedElement = normalizeLayoutElement(element, deduped.length);
      if (!normalizedElement) continue;
      const key = normalizedElement.id || normalizedElement.selector;
      const selectorKey = normalizedElement.selector ? `selector:${normalizedElement.selector}` : "";
      if (seen.has(key) || (selectorKey && seen.has(selectorKey))) continue;
      seen.add(key);
      if (selectorKey) seen.add(selectorKey);
      deduped.push(normalizedElement);
    }
    return deduped;
  }

  return {
    dedupeLayoutElements,
    normalizeLayoutElement,
    normalizeLayoutState
  };
}

module.exports = { createLayoutNormalizationRuntime };
