function createLobbyControlHandlersRuntime({
  getExistingRoom,
  getRoom,
  lobbyPayload,
  normalizeStageCode,
  quitRoomToLobby,
  readJson,
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

  function handleLobby(req, res, stageCode) {
    const room = getRoom(stageCode);
    sendJson(res, 200, { ok: true, lobby: lobbyPayload(room) });
  }

  return {
    handleLobby,
    handleQuitToLobby
  };
}

module.exports = { createLobbyControlHandlersRuntime };
