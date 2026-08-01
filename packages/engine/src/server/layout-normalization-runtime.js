"use strict";

const artComponentSchema = require("../shared/art-component-schema");
const { canonicalLifecycleLabel } = require("../shared/lifecycle-labels");

function createLayoutNormalizationRuntime({
  cleanFlowText,
  cleanLayoutSelector,
  cleanLayoutText,
  controllerLayoutWidgetArtCompositionId = () => "",
  defaultAnimationStateForElement = () => "",
  defaultCanvas,
  inferLayoutElementKind = (kind) => String(kind || "").trim().toLowerCase() === "text" ? "text" : "art",
  isLayoutTextArtElementId = () => false,
  isLayoutTextArtSelector = () => false,
  layoutTextArtCompositionId = "",
  normalizeColor,
  normalizeFlowId,
  normalizeLayoutNumber,
  stageLayoutWidgetArtCompositionId = () => ""
}) {
  function normalizeLayoutTags(value) {
    if (!Array.isArray(value)) return [];
    const tags = [];
    const seen = new Set();
    for (const rawTag of value) {
      const tag = String(rawTag ?? "").replace(/\s+/g, " ").trim().slice(0, 64);
      const key = tag.toLowerCase();
      if (!tag || seen.has(key)) continue;
      seen.add(key);
      tags.push(tag);
      if (tags.length >= 32) break;
    }
    return tags;
  }

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
      hiddenLayers: Array.isArray(state.hiddenLayers)
        ? [...new Set(state.hiddenLayers.map((id) => normalizeFlowId(id, "")).filter(Boolean))]
        : [],
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
    const stageWidgetCompositionId = stageLayoutWidgetArtCompositionId(id);
    const controllerWidgetCompositionId =
      controllerLayoutWidgetArtCompositionId(id) || controllerLayoutWidgetArtCompositionId(selector);
    const widgetArtCompositionId = stageWidgetCompositionId || controllerWidgetCompositionId;
    const shouldPromoteTextToArt = isLayoutTextArtElementId(id) || isLayoutTextArtSelector(selector);
    const kind = widgetArtCompositionId || shouldPromoteTextToArt ? "art" : inferLayoutElementKind(element.kind, selector);
    const artCompositionId = normalizeFlowId(element.artCompositionId, "") || widgetArtCompositionId || (shouldPromoteTextToArt ? layoutTextArtCompositionId : "");
    const textDefaultsEnabled = kind === "text" || shouldPromoteTextToArt;
    const defaultAnimationState = normalizeLayoutDefaultAnimationState(element.defaultAnimationState)
      || normalizeLayoutDefaultAnimationState(defaultAnimationStateForElement({
        controllerWidgetArtCompositionId: controllerWidgetCompositionId,
        element,
        id,
        selector,
        stageWidgetArtCompositionId: stageWidgetCompositionId
      }));
    return {
      id,
      name: cleanFlowText(element.name, element.id || fallbackId),
      selector: shouldPromoteTextToArt ? "" : selector,
      kind,
      artCompositionId: kind === "art" ? artCompositionId : "",
      layoutLayer: String(element.layoutLayer || "").trim().toLowerCase() === "background" ? "background" : "content",
      hidden: element.hidden === true,
      locked: element.locked === true,
      x: normalizeLayoutNumber(element.x, defaultCanvas.width / 2, -5000, 15000),
      y: normalizeLayoutNumber(element.y, defaultCanvas.height / 2, -5000, 15000),
      width,
      height,
      scale: normalizeLayoutNumber(element.scale, 1, 0.05, 10),
      rotation: normalizeLayoutNumber(element.rotation, 0, -3600, 3600),
      tags: normalizeLayoutTags(element.tags),
      defaultAnimationState,
      defaultText: textDefaultsEnabled ? cleanLayoutText(element.defaultText) : "",
      fontSize: textDefaultsEnabled ? normalizeLayoutNumber(element.fontSize, 58, 6, 260) : 58,
      autoFitText: textDefaultsEnabled ? element.autoFitText === true : false,
      fontFamily: textDefaultsEnabled ? artComponentSchema.normalizeTextFontFamily(element.fontFamily) : "",
      fontColor: textDefaultsEnabled ? normalizeColor(element.fontColor) || "#ffffff" : "#ffffff"
    };
  }

  function normalizeLayoutDefaultAnimationState(value) {
    return canonicalLifecycleLabel(value) || "";
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
