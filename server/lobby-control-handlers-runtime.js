function createLobbyControlHandlersRuntime({
  broadcastLobby,
  getExistingRoom,
  getRoom,
  lobbyPayload,
  normalizePlayerId,
  normalizeStageCode,
  quitRoomToLobby,
  readJson,
  selectVip,
  sendJson
}) {
  async function handleQuitToLobby(req, res) {
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

    quitRoomToLobby(room);
    sendJson(res, 200, { ok: true, lobby: lobbyPayload(room) });
  }

  async function handlePresentHi(req, res) {
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
      sendJson(res, 403, { ok: false, error: "Only the VIP can present text" });
      return;
    }
    if (!payload.startToken || payload.startToken !== room.startToken) {
      sendJson(res, 403, { ok: false, error: "Present request is stale" });
      return;
    }
    if (room.phase !== "intro") {
      sendJson(res, 409, { ok: false, error: "Text can only be presented during the game intro" });
      return;
    }

    room.presentedAction = { type: "present", text: "HI THERE" };
    broadcastLobby(room);
    sendJson(res, 200, { ok: true, lobby: lobbyPayload(room) });
  }

  function handleLobby(req, res, stageCode) {
    const room = getRoom(stageCode);
    sendJson(res, 200, { ok: true, lobby: lobbyPayload(room) });
  }

  return {
    handleLobby,
    handlePresentHi,
    handleQuitToLobby
  };
}

module.exports = { createLobbyControlHandlersRuntime };
