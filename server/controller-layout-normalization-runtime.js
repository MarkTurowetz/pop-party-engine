function createControllerLayoutNormalizationRuntime({
  cloneJson,
  defaultControllerLayouts,
  normalizeLayoutNumber,
  normalizeLayoutState
}) {
  function normalizeControllerInitialState(value) {
    const state = String(value || "").trim().toLowerCase();
    return ["off", "park", "disappear", "hidden", "hide"].includes(state) ? "Off" : "On";
  }

  function normalizeControllerState(state, stateIndex) {
    const normalized = normalizeLayoutState(state, stateIndex);
    if (!normalized) return null;
    normalized.elements = (normalized.elements || []).map((element) => ({
      ...element,
      defaultAnimationState: normalizeControllerInitialState(element.defaultAnimationState)
    }));
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
    const normalizedStates = incomingStates.map((state, stateIndex) => normalizeControllerState(state, stateIndex)).filter(Boolean);
    for (const defaultState of normalizedDefaultStates) {
      if (!normalizedStates.some((state) => state.id === defaultState.id)) {
        normalizedStates.push(cloneJson(defaultState));
      }
    }
    const hasIncomingGlobal = layouts && Object.prototype.hasOwnProperty.call(layouts, "global");
    const incomingGlobal = normalizeControllerState(hasIncomingGlobal ? layouts.global : defaultControllerLayouts.global, -1);
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
          hiddenGlobals
        };
      })
    };
  }

  return { normalizeControllerLayouts };
}

module.exports = { createControllerLayoutNormalizationRuntime };
