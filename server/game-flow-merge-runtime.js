function createGameFlowMergeRuntime({ readGameFlowSource }) {
  function mergeFlowWithExistingSubActions(incomingFlow, existingFlow = null) {
    const incomingStates = Array.isArray(incomingFlow?.states) ? incomingFlow.states : [];
    if (incomingStates.length === 0) return incomingFlow;
    const existing = existingFlow || readGameFlowSource();

    const existingActionsById = new Map();
    for (const state of existing?.states || []) {
      for (const action of state.actions || []) {
        indexActionTree(action, existingActionsById);
      }
    }

    return {
      ...incomingFlow,
      states: incomingStates.map((state) => ({
        ...state,
        actions: Array.isArray(state.actions)
          ? state.actions.map((action) => mergeActionSubActions(action, existingActionsById))
          : state.actions
      }))
    };
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
