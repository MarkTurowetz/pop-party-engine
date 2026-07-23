"use strict";

function createGameFlowMergeRuntime({ requiredFlowStates = [] }) {
  const requiredStateIds = requiredFlowStates
    .map((state) => String(state?.id || "").trim())
    .filter(Boolean);

  function assertActionTree(actions, path) {
    if (!Array.isArray(actions)) {
      throw new Error(`${path} must be an array; refusing to recover actions from previously saved flow data.`);
    }
    for (const [index, action] of actions.entries()) {
      const actionPath = `${path}[${index}]`;
      if (!action || typeof action !== "object" || Array.isArray(action)) {
        throw new Error(`${actionPath} must be an authored flow action object.`);
      }
      if (!String(action.id || "").trim()) {
        throw new Error(`${actionPath}.id is required.`);
      }
      if (!String(action.type || "").trim()) {
        throw new Error(`${actionPath}.type is required.`);
      }
      if (!Array.isArray(action.subActions)) {
        throw new Error(`${actionPath}.subActions must be an array; refusing to recover sub-actions from previously saved flow data.`);
      }
      assertActionTree(action.subActions, `${actionPath}.subActions`);
      if (action.type === "subroutine" || Object.prototype.hasOwnProperty.call(action, "actions")) {
        assertActionTree(action.actions, `${actionPath}.actions`);
      }
    }
  }

  function assertCompleteAuthoredFlow(incomingFlow) {
    if (!incomingFlow || typeof incomingFlow !== "object" || Array.isArray(incomingFlow)) {
      throw new Error("Game flow must be an authored object.");
    }
    if (!Array.isArray(incomingFlow.states) || incomingFlow.states.length === 0) {
      throw new Error("Game flow must contain at least one authored state; refusing to reuse previously saved states.");
    }
    if (!Array.isArray(incomingFlow.routeNodes)) {
      throw new Error("Game flow routeNodes must be an authored array.");
    }

    const stateIds = new Set();
    for (const [index, state] of incomingFlow.states.entries()) {
      const statePath = `flow.states[${index}]`;
      if (!state || typeof state !== "object" || Array.isArray(state)) {
        throw new Error(`${statePath} must be an authored flow state object.`);
      }
      const stateId = String(state.id || "").trim();
      if (!stateId) throw new Error(`${statePath}.id is required.`);
      stateIds.add(stateId);
      assertActionTree(state.actions, `${statePath}.actions`);
    }

    const missingRequiredStateIds = requiredStateIds.filter((stateId) => !stateIds.has(stateId));
    if (missingRequiredStateIds.length) {
      throw new Error(
        `Game flow is missing required authored state${missingRequiredStateIds.length === 1 ? "" : "s"}: ${missingRequiredStateIds.join(", ")}. `
        + "Refusing to restore them from older or starter flow data."
      );
    }
  }

  // Kept under its existing public name while callers migrate. This is now an
  // exact replacement boundary: existingFlow is deliberately ignored and no
  // state or action tree can leak from an earlier save.
  function mergeFlowWithExistingSubActions(incomingFlow, existingFlow = null) {
    void existingFlow;
    assertCompleteAuthoredFlow(incomingFlow);
    return structuredClone(incomingFlow);
  }

  return {
    assertCompleteAuthoredFlow,
    mergeFlowWithExistingSubActions
  };
}

module.exports = { createGameFlowMergeRuntime };
