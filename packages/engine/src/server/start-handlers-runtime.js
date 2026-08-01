"use strict";

function createStartHandlersRuntime({
  broadcastLobby,
  enterLobbyPhase,
  enterStartingPhase,
  getExistingRoom,
  lobbyPayload,
  normalizePlayerId,
  normalizeStageCode,
  readJson,
  selectVip,
  sendJson
}) {
  async function handleStart(req, res) {
    let payload;
    try {
      payload = await readJson(req);
    } catch (error) {
      sendJson(res, 400, { ok: false, error: "Invalid JSON payload" });
      return;
    }

    const stageCode = normalizeStageCode(payload.stageCode);
    const playerId = normalizePlayerId(payload.playerId);
    const room = getExistingRoom(stageCode);
    const player = room?.players.get(playerId);
    selectVip(room || { players: new Map(), vipPlayerId: "" });

    if (!room || !player || !player.active) {
      sendJson(res, 404, { ok: false, error: "Player is not in this lobby" });
      return;
    }
    if (room.vipPlayerId !== playerId) {
      sendJson(res, 403, { ok: false, error: "Only the VIP can start the game" });
      return;
    }
    if (!payload.startToken || payload.startToken !== room.startToken) {
      sendJson(res, 403, { ok: false, error: "Start request is stale" });
      return;
    }
    if (room.phase === "intro") {
      sendJson(res, 200, { ok: true, lobby: lobbyPayload(room, playerId) });
      return;
    }
    if (room.phase === "starting") {
      sendJson(res, 200, { ok: true, lobby: lobbyPayload(room, playerId) });
      return;
    }

    enterStartingPhase(room);
    sendJson(res, 200, { ok: true, lobby: lobbyPayload(room, playerId) });
  }

  async function handleCancelStart(req, res) {
    let payload;
    try {
      payload = await readJson(req);
    } catch (error) {
      sendJson(res, 400, { ok: false, error: "Invalid JSON payload" });
      return;
    }

    const stageCode = normalizeStageCode(payload.stageCode);
    const playerId = normalizePlayerId(payload.playerId);
    const room = getExistingRoom(stageCode);
    const player = room?.players.get(playerId);
    selectVip(room || { players: new Map(), vipPlayerId: "" });

    if (!room || !player || !player.active) {
      sendJson(res, 404, { ok: false, error: "Player is not in this lobby" });
      return;
    }
    if (room.vipPlayerId !== playerId) {
      sendJson(res, 403, { ok: false, error: "Only the VIP can cancel the start" });
      return;
    }
    if (!payload.startToken || payload.startToken !== room.startToken) {
      sendJson(res, 403, { ok: false, error: "Cancel request is stale" });
      return;
    }
    if (room.phase !== "starting") {
      sendJson(res, 200, { ok: true, lobby: lobbyPayload(room, playerId) });
      return;
    }
    if (Date.now() >= room.countdownEndsAt) {
      sendJson(res, 200, { ok: true, lobby: lobbyPayload(room, playerId) });
      return;
    }

    enterLobbyPhase(room);
    broadcastLobby(room);
    sendJson(res, 200, { ok: true, lobby: lobbyPayload(room, playerId) });
  }

  return {
    handleCancelStart,
    handleStart
  };
}

module.exports = { createStartHandlersRuntime };
