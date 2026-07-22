"use strict";

function createPauseRuntime({
  broadcastLobby,
  getExistingRoom,
  lobbyPayload,
  normalizeStageCode,
  pauseActionTimer,
  pauseAnswersSubmittedAdvanceTimer,
  pauseCountdownTimer,
  pauseCraftingTimer,
  readJson,
  resumeActionTimer,
  resumeAnswersSubmittedAdvanceTimer,
  resumeCountdownTimer,
  resumeCraftingTimer,
  sendJson
}) {
  function setRoomPaused(room, isPaused) {
    const nextPaused = isPaused === true;
    if (room.isPaused === nextPaused) return;
    room.isPaused = nextPaused;
    room.pausedAt = nextPaused ? Date.now() : 0;
    if (nextPaused) {
      pauseCountdownTimer(room);
      pauseCraftingTimer(room);
      pauseAnswersSubmittedAdvanceTimer(room);
      pauseActionTimer(room);
    } else {
      resumeCountdownTimer(room);
      resumeCraftingTimer(room);
      resumeAnswersSubmittedAdvanceTimer(room);
      resumeActionTimer(room);
    }
    broadcastLobby(room);
  }

  async function handlePause(req, res) {
    let payload;
    try {
      payload = await readJson(req);
    } catch (error) {
      sendJson(res, 400, { ok: false, error: "Invalid JSON payload" });
      return;
    }
    const stageCode = normalizeStageCode(payload.stageCode);
    const room = getExistingRoom(stageCode);
    if (!room) {
      sendJson(res, 404, { ok: false, error: "Room not found" });
      return;
    }
    setRoomPaused(room, payload.isPaused === true);
    sendJson(res, 200, { ok: true, lobby: lobbyPayload(room) });
  }

  function roomIsPaused(room) {
    return room?.isPaused === true;
  }

  return {
    handlePause,
    roomIsPaused,
    setRoomPaused
  };
}

module.exports = { createPauseRuntime };
