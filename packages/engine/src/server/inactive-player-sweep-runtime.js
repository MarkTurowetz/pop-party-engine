"use strict";

const {
  markPlayerControllerDisconnected,
  playerControllerIsConnected
} = require("./player-presence-runtime");

function createInactivePlayerSweepRuntime({
  broadcastLobby,
  controllerTimeoutMs,
  onPlayerDisconnected = () => {},
  rooms,
  now = Date.now
}) {
  function sweepInactivePlayers() {
    const sweptAt = now();
    for (const room of rooms.values()) {
      for (const player of room.players.values()) {
        if (playerControllerIsConnected(player) && sweptAt - player.lastSeen > controllerTimeoutMs) {
          markPlayerControllerDisconnected(player, sweptAt);
          onPlayerDisconnected(room, player.id);
        }
      }
    }
  }

  return { sweepInactivePlayers };
}

module.exports = { createInactivePlayerSweepRuntime };
