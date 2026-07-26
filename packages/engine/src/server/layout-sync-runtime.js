"use strict";

function createLayoutSyncRuntime({
  createControllerInputLayoutStates,
  createLayoutStateForFlowState,
  dedupeLayoutElements,
  normalizeControllerLayouts,
  normalizeGameFlow,
  normalizeLayoutState,
  normalizeStageLayouts,
  readGameFlow
}) {
  function controllerLayoutIdsReferencedByFlow(flow) {
    const ids = new Set();
    function visitActions(actions) {
      for (const action of actions || []) {
        if (!action || typeof action !== "object") continue;
        if (action.type === "setControllerLayout" && action.controllerLayoutId) {
          ids.add(action.controllerLayoutId);
        }
        visitActions(action.subActions);
        visitActions(action.actions);
      }
    }
    for (const state of flow.states || []) visitActions(state.actions);
    visitActions((flow.routeNodes || []).filter((node) => node?.routeNodeType === "action"));
    return ids;
  }

  function syncStageLayoutsWithFlow(layouts, flow) {
    const normalizedLayouts = normalizeStageLayouts(layouts);
    const normalizedFlow = normalizeGameFlow(flow || readGameFlow());
    normalizedLayouts.global.elements = dedupeLayoutElements(normalizedLayouts.global.elements || []);
    normalizedLayouts.states = (normalizedLayouts.states || [])
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
    const inputLayoutStates = createControllerInputLayoutStates();
    normalizedLayouts.global.elements = dedupeLayoutElements(normalizedLayouts.global.elements || []);
    normalizedLayouts.states = (normalizedLayouts.states || [])
      .map((state) => ({ ...state, elements: dedupeLayoutElements(state.elements || []) }));
    for (const inputLayoutState of inputLayoutStates) {
      if (normalizedLayouts.states.some((state) => state.id === inputLayoutState.id)) continue;
      normalizedLayouts.states.push(normalizeLayoutState(inputLayoutState, -1));
    }
    return normalizedLayouts;
  }

  return {
    controllerLayoutIdsReferencedByFlow,
    syncControllerLayoutsWithFlow,
    syncStageLayoutsWithFlow
  };
}

module.exports = { createLayoutSyncRuntime };
