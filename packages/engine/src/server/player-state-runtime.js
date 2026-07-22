"use strict";

function createPlayerStateRuntime({
  avatarShapes,
  gameConstants,
  normalizeColor,
  randomToken
}) {
  function makeAvatar(playerIndex) {
    const colors = gameConstants().playerColors;
    return {
      color: colors[playerIndex % colors.length],
      shape: avatarShapes[Math.floor(playerIndex / colors.length) % avatarShapes.length]
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
    const availableShapes = avatarShapes.filter((shape) => !usedShapes.has(shape));
    const playerColors = gameConstants().playerColors;
    const availableColors = playerColors.filter((color) => !usedColors.has(color));
    const shape = randomArrayItem(availableShapes.length ? availableShapes : avatarShapes);
    const color = randomArrayItem(availableColors.length ? availableColors : playerColors);
    return { color, shape };
  }

  function normalizeAvatarShape(value) {
    const shape = String(value || "").trim().toLowerCase();
    return avatarShapes.includes(shape) ? shape : "";
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
