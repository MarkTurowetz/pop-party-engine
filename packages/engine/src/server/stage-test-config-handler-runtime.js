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
      payload = await readJson(req, 2_000_000);
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

    try {
      room.actionCompletionPendingId = "";
      clearAppliedActionEffects(room);
      room.presentedAction = null;
      room.subroutinePath = [];
      room.subroutineStack = [];
      room.actionIndex = -1;
      broadcastLobby(room);
      sendJson(res, 200, { ok: true, lobby: lobbyPayload(room), hasTestFlow: Boolean(room.runtimeFlowOverride) });
    } catch (error) {
      sendJson(res, 500, {
        ok: false,
        error: `Test flow could not be activated: ${String(error?.message || error)}`
      });
    }
  }

  return { handleStageTestConfig };
}

module.exports = { createStageTestConfigHandlerRuntime };
