"use strict";

function createControllerLayoutNormalizationRuntime({
  cloneJson,
  defaultControllerLayouts,
  includeMissingDefaultStates = false,
  migrateControllerElement = (element) => element,
  migrateControllerState = (state) => state,
  normalizeLayoutNumber,
  normalizeLayoutState,
  shouldIncludeControllerState = () => true,
  shouldIncludeGlobalElement = () => true,
  shouldIncludeHiddenGlobal = () => true
}) {
  function normalizeControllerInitialState(value) {
    const state = String(value || "").trim().toLowerCase();
    return ["off", "park", "disappear", "hidden", "hide"].includes(state) ? "Off" : "On";
  }

  function normalizeControllerState(state, stateIndex) {
    const normalized = normalizeLayoutState(state, stateIndex);
    if (!normalized) return null;
    normalized.elements = (normalized.elements || []).map((element) => {
      const migratedElement = migrateControllerElement(element, normalized);
      return {
        ...migratedElement,
        defaultAnimationState: normalizeControllerInitialState(migratedElement.defaultAnimationState)
      };
    });
    return normalized;
  }

  function normalizeControllerLayouts(layouts) {
    const incomingCanvas = layouts?.canvas || defaultControllerLayouts.canvas;
    const canvas = {
      width: normalizeLayoutNumber(incomingCanvas.width, defaultControllerLayouts.canvas.width, 240, 2000),
      height: normalizeLayoutNumber(incomingCanvas.height, defaultControllerLayouts.canvas.height, 320, 3000)
    };
    const incomingStates = Array.isArray(layouts?.states) ? layouts.states : defaultControllerLayouts.states;
    const normalizedDefaultGlobal = normalizeControllerState(defaultControllerLayouts.global, -1);
    const normalizedDefaultStates = defaultControllerLayouts.states.map((state, index) => normalizeControllerState(state, index)).filter(Boolean);
    const defaultStatesById = new Map(normalizedDefaultStates.map((state) => [state.id, state]));
    const normalizedStates = incomingStates
      .map((state, stateIndex) => normalizeControllerState(state, stateIndex))
      .map((state) => state ? migrateControllerState(state) : null)
      .filter((state) => state && shouldIncludeControllerState(state));
    if (includeMissingDefaultStates) {
      for (const defaultState of normalizedDefaultStates) {
        if (!normalizedStates.some((state) => state.id === defaultState.id)) {
          normalizedStates.push(cloneJson(defaultState));
        }
      }
    }
    const hasIncomingGlobal = Boolean(layouts && Object.prototype.hasOwnProperty.call(layouts, "global"));
    const incomingGlobal = normalizeControllerState(hasIncomingGlobal ? layouts.global : defaultControllerLayouts.global, -1);
    const globalElements = (incomingGlobal?.elements || []).filter(shouldIncludeGlobalElement);
    const globalElementIds = new Set(globalElements.map((element) => element.id));
    return {
      canvas,
      global: {
        ...normalizedDefaultGlobal,
        ...(incomingGlobal || {}),
        id: "global",
        name: incomingGlobal?.name || normalizedDefaultGlobal.name,
        elements: globalElements
      },
      states: normalizedStates.map((state) => {
        const defaultState = defaultStatesById.get(state.id);
        const hiddenGlobals = new Set(
          (Array.isArray(state.hiddenGlobals) ? state.hiddenGlobals : defaultState?.hiddenGlobals || [])
            .filter(shouldIncludeHiddenGlobal)
        );
        for (const element of state.elements || []) {
          if (globalElementIds.has(element.id)) hiddenGlobals.add(element.id);
        }
        return {
          ...state,
          hiddenGlobals: [...hiddenGlobals]
        };
      })
    };
  }

  return { normalizeControllerInitialState, normalizeControllerLayouts };
}

module.exports = { createControllerLayoutNormalizationRuntime };
