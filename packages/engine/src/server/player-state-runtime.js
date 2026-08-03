"use strict";

function createPlayerStateRuntime({ randomToken }) {

  function activePlayers(room) {
    return Array.from(room.players.values()).filter((player) => player.active);
  }

  function selectVip(room) {
    const previousVipPlayerId = room.vipPlayerId;
    const active = activePlayers(room);
    if (active.length === 0) {
      room.vipPlayerId = "";
      room.startToken = "";
      return;
    }
    if (!active.some((player) => player.id === room.vipPlayerId)) {
      room.vipPlayerId = active[0].id;
    }
    if (room.vipPlayerId !== previousVipPlayerId || !room.startToken) {
      room.startToken = randomToken();
    }
  }

  return {
    activePlayers,
    selectVip
  };
}

module.exports = { createPlayerStateRuntime };
