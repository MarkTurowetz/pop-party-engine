function createGameFlowMergeRuntime({ readGameFlowSource, requiredFlowStates = [] }) {
  function mergeFlowWithExistingSubActions(incomingFlow, existingFlow = null) {
    const existing = existingFlow || readGameFlowSource();
    const submittedStates = Array.isArray(incomingFlow?.states) ? incomingFlow.states : [];
    const incomingStates = submittedStates.length > 0 ? submittedStates : existing?.states || [];

    const existingActionsById = new Map();
    for (const state of existing?.states || []) {
      for (const action of state.actions || []) {
        indexActionTree(action, existingActionsById);
      }
    }

    const mergedStates = incomingStates.map((state) => ({
      ...state,
      actions: Array.isArray(state.actions)
        ? state.actions.map((action) => mergeActionSubActions(action, existingActionsById))
        : state.actions
    }));

    restoreRequiredStates(mergedStates, existing?.states || []);

    return {
      ...incomingFlow,
      states: mergedStates
    };
  }

  function restoreRequiredStates(states, existingStates) {
    const requiredIds = requiredFlowStates.map((state) => state?.id).filter(Boolean);
    const existingById = new Map(existingStates.map((state) => [state?.id, state]));
    const fallbackById = new Map(requiredFlowStates.map((state) => [state?.id, state]));

    for (const [requiredIndex, requiredId] of requiredIds.entries()) {
      if (states.some((state) => state?.id === requiredId)) continue;
      const restoredState = existingById.get(requiredId) || fallbackById.get(requiredId);
      if (!restoredState) continue;

      const nextRequiredIds = requiredIds.slice(requiredIndex + 1);
      const nextRequiredIndex = states.findIndex((state) => nextRequiredIds.includes(state?.id));
      if (nextRequiredIndex >= 0) {
        states.splice(nextRequiredIndex, 0, restoredState);
        continue;
      }

      const previousRequiredIds = requiredIds.slice(0, requiredIndex).reverse();
      const previousRequiredIndex = states.findIndex((state) => previousRequiredIds.includes(state?.id));
      states.splice(previousRequiredIndex >= 0 ? previousRequiredIndex + 1 : 0, 0, restoredState);
    }
  }

  function indexActionTree(action, actionsById) {
    if (!action?.id) return;
    actionsById.set(action.id, action);
    for (const childAction of action.actions || []) {
      indexActionTree(childAction, actionsById);
    }
    for (const subAction of action.subActions || []) {
      indexActionTree(subAction, actionsById);
    }
  }

  function mergeActionSubActions(action, existingActionsById) {
    if (!action || typeof action !== "object") return action;
    const existingAction = existingActionsById.get(action.id);
    const hasIncomingActions = Array.isArray(action.actions);
    const actions = hasIncomingActions ? action.actions : existingAction?.actions;
    const hasIncomingSubActions = Array.isArray(action.subActions);
    const subActions = hasIncomingSubActions ? action.subActions : existingAction?.subActions;
    return {
      ...action,
      actions: Array.isArray(actions)
        ? actions.map((childAction) => mergeActionSubActions(childAction, existingActionsById))
        : actions,
      subActions: Array.isArray(subActions)
        ? subActions.map((subAction) => mergeActionSubActions(subAction, existingActionsById))
        : subActions
    };
  }

  return {
    mergeFlowWithExistingSubActions
  };
}

module.exports = { createGameFlowMergeRuntime };
