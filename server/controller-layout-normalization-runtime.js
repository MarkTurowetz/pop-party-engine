function createControllerLayoutNormalizationRuntime({
  cloneJson,
  defaultControllerLayouts,
  normalizeLayoutNumber,
  normalizeLayoutState
}) {
  function normalizeControllerLayouts(layouts) {
    const incomingCanvas = layouts?.canvas || defaultControllerLayouts.canvas;
    const canvas = {
      width: normalizeLayoutNumber(incomingCanvas.width, defaultControllerLayouts.canvas.width, 240, 2000),
      height: normalizeLayoutNumber(incomingCanvas.height, defaultControllerLayouts.canvas.height, 320, 3000)
    };
    const incomingStates = Array.isArray(layouts?.states) ? layouts.states : defaultControllerLayouts.states;
    const normalizedDefaultGlobal = normalizeLayoutState(defaultControllerLayouts.global, -1);
    const normalizedDefaultStates = defaultControllerLayouts.states.map((state, index) => normalizeLayoutState(state, index)).filter(Boolean);
    const defaultStatesById = new Map(normalizedDefaultStates.map((state) => [state.id, state]));
    const normalizedStates = incomingStates.map((state, stateIndex) => normalizeLayoutState(state, stateIndex)).filter(Boolean);
    for (const defaultState of normalizedDefaultStates) {
      if (!normalizedStates.some((state) => state.id === defaultState.id)) {
        normalizedStates.push(cloneJson(defaultState));
      }
    }
    const hasIncomingGlobal = layouts && Object.prototype.hasOwnProperty.call(layouts, "global");
    const incomingGlobal = normalizeLayoutState(hasIncomingGlobal ? layouts.global : defaultControllerLayouts.global, -1);
    const globalElements = [...(incomingGlobal?.elements || [])];
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
        if (!defaultState) return state;
        const hiddenGlobals = Array.isArray(state.hiddenGlobals) ? state.hiddenGlobals : defaultState.hiddenGlobals || [];
        return {
          ...state,
          hiddenGlobals,
          elements: mergeMissingDefaultElements(state.elements, defaultState.elements)
        };
      })
    };
  }

  function mergeMissingDefaultElements(elements = [], defaultElements = []) {
    const merged = [...(elements || [])];
    const existingIds = new Set(merged.map((element) => element.id));
    const existingSelectors = new Set(merged.map((element) => element.selector).filter(Boolean));
    for (const defaultElement of defaultElements || []) {
      if (existingIds.has(defaultElement.id)) continue;
      if (defaultElement.selector && existingSelectors.has(defaultElement.selector)) continue;
      merged.push(cloneJson(defaultElement));
      existingIds.add(defaultElement.id);
      if (defaultElement.selector) existingSelectors.add(defaultElement.selector);
    }
    return merged;
  }

  return { normalizeControllerLayouts };
}

module.exports = { createControllerLayoutNormalizationRuntime };
