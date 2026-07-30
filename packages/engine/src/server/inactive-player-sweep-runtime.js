"use strict";

function createInactivePlayerSweepRuntime({
  broadcastLobby,
  controllerTimeoutMs,
  onPlayerDisconnected = () => {},
  rooms,
  selectVip
}) {
  function sweepInactivePlayers() {
    const now = Date.now();
    for (const room of rooms.values()) {
      let changed = false;
      for (const player of room.players.values()) {
        if (player.active && now - player.lastSeen > controllerTimeoutMs) {
          player.active = false;
          onPlayerDisconnected(room, player.id);
          changed = true;
        }
      }
      if (changed) {
        selectVip(room);
        broadcastLobby(room);
      }
    }
  }

  return { sweepInactivePlayers };
}

module.exports = { createInactivePlayerSweepRuntime };
