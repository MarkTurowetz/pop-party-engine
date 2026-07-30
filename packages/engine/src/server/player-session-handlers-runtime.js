"use strict";

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
  onPlayerDisconnected = () => {},
  publicPlayer,
  randomArrayItem,
  readJson,
  runtimeCapabilities,
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
    let playerId = normalizePlayerId(payload.playerId);
    if (!stageCode || !playerName) {
      sendJson(res, 400, { ok: false, error: "Stage code and player name are required" });
      return;
    }

    const capabilityMode = runtimeCapabilities.publicStatus().mode;
    const room = capabilityMode === "required" ? getExistingRoom(stageCode) : getRoom(stageCode);
    if (!room) {
      sendJson(res, 404, { ok: false, error: "That room does not exist", errorCode: "ROOM_NOT_FOUND" });
      return;
    }
    let player = room.players.get(playerId);
    let playerCapability = player ? runtimeCapabilities.reconnectCapability(req, room, playerId) : "";
    if (capabilityMode === "required" && !playerCapability) {
      const identity = runtimeCapabilities.newPlayerIdentity(room);
      playerId = identity.playerId;
      playerCapability = identity.playerCapability;
      player = null;
    } else if (!playerId) {
      const identity = runtimeCapabilities.newPlayerIdentity(room);
      playerId = identity.playerId;
      playerCapability = identity.playerCapability;
      player = null;
    }
    const staleDisconnectedPlayer = player
      && !player.active
      && Number(player.gameSessionId || 0) !== Number(room.gameSessionId || 0);
    if (player && (staleDisconnectedPlayer || (player.active && player.name !== playerName))) {
      const identity = runtimeCapabilities.newPlayerIdentity(room);
      playerId = identity.playerId;
      playerCapability = identity.playerCapability;
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
        lastSeen: Date.now(),
        gameSessionId: Number(room.gameSessionId || 0)
      };
      room.players.set(playerId, player);
    } else {
      player.name = playerName;
      player.active = true;
      player.kickedFromGame = false;
      player.lastSeen = Date.now();
      player.gameSessionId = Number(room.gameSessionId || 0);
      if (!playerCapability) playerCapability = runtimeCapabilities.issuePlayerCapability(room, playerId);
    }

    if (!playerCapability) playerCapability = runtimeCapabilities.issuePlayerCapability(room, playerId);
    selectVip(room);
    broadcastLobby(room);
    sendJson(res, 200, { ok: true, playerCapability, player: publicPlayer(player, room), lobby: lobbyPayload(room, playerId) });
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
    if (!player.active && Number(player.gameSessionId || 0) !== Number(room.gameSessionId || 0)) {
      sendJson(res, 409, { ok: false, errorCode: "KICKED_TO_LOBBY", error: "This controller belongs to an earlier game session" });
      return;
    }

    const wasInactive = !player.active;
    player.active = true;
    player.lastSeen = Date.now();
    player.gameSessionId = Number(room.gameSessionId || 0);
    selectVip(room);
    if (wasInactive) broadcastLobby(room);
    sendJson(res, 200, { ok: true, player: publicPlayer(player, room), lobby: lobbyPayload(room, playerId) });
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
    const room = getExistingRoom(stageCode);
    const shape = normalizeAvatarShape(payload.shape, room);
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
    if (!player.active && Number(player.gameSessionId || 0) !== Number(room.gameSessionId || 0)) {
      sendJson(res, 409, { ok: false, errorCode: "KICKED_TO_LOBBY", error: "This controller belongs to an earlier game session" });
      return;
    }

    player.avatar = {
      color: player.avatar?.color || randomArrayItem(gameConstants(room).playerColors),
      shape
    };
    player.active = true;
    player.lastSeen = Date.now();
    player.gameSessionId = Number(room.gameSessionId || 0);
    broadcastLobby(room);
    sendJson(res, 200, { ok: true, player: publicPlayer(player, room), lobby: lobbyPayload(room, playerId) });
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
      onPlayerDisconnected(room, playerId);
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
