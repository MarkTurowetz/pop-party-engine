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

  function subroutineActions(subroutine) {
    return Array.isArray(subroutine?.actions) ? subroutine.actions : [];
  }

  function subroutineForPath(flow, stateId, path = []) {
    let subroutine = getFlowState(flow, stateId);
    if (!subroutine) return null;
    for (const id of path) {
      const child = subroutineActions(subroutine).find((action) => action.id === id);
      if (!child || child.type !== "subroutine") return null;
      subroutine = child;
    }
    return subroutine;
  }

  function roomSubroutinePath(room, stateId) {
    if (!room || room.phase !== stateId) return [];
    return Array.isArray(room.subroutinePath) ? room.subroutinePath.filter(Boolean) : [];
  }

  function currentSubroutine(room, stateId = room?.phase) {
    if (!stateId) return null;
    return subroutineForPath(runtimeGameFlow(room), stateId, roomSubroutinePath(room, stateId));
  }

  function getStateActions(stateId, room = null) {
    return subroutineActions(currentSubroutine(room, stateId));
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
    const state = getFlowState(runtimeGameFlow(room), phase);
    const actions = subroutineActions(state);
    const target = flowActionTarget(state?.entryTargetActionId);
    if (isReturnActionTarget(target)) return -2;
    if (isNoActionTarget(target)) return -1;
    if (target) {
      const previousPhase = room.phase;
      const previousSubroutinePath = room.subroutinePath;
      room.phase = phase;
      room.subroutinePath = [];
      const targetIndex = flowActionIndexById(room, target);
      room.phase = previousPhase;
      room.subroutinePath = previousSubroutinePath;
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
    currentSubroutine,
    entryActionIndexForPhase,
    flowActionIndexById,
    getFlowState,
    getStateActions,
    runtimeGameFlow
  };
}

module.exports = { createFlowNavigationRuntime };
