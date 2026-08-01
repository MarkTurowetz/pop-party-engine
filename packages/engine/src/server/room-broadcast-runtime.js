"use strict";

function createRoomBroadcastRuntime({
  getLobbyPayload,
  markStagePublished = () => {},
  queueMicrotaskImpl = queueMicrotask,
  shouldPublishStage = () => true
}) {
  function sendSse(client, event, data) {
    client.write(`event: ${event}\n`);
    client.write(`data: ${JSON.stringify(data)}\n\n`);
  }

  function publishStage(room) {
    room.stagePublicationPending = false;
    const payload = getLobbyPayload()(room);
    if (!shouldPublishStage(room, payload)) return;
    markStagePublished(room, payload);
    for (const client of room.stageClients) sendSse(client, "lobby", payload);
  }

  function broadcastLobby(room) {
    room.revision += 1;
    if (room.stagePublicationPending) return;
    room.stagePublicationPending = true;
    queueMicrotaskImpl(() => publishStage(room));
  }

  return { broadcastLobby, publishStage, sendSse };
}

module.exports = { createRoomBroadcastRuntime };
