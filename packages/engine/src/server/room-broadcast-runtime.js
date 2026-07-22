"use strict";

function createRoomBroadcastRuntime({ getLobbyPayload }) {
  function sendSse(client, event, data) {
    client.write(`event: ${event}\n`);
    client.write(`data: ${JSON.stringify(data)}\n\n`);
  }

  function broadcastLobby(room) {
    room.revision += 1;
    const payload = getLobbyPayload()(room);
    for (const client of room.stageClients) {
      sendSse(client, "lobby", payload);
    }
  }

  return { broadcastLobby, sendSse };
}

module.exports = { createRoomBroadcastRuntime };
