function createActionEffectStateRuntime() {
  function clearAppliedActionEffects(room) {
    room.appliedActionEffectId = "";
    room.appliedActionEffectIds = new Set();
    room.hostAudioActionSelections = {};
  }

  function hasAppliedActionEffect(room, actionId) {
    if (!room.appliedActionEffectIds) {
      room.appliedActionEffectIds = new Set(room.appliedActionEffectId ? [room.appliedActionEffectId] : []);
    }
    return room.appliedActionEffectIds.has(actionId);
  }

  function markAppliedActionEffect(room, actionId) {
    if (!room.appliedActionEffectIds) {
      room.appliedActionEffectIds = new Set();
    }
    room.appliedActionEffectIds.add(actionId);
    room.appliedActionEffectId = actionId;
  }

  return {
    clearAppliedActionEffects,
    hasAppliedActionEffect,
    markAppliedActionEffect
  };
}

module.exports = { createActionEffectStateRuntime };
