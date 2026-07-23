"use strict";

function createPlayerStateRuntime({
  avatarShapes,
  gameConstants,
  normalizeColor,
  randomToken
}) {
  function roomAvatarShapes(room = null) {
    const pinnedShapes = room?.gameData?.avatarShapes;
    return Array.isArray(pinnedShapes) && pinnedShapes.length ? pinnedShapes : avatarShapes;
  }

  function makeAvatar(playerIndex, room = null) {
    const colors = gameConstants(room).playerColors;
    const shapes = roomAvatarShapes(room);
    return {
      color: colors[playerIndex % colors.length],
      shape: shapes[Math.floor(playerIndex / colors.length) % shapes.length]
    };
  }

  function randomArrayItem(items) {
    return items[Math.floor(Math.random() * items.length)];
  }

  function makeRandomAvatar(room, playerId) {
    const usedShapes = new Set();
    const usedColors = new Set();
    for (const player of room.players.values()) {
      if (player.id !== playerId && player.avatar?.shape) usedShapes.add(player.avatar.shape);
      if (player.id !== playerId && player.avatar?.color) usedColors.add(normalizeColor(player.avatar.color));
    }
    const shapes = roomAvatarShapes(room);
    const availableShapes = shapes.filter((shape) => !usedShapes.has(shape));
    const playerColors = gameConstants(room).playerColors;
    const availableColors = playerColors.filter((color) => !usedColors.has(color));
    const shape = randomArrayItem(availableShapes.length ? availableShapes : shapes);
    const color = randomArrayItem(availableColors.length ? availableColors : playerColors);
    return { color, shape };
  }

  function normalizeAvatarShape(value, room = null) {
    const shape = String(value || "").trim().toLowerCase();
    return roomAvatarShapes(room).includes(shape) ? shape : "";
  }

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
    makeAvatar,
    makeRandomAvatar,
    normalizeAvatarShape,
    randomArrayItem,
    selectVip
  };
}

module.exports = { createPlayerStateRuntime };
