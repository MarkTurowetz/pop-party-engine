"use strict";

function createGamePluginInputHandlersRuntime({
  gameInputRuntime,
  getExistingRoom,
  lobbyPayload,
  normalizePlayerId,
  normalizeStageCode,
  readJson,
  sendJson
}) {
  async function handleGamePluginInput(req, res) {
    let payload;
    try {
      payload = await readJson(req);
    } catch {
      sendJson(res, 400, { ok: false, error: "Invalid JSON payload" });
      return;
    }
    const stageCode = normalizeStageCode(payload.stageCode);
    const playerId = normalizePlayerId(payload.playerId);
    const room = getExistingRoom(stageCode);
    const player = room?.players?.get(playerId);
    if (!room || !player) {
      sendJson(res, 404, { ok: false, error: "Player is not in this lobby", errorCode: "PLAYER_NOT_FOUND" });
      return;
    }
    if (player.kickedFromGame || player.active === false) {
      sendJson(res, 409, { ok: false, error: "This controller is no longer active", errorCode: "PLAYER_INACTIVE" });
      return;
    }
    const result = gameInputRuntime.submit(room, playerId, payload);
    if (result.status !== 200) {
      sendJson(res, result.status, { ok: false, error: result.error, errorCode: result.errorCode });
      return;
    }
    sendJson(res, 200, {
      ok: true,
      duplicate: result.duplicate === true,
      lobby: lobbyPayload(room, playerId)
    });
  }

  return Object.freeze({ handleGamePluginInput });
}

module.exports = { createGamePluginInputHandlersRuntime };
