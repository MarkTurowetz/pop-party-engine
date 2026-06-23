function createCraftingTimerRuntime({
  clearActiveInputFlowEvent,
  clearAnswersSubmittedAdvanceTimer,
  durationMs,
  emitInputFlowEvent
}) {
  function clearCraftingTimerTimeout(room) {
    if (!room.craftingTimerTimeoutId) return;
    clearTimeout(room.craftingTimerTimeoutId);
    room.craftingTimerTimeoutId = null;
  }

  function pauseCraftingTimer(room) {
    if (!room.craftingTimerRunning) return;
    room.craftingTimerRemainingMs = Math.max(0, (room.craftingTimerEndsAt || Date.now()) - Date.now());
    room.craftingTimerRunning = false;
    room.craftingTimerStartedAt = 0;
    room.craftingTimerEndsAt = 0;
    clearCraftingTimerTimeout(room);
  }

  function resumeCraftingTimer(room) {
    if (!room.craftingTimerShown || room.craftingTimerRunning || room.craftingTimerRemainingMs <= 0) return;
    const now = Date.now();
    room.craftingTimerRunning = true;
    room.craftingTimerStartedAt = now;
    room.craftingTimerEndsAt = now + Math.max(0, room.craftingTimerRemainingMs || room.craftingTimerDurationMs);
    scheduleCraftingTimerEnd(room);
  }

  function resetCraftingTimer(room) {
    clearAnswersSubmittedAdvanceTimer(room);
    clearCraftingTimerTimeout(room);
    room.craftingTimerShown = false;
    room.craftingTimerRunning = false;
    room.craftingTimerDurationMs = 0;
    room.craftingTimerRemainingMs = 0;
    room.craftingTimerStartedAt = 0;
    room.craftingTimerEndsAt = 0;
    room.craftingTimerActionId = "";
    room.craftingTimerTimerEndTargetActionId = "";
    room.craftingTimerAnswersSubmittedTargetActionId = "";
    room.craftingTimerEndHandled = false;
    clearActiveInputFlowEvent(room);
  }

  function setCraftingTimerShown(room, isShown) {
    if (isShown) {
      const timerDurationMs = durationMs();
      room.craftingTimerShown = true;
      room.craftingTimerRunning = false;
      room.craftingTimerDurationMs = timerDurationMs;
      room.craftingTimerRemainingMs = timerDurationMs;
      room.craftingTimerStartedAt = 0;
      room.craftingTimerEndsAt = 0;
      room.craftingTimerEndHandled = false;
      clearCraftingTimerTimeout(room);
      return;
    }
    pauseCraftingTimer(room);
    room.craftingTimerShown = false;
  }

  function scheduleCraftingTimerEnd(room) {
    clearCraftingTimerTimeout(room);
    const delayMs = Math.max(0, (room.craftingTimerEndsAt || Date.now()) - Date.now());
    room.craftingTimerTimeoutId = setTimeout(() => {
      room.craftingTimerTimeoutId = null;
      if (!room.craftingTimerRunning || room.craftingTimerEndHandled) return;
      emitInputFlowEvent(room, "timerEnd");
    }, delayMs + 20);
  }

  function startCraftingTimer(room, action) {
    if (!room.craftingTimerShown || room.craftingTimerDurationMs <= 0 || room.craftingTimerRemainingMs <= 0) {
      setCraftingTimerShown(room, true);
    }
    const now = Date.now();
    room.craftingTimerShown = true;
    room.craftingTimerRunning = true;
    room.craftingTimerStartedAt = now;
    room.craftingTimerEndsAt = now + Math.max(0, room.craftingTimerRemainingMs || room.craftingTimerDurationMs);
    room.craftingTimerActionId = action.id;
    room.craftingTimerTimerEndTargetActionId = "";
    room.craftingTimerAnswersSubmittedTargetActionId = "";
    room.craftingTimerEndHandled = false;
    scheduleCraftingTimerEnd(room);
  }

  function craftingTimerPayload(room) {
    const remainingMs = room.craftingTimerRunning
      ? Math.max(0, (room.craftingTimerEndsAt || Date.now()) - Date.now())
      : Math.max(0, room.craftingTimerRemainingMs || 0);
    return {
      shown: room.craftingTimerShown === true,
      running: room.craftingTimerRunning === true,
      durationMs: Math.max(0, room.craftingTimerDurationMs || 0),
      remainingMs,
      startedAt: room.craftingTimerStartedAt || 0,
      endsAt: room.craftingTimerEndsAt || 0,
      actionId: room.craftingTimerActionId || ""
    };
  }

  return {
    clearCraftingTimerTimeout,
    craftingTimerPayload,
    pauseCraftingTimer,
    resumeCraftingTimer,
    resetCraftingTimer,
    setCraftingTimerShown,
    startCraftingTimer
  };
}

module.exports = { createCraftingTimerRuntime };
