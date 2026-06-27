const {
  stageLayoutWidgetArtCompositionId
} = require("../shared/stage-layout-art-widgets");

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
    const widgetArtCompositionId = stageLayoutWidgetArtCompositionId(id);
    const kind = widgetArtCompositionId ? "art" : normalizeLayoutElementKind(element.kind, selector);
    const artCompositionId = normalizeFlowId(element.artCompositionId, "") || widgetArtCompositionId;
    const defaultAnimationState = normalizeLayoutDefaultAnimationState(element.defaultAnimationState)
      || (id === "startpopup" ? "park" : "");
    return {
      id,
      name: cleanFlowText(element.name, element.id || fallbackId),
      selector,
      kind,
      artCompositionId: kind === "art" ? artCompositionId : "",
      x: normalizeLayoutNumber(element.x, defaultCanvas.width / 2, -5000, 15000),
      y: normalizeLayoutNumber(element.y, defaultCanvas.height / 2, -5000, 15000),
      width,
      height,
      scale: normalizeLayoutNumber(element.scale, 1, 0.05, 10),
      rotation: normalizeLayoutNumber(element.rotation, 0, -3600, 3600),
      defaultAnimationState,
      defaultText: kind === "text" ? cleanLayoutText(element.defaultText) : "",
      fontSize: kind === "text" ? normalizeLayoutNumber(element.fontSize, 58, 6, 260) : 58,
      autoFitText: kind === "text" ? element.autoFitText !== false : false,
      fontColor: kind === "text" ? normalizeColor(element.fontColor) || "#ffffff" : "#ffffff"
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
