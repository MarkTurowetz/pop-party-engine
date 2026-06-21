function createStageEventsRuntime({
  getExistingRoom,
  getRoom,
  heartbeatIntervalMs,
  lobbyPayload,
  sendJson,
  sendSse
}) {
  function removeStageClient(stageCode, client) {
    const room = getExistingRoom(stageCode);
    if (!room) return;
    room.stageClients.delete(client);
    if (room.stageClients.size === 0) {
      room.runtimeFlowOverride = null;
    }
  }

  function handleStageEvents(req, res, stageCode) {
    if (!stageCode) {
      sendJson(res, 400, { ok: false, error: "Missing stage code" });
      return;
    }

    const room = getRoom(stageCode);
    res.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "*"
    });
    res.write(": connected\n\n");

    room.stageClients.add(res);
    sendSse(res, "ready", { stageCode });
    sendSse(res, "lobby", lobbyPayload(room));

    const heartbeat = setInterval(() => {
      sendSse(res, "ping", { sentAt: Date.now() });
    }, heartbeatIntervalMs);

    req.on("close", () => {
      clearInterval(heartbeat);
      removeStageClient(stageCode, res);
    });
  }

  return {
    handleStageEvents,
    removeStageClient
  };
}

module.exports = { createStageEventsRuntime };
