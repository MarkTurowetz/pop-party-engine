"use strict";

function createStageTestConfigHandlerRuntime({
  broadcastLobby,
  clearAppliedActionEffects,
  getRoom,
  getStateActions,
  lobbyPayload,
  normalizeGameFlow,
  readJson,
  sendJson
}) {
  async function handleStageTestConfig(req, res, stageCode) {
    let payload;
    try {
      payload = await readJson(req);
    } catch (error) {
      sendJson(res, 400, { ok: false, error: "Invalid JSON payload" });
      return;
    }

    const room = getRoom(stageCode);
    if (payload.clearFlow) {
      room.runtimeFlowOverride = null;
    } else if (payload.flow) {
      try {
        room.runtimeFlowOverride = normalizeGameFlow(payload.flow);
      } catch (error) {
        sendJson(res, 400, { ok: false, error: `Test flow is invalid: ${error.message}` });
        return;
      }
    }

    room.actionCompletionPendingId = "";
    clearAppliedActionEffects(room);
    room.presentedAction = null;
    room.subroutinePath = [];
    room.subroutineStack = [];
    if (room.actionIndex >= getStateActions(room.phase, room).length) {
      room.actionIndex = 0;
    }
    broadcastLobby(room);
    sendJson(res, 200, { ok: true, lobby: lobbyPayload(room), hasTestFlow: Boolean(room.runtimeFlowOverride) });
  }

  return { handleStageTestConfig };
}

module.exports = { createStageTestConfigHandlerRuntime };
