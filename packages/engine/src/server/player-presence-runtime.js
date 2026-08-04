"use strict";

function playerIsJoined(player) {
  if (!player || player.kickedFromGame === true) return false;
  if (typeof player.joined === "boolean") return player.joined;
  return player.active !== false;
}

function playerControllerIsConnected(player) {
  if (!playerIsJoined(player)) return false;
  if (typeof player.controllerConnected === "boolean") return player.controllerConnected;
  return player.active !== false;
}

function markPlayerJoined(player, now = Date.now()) {
  if (!player) return player;
  player.joined = true;
  // Keep the published plugin ABI's legacy field as durable roster membership.
  // Heartbeat availability is intentionally never mirrored into `active`.
  player.active = true;
  player.kickedFromGame = false;
  player.controllerConnected = true;
  player.lastSeen = now;
  return player;
}

function markPlayerControllerConnected(player, now = Date.now()) {
  if (!playerIsJoined(player)) return false;
  const changed = !playerControllerIsConnected(player);
  player.controllerConnected = true;
  player.lastSeen = now;
  return changed;
}

function markPlayerControllerDisconnected(player, now = Date.now()) {
  if (!playerIsJoined(player) || !playerControllerIsConnected(player)) return false;
  player.controllerConnected = false;
  player.lastSeen = now;
  return true;
}

function removePlayerFromRoom(room, playerId, { kicked = false, now = Date.now() } = {}) {
  const id = String(playerId || "");
  const player = room?.players?.get?.(id) || null;
  if (!player) return null;
  player.joined = false;
  player.active = false;
  player.controllerConnected = false;
  player.kickedFromGame = kicked === true;
  player.lastSeen = now;
  room.players.delete(id);
  room.playerCapabilityHashes?.delete?.(id);
  room.surfaceProjections?.controllers?.delete?.(id);

  for (const profiles of Object.values(room.gamePluginProfiles || {})) {
    if (profiles && typeof profiles === "object") delete profiles[id];
  }
  for (const storeName of [
    "gamePluginControllerInteractionAuthorities",
    "gamePluginControllerInteractionSubmissions"
  ]) {
    const store = room[storeName];
    if (!(store instanceof Map)) continue;
    for (const key of store.keys()) {
      if (String(key).split(":").includes(id)) store.delete(key);
    }
  }
  return player;
}

module.exports = {
  markPlayerControllerConnected,
  markPlayerControllerDisconnected,
  markPlayerJoined,
  playerControllerIsConnected,
  playerIsJoined,
  removePlayerFromRoom
};
