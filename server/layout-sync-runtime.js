function createLayoutSyncRuntime({
  createControllerInputLayoutStates,
  createControllerLayoutStateForFlowState,
  createLayoutStateForFlowState,
  dedupeLayoutElements,
  normalizeControllerLayouts,
  normalizeGameFlow,
  normalizeLayoutState,
  normalizeStageLayouts,
  readGameFlow
}) {
  function syncStageLayoutsWithFlow(layouts, flow) {
    const normalizedLayouts = normalizeStageLayouts(layouts);
    const normalizedFlow = normalizeGameFlow(flow || readGameFlow());
    const stateIds = new Set(normalizedFlow.states.map((state) => state.id));
    normalizedLayouts.global.elements = dedupeLayoutElements(normalizedLayouts.global.elements || []);
    normalizedLayouts.states = (normalizedLayouts.states || [])
      .filter((state) => stateIds.has(state.id))
      .map((state) => ({ ...state, elements: dedupeLayoutElements(state.elements || []) }));
    for (const flowState of normalizedFlow.states) {
      if (flowState.id === "lobby") continue;
      const seededState = normalizeLayoutState(createLayoutStateForFlowState(flowState), -1);
      const existingState = normalizedLayouts.states.find((state) => state.id === flowState.id);
      if (!existingState) {
        normalizedLayouts.states.push(seededState);
        continue;
      }
      existingState.name = flowState.name || existingState.name;
    }
    return normalizedLayouts;
  }

  function syncControllerLayoutsWithFlow(layouts, flow) {
    const normalizedLayouts = normalizeControllerLayouts(layouts);
    const normalizedFlow = normalizeGameFlow(flow || readGameFlow());
    const inputLayoutStates = createControllerInputLayoutStates();
    const stateIds = new Set(["join", ...normalizedFlow.states.map((state) => state.id), ...inputLayoutStates.map((state) => state.id)]);
    normalizedLayouts.global.elements = dedupeLayoutElements(normalizedLayouts.global.elements || []);
    normalizedLayouts.states = (normalizedLayouts.states || [])
      .filter((state) => stateIds.has(state.id))
      .map((state) => ({ ...state, elements: dedupeLayoutElements(state.elements || []) }));
    for (const flowState of normalizedFlow.states) {
      const existingState = normalizedLayouts.states.find((state) => state.id === flowState.id);
      if (existingState) {
        existingState.name = flowState.id === "lobby" ? existingState.name : flowState.name || existingState.name;
        existingState.elements = dedupeLayoutElements(existingState.elements || []);
        continue;
      }
      normalizedLayouts.states.push(normalizeLayoutState(createControllerLayoutStateForFlowState(flowState), -1));
    }
    for (const inputLayoutState of inputLayoutStates) {
      if (normalizedLayouts.states.some((state) => state.id === inputLayoutState.id)) continue;
      normalizedLayouts.states.push(normalizeLayoutState(inputLayoutState, -1));
    }
    return normalizedLayouts;
  }

  return {
    syncControllerLayoutsWithFlow,
    syncStageLayoutsWithFlow
  };
}

module.exports = { createLayoutSyncRuntime };
