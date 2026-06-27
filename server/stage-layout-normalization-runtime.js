function createStageLayoutNormalizationRuntime({
  cloneJson,
  defaultStageLayouts,
  normalizeLayoutNumber,
  normalizeLayoutState
}) {
  function normalizeStageLayouts(layouts) {
    const incomingCanvas = layouts?.canvas || defaultStageLayouts.canvas;
    const canvas = {
      width: normalizeLayoutNumber(incomingCanvas.width, defaultStageLayouts.canvas.width, 640, 10000),
      height: normalizeLayoutNumber(incomingCanvas.height, defaultStageLayouts.canvas.height, 360, 10000)
    };
    const incomingStates = Array.isArray(layouts?.states) ? layouts.states : defaultStageLayouts.states;
    const normalizedDefaultGlobal = normalizeLayoutState(defaultStageLayouts.global, -1);
    const normalizedDefaultStates = defaultStageLayouts.states.map((state, index) => normalizeLayoutState(state, index)).filter(Boolean);
    const defaultStatesById = new Map(normalizedDefaultStates.map((state) => [state.id, state]));
    const normalizedIncomingStates = incomingStates.map((state, stateIndex) => normalizeLayoutState(state, stateIndex)).filter(Boolean);
    const hasIncomingGlobal = layouts && Object.prototype.hasOwnProperty.call(layouts, "global");
    const incomingGlobal = normalizeLayoutState(hasIncomingGlobal ? layouts.global : defaultStageLayouts.global, -1);
    const migrated = migrateStageLayoutStates(normalizedIncomingStates, incomingGlobal, normalizedDefaultGlobal, Boolean(incomingGlobal));
    const migratedStates = migrated.states;
    const normalizedStates = [...migratedStates];
    for (const defaultState of normalizedDefaultStates) {
      if (!normalizedStates.some((state) => state.id === defaultState.id)) {
        normalizedStates.push(cloneJson(defaultState));
      }
    }
    const globalElements = [...(migrated.global?.elements || [])];
    return {
      canvas,
      global: {
        ...normalizedDefaultGlobal,
        ...(migrated.global || {}),
        id: "global",
        name: migrated.global?.name || normalizedDefaultGlobal.name,
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

  function migrateStageLayoutStates(states, global, defaultGlobal, hasExplicitGlobal = false) {
    const migratedGlobal = global ? cloneJson(global) : cloneJson(defaultGlobal);
    migratedGlobal.id = "global";
    migratedGlobal.name = migratedGlobal.name || "Global Layout";
    migratedGlobal.elements = Array.isArray(migratedGlobal.elements) ? migratedGlobal.elements : [];
    const lobby = states.find((state) => state.id === "lobby");
    const starting = states.find((state) => state.id === "starting");
    const countdown = starting?.elements?.find((element) => element.id === "startpopup");
    if (lobby && countdown && !lobby.elements.some((element) => element.id === "startpopup")) {
      lobby.elements.unshift({
        ...countdown,
        id: "startpopup",
        name: countdown.name || "Countdown Popup",
        selector: countdown.selector || "#startPopup"
      });
    }
    const globalElementIds = new Set((defaultGlobal.elements || []).map((element) => element.id));
    for (const state of states) {
      state.elements = (state.elements || []).filter((element) => {
        if (!globalElementIds.has(element.id)) return true;
        const existingIndex = migratedGlobal.elements.findIndex((item) => item.id === element.id);
        if (existingIndex === -1) {
          migratedGlobal.elements.push(cloneJson(element));
        } else if (!hasExplicitGlobal) {
          migratedGlobal.elements[existingIndex] = cloneJson(element);
        }
        return false;
      });
    }
    return { states, global: migratedGlobal };
  }

  return {
    migrateStageLayoutStates,
    normalizeStageLayouts
  };
}

module.exports = { createStageLayoutNormalizationRuntime };
