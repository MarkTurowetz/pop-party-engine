"use strict";

function createStageLayoutNormalizationRuntime({
  cloneJson,
  defaultStageLayouts,
  includeMissingDefaultStates = false,
  migrateStageLayoutStates = ({ global, states }) => ({ global, states }),
  normalizeGlobalElements = ({ globalElements }) => globalElements,
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
    const hasIncomingGlobal = Boolean(layouts && Object.prototype.hasOwnProperty.call(layouts, "global"));
    const incomingGlobal = normalizeLayoutState(hasIncomingGlobal ? layouts.global : defaultStageLayouts.global, -1);
    const migrated = migrateStageLayoutStates({
      cloneJson,
      defaultGlobal: normalizedDefaultGlobal,
      global: incomingGlobal,
      hasExplicitGlobal: Boolean(incomingGlobal),
      states: normalizedIncomingStates
    });
    const normalizedStates = [...migrated.states];
    if (includeMissingDefaultStates) {
      for (const defaultState of normalizedDefaultStates) {
        if (!normalizedStates.some((state) => state.id === defaultState.id)) {
          normalizedStates.push(cloneJson(defaultState));
        }
      }
    }
    const globalElements = normalizeGlobalElements({
      cloneJson,
      defaultGlobal: normalizedDefaultGlobal,
      global: migrated.global,
      globalElements: [...(migrated.global?.elements || [])]
    });
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

  return { normalizeStageLayouts };
}

module.exports = { createStageLayoutNormalizationRuntime };
