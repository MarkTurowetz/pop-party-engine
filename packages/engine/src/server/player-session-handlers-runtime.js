"use strict";

const {
  markPlayerControllerDisconnected,
  markPlayerJoined,
  playerControllerIsConnected,
  playerIsJoined,
  removePlayerFromRoom
} = require("./player-presence-runtime");

function createPlayerSessionHandlersRuntime({
  broadcastLobby,
  cleanPlayerName,
  getExistingRoom,
  getRoom,
  lobbyPayload,
  normalizePlayerId,
  normalizeStageCode,
  onPlayerDisconnected = () => {},
  onPlayerReconnected = () => {},
  publicPlayer,
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
      && !playerIsJoined(player)
      && Number(player.gameSessionId || 0) !== Number(room.gameSessionId || 0);
    if (player && (staleDisconnectedPlayer || player.name !== playerName)) {
      const identity = runtimeCapabilities.newPlayerIdentity(room);
      playerId = identity.playerId;
      playerCapability = identity.playerCapability;
      player = null;
    }

    const isNewPlayer = !player;
    const wasJoined = playerIsJoined(player);
    if (isNewPlayer) {
      player = {
        id: playerId,
        name: playerName,
        joined: true,
        controllerConnected: true,
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
      const reconnected = !playerControllerIsConnected(player);
      markPlayerJoined(player);
      player.gameSessionId = Number(room.gameSessionId || 0);
      if (!playerCapability) playerCapability = runtimeCapabilities.issuePlayerCapability(room, playerId);
      if (reconnected) onPlayerReconnected(room, playerId);
    }

    if (!playerCapability) playerCapability = runtimeCapabilities.issuePlayerCapability(room, playerId);
    selectVip(room);
    if (isNewPlayer || !wasJoined) broadcastLobby(room);
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
      sendJson(res, 409, { ok: false, errorCode: "KICKED_TO_LOBBY", error: "Player is no longer in this lobby" });
      return;
    }
    if (player.kickedFromGame) {
      sendJson(res, 409, { ok: false, errorCode: "KICKED_TO_LOBBY", error: "Player was returned to the join screen" });
      return;
    }
    if (Number(player.gameSessionId || 0) !== Number(room.gameSessionId || 0)) {
      sendJson(res, 409, { ok: false, errorCode: "KICKED_TO_LOBBY", error: "This controller belongs to an earlier game session" });
      return;
    }

    const reconnected = !playerControllerIsConnected(player);
    markPlayerJoined(player);
    player.gameSessionId = Number(room.gameSessionId || 0);
    if (reconnected) onPlayerReconnected(room, playerId);
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

    markPlayerControllerDisconnected(player);
    onPlayerDisconnected(room, playerId);
    removePlayerFromRoom(room, playerId);
    selectVip(room);
    broadcastLobby(room);
    sendJson(res, 200, { ok: true });
  }

  return {
    handleHeartbeat,
    handleJoin,
    handleLeave
  };
}

module.exports = { createPlayerSessionHandlersRuntime };
