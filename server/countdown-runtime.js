function createCountdownRuntime({
  broadcastLobby,
  completeCountdownTrigger,
  countdownDurationMs,
  startGoHoldMs
}) {
  function clearCountdownTimer(room) {
    if (!room.countdownTimerId) return;
    clearTimeout(room.countdownTimerId);
    room.countdownTimerId = null;
  }

  function enterStartingPhase(room) {
    const now = Date.now();
    const startCountdownMs = countdownDurationMs();
    clearCountdownTimer(room);
    room.phase = "starting";
    room.countdownStartedAt = now;
    room.countdownEndsAt = now + startCountdownMs;
    room.countdownTimerId = setTimeout(() => {
      completeCountdownTrigger(room);
    }, startCountdownMs + startGoHoldMs);
    broadcastLobby(room);
  }

  return {
    clearCountdownTimer,
    enterStartingPhase
  };
}

module.exports = { createCountdownRuntime };
