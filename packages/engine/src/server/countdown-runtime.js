"use strict";

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

  function pauseCountdownTimer(room) {
    if (!room.countdownTimerId) return;
    const transitionAt = (room.countdownEndsAt || Date.now()) + startGoHoldMs;
    clearCountdownTimer(room);
    room.countdownRemainingMs = Math.max(0, transitionAt - Date.now());
    room.countdownStartedAt = 0;
    room.countdownEndsAt = 0;
  }

  function resumeCountdownTimer(room) {
    if (room.phase !== "starting" || room.countdownTimerId || room.countdownRemainingMs <= 0) return;
    const now = Date.now();
    const remainingMs = Math.max(0, room.countdownRemainingMs || 0);
    const visualRemainingMs = Math.max(0, remainingMs - startGoHoldMs);
    room.countdownStartedAt = now;
    room.countdownEndsAt = now + visualRemainingMs;
    room.countdownTimerId = setTimeout(() => {
      completeCountdownTrigger(room);
    }, remainingMs);
  }

  return {
    clearCountdownTimer,
    enterStartingPhase,
    pauseCountdownTimer,
    resumeCountdownTimer
  };
}

module.exports = { createCountdownRuntime };
