"use strict";

const {
  playerControllerIsConnected,
  playerIsJoined
} = require("./player-presence-runtime");

function createPlayerStateRuntime({ randomToken }) {

  function joinedPlayers(room) {
    return Array.from(room.players.values()).filter(playerIsJoined);
  }

  function connectedPlayers(room) {
    return joinedPlayers(room).filter(playerControllerIsConnected);
  }

  function selectVip(room) {
    const previousVipPlayerId = room.vipPlayerId;
    const joined = joinedPlayers(room);
    if (joined.length === 0) {
      room.vipPlayerId = "";
      room.startToken = "";
      return;
    }
    if (!joined.some((player) => player.id === room.vipPlayerId)) {
      room.vipPlayerId = joined[0].id;
    }
    if (room.vipPlayerId !== previousVipPlayerId || !room.startToken) {
      room.startToken = randomToken();
    }
  }

  return {
    // `activePlayers` remains as an internal compatibility alias. Its semantic
    // contract is now durable joined membership, never heartbeat availability.
    activePlayers: joinedPlayers,
    connectedPlayers,
    joinedPlayers,
    selectVip
  };
}

module.exports = { createPlayerStateRuntime };
