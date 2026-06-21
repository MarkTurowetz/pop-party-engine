function createFlowNavigationRuntime({
  flowActionTarget,
  isNoActionTarget,
  isReturnActionTarget,
  localDraftStore,
  normalizeFlowId,
  readGameFlow
}) {
  function getFlowState(flow, stateId) {
    return flow.states.find((state) => state.id === stateId) || null;
  }

  function runtimeGameFlow(room) {
    return room?.runtimeFlowOverride || localDraftStore.flow || readGameFlow();
  }

  function getStateActions(stateId, room = null) {
    return getFlowState(runtimeGameFlow(room), stateId)?.actions || [];
  }

  function flowActionIndexById(room, actionId) {
    const target = String(actionId || "");
    if (!target) return -1;
    const normalizedTarget = normalizeFlowId(target, "");
    const actions = getStateActions(room.phase, room);
    return actions.findIndex((action) => {
      if (action.id === target) return true;
      if (normalizeFlowId(action.id, "") === normalizedTarget) return true;
      if (normalizeFlowId(action.name, "") === normalizedTarget) return true;
      return false;
    });
  }

  function entryActionIndexForPhase(room, phase) {
    const state = runtimeGameFlow(room).states.find((item) => item.id === phase);
    const actions = getStateActions(phase, room);
    const target = flowActionTarget(state?.entryTargetActionId);
    if (isReturnActionTarget(target)) return -2;
    if (isNoActionTarget(target)) return -1;
    if (target) {
      const previousPhase = room.phase;
      room.phase = phase;
      const targetIndex = flowActionIndexById(room, target);
      room.phase = previousPhase;
      if (targetIndex >= 0) return targetIndex;
    }
    return actions.length ? 0 : -1;
  }

  function advanceRoomAction(room) {
    const actions = getStateActions(room.phase, room);
    if (actions.length === 0) return;
    room.actionIndex = Math.min(room.actionIndex + 1, actions.length);
  }

  return {
    advanceRoomAction,
    entryActionIndexForPhase,
    flowActionIndexById,
    getFlowState,
    getStateActions,
    runtimeGameFlow
  };
}

module.exports = { createFlowNavigationRuntime };
