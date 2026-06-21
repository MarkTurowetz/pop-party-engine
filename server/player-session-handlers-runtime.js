function createPlayerSessionHandlersRuntime({
  broadcastLobby,
  cleanPlayerName,
  gameConstants,
  getExistingRoom,
  getRoom,
  lobbyPayload,
  makeRandomAvatar,
  normalizeAvatarShape,
  normalizePlayerId,
  normalizeStageCode,
  publicPlayer,
  randomArrayItem,
  readJson,
  selectVip,
  sendJson
}) {
  async function handleJoin(req, res) {
    let payload;
    try {
      payload = await readJson(req);
    } catch (error) {
      sendJson(res, 400, { ok: false, error: "Invalid JSON payload" });
      return;
    }

    const stageCode = normalizeStageCode(payload.stageCode);
    const playerName = cleanPlayerName(payload.playerName);
    let playerId = normalizePlayerId(payload.playerId) || `p-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    if (!stageCode || !playerName) {
      sendJson(res, 400, { ok: false, error: "Stage code and player name are required" });
      return;
    }

    const room = getRoom(stageCode);
    let player = room.players.get(playerId);
    if (player && player.active && player.name !== playerName) {
      playerId = `p-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      player = null;
    }

    if (!player) {
      player = {
        id: playerId,
        name: playerName,
        avatar: makeRandomAvatar(room, playerId),
        active: true,
        kickedFromGame: false,
        points: 0,
        pendingPoints: 0,
        joinedAt: Date.now(),
        lastSeen: Date.now()
      };
      room.players.set(playerId, player);
    } else {
      player.name = playerName;
      player.active = true;
      player.kickedFromGame = false;
      player.lastSeen = Date.now();
    }

    selectVip(room);
    broadcastLobby(room);
    sendJson(res, 200, { ok: true, player: publicPlayer(player, room), lobby: lobbyPayload(room) });
  }

  async function handleHeartbeat(req, res) {
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
    if (!room || !player) {
      sendJson(res, 404, { ok: false, error: "Player is not in this lobby" });
      return;
    }
    if (player.kickedFromGame) {
      sendJson(res, 409, { ok: false, errorCode: "KICKED_TO_LOBBY", error: "Player was returned to the join screen" });
      return;
    }

    const wasInactive = !player.active;
    player.active = true;
    player.lastSeen = Date.now();
    selectVip(room);
    if (wasInactive) broadcastLobby(room);
    sendJson(res, 200, { ok: true, player: publicPlayer(player, room), lobby: lobbyPayload(room) });
  }

  async function handleSelectAvatar(req, res) {
    let payload;
    try {
      payload = await readJson(req);
    } catch (error) {
      sendJson(res, 400, { ok: false, error: "Invalid JSON payload" });
      return;
    }

    const stageCode = normalizeStageCode(payload.stageCode);
    const playerId = normalizePlayerId(payload.playerId);
    const shape = normalizeAvatarShape(payload.shape);
    const room = getExistingRoom(stageCode);
    const player = room?.players.get(playerId);
    if (!room || !player) {
      sendJson(res, 404, { ok: false, error: "Player is not in this lobby" });
      return;
    }
    if (!shape) {
      sendJson(res, 400, { ok: false, error: "Choose a valid avatar" });
      return;
    }
    if (player.kickedFromGame) {
      sendJson(res, 409, { ok: false, errorCode: "KICKED_TO_LOBBY", error: "Player was returned to the join screen" });
      return;
    }

    player.avatar = {
      color: player.avatar?.color || randomArrayItem(gameConstants().playerColors),
      shape
    };
    player.active = true;
    player.lastSeen = Date.now();
    broadcastLobby(room);
    sendJson(res, 200, { ok: true, player: publicPlayer(player, room), lobby: lobbyPayload(room) });
  }

  async function handleLeave(req, res) {
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
    if (!room || !player) {
      sendJson(res, 200, { ok: true });
      return;
    }

    if (player.active) {
      player.active = false;
      player.lastSeen = Date.now();
      selectVip(room);
      broadcastLobby(room);
    }
    sendJson(res, 200, { ok: true });
  }

  return {
    handleHeartbeat,
    handleJoin,
    handleLeave,
    handleSelectAvatar
  };
}

module.exports = { createPlayerSessionHandlersRuntime };
