"use strict";

const { isCompletableStageActionType } = require("../shared/flow-action-registry");

function createStageActionHandlersRuntime({
  applyRoomActionEffects,
  broadcastLobby,
  completeCurrentAction,
  currentRoomAction,
  emitInputFlowEvent,
  getExistingRoom,
  lobbyPayload,
  normalizeStageCode,
  readJson,
  resolveRoomActionText,
  roomIsPaused = () => false,
  sendJson
}) {
  function rejectIfPaused(room, res) {
    if (!roomIsPaused(room)) return false;
    sendJson(res, 423, { ok: false, error: "Game is paused" });
    return true;
  }

  async function handleAdvancePresentation(req, res) {
    let payload;
    try {
      payload = await readJson(req);
    } catch (error) {
      sendJson(res, 400, { ok: false, error: "Invalid JSON payload" });
      return;
    }

    const stageCode = normalizeStageCode(payload.stageCode);
    const room = getExistingRoom(stageCode);
    if (!room) {
      sendJson(res, 404, { ok: false, error: "Room not found" });
      return;
    }
    if (rejectIfPaused(room, res)) return;

    if (room.presentedAction?.type === "present") {
      room.presentedAction = null;
      broadcastLobby(room);
      sendJson(res, 200, { ok: true, lobby: lobbyPayload(room) });
      return;
    }

    const currentAction = currentRoomAction(room);
    if (!currentAction || currentAction.type !== "present") {
      sendJson(res, 200, { ok: true, lobby: lobbyPayload(room) });
      return;
    }

    completeCurrentAction(room, payload.actionId, payload.source || "callback");
    sendJson(res, 200, { ok: true, lobby: lobbyPayload(room) });
  }

  async function handleInputEvent(req, res) {
    let payload;
    try {
      payload = await readJson(req);
    } catch (error) {
      sendJson(res, 400, { ok: false, error: "Invalid JSON payload" });
      return;
    }

    const stageCode = normalizeStageCode(payload.stageCode);
    const room = getExistingRoom(stageCode);
    if (!room) {
      sendJson(res, 404, { ok: false, error: "Room not found" });
      return;
    }
    if (rejectIfPaused(room, res)) return;

    const eventType = String(payload.eventType || "");
    const currentAction = currentRoomAction(room);
    if (payload.actionId && currentAction?.id !== payload.actionId) {
      sendJson(res, 409, { ok: false, error: "Input event is stale" });
      return;
    }
    const advanced = emitInputFlowEvent(room, eventType);
    sendJson(res, 200, { ok: true, advanced, lobby: lobbyPayload(room) });
  }

  async function handleCompleteAction(req, res) {
    let payload;
    try {
      payload = await readJson(req);
    } catch (error) {
      sendJson(res, 400, { ok: false, error: "Invalid JSON payload" });
      return;
    }

    const stageCode = normalizeStageCode(payload.stageCode);
    const room = getExistingRoom(stageCode);
    if (!room) {
      sendJson(res, 404, { ok: false, error: "Room not found" });
      return;
    }
    if (rejectIfPaused(room, res)) return;

    const currentAction = currentRoomAction(room);
    if (isCompletableStageActionType(currentAction?.type)) {
      completeCurrentAction(room, payload.actionId, payload.source || "callback");
    }
    sendJson(res, 200, { ok: true, lobby: lobbyPayload(room) });
  }

  async function handleActionEffect(req, res) {
    let payload;
    try {
      payload = await readJson(req);
    } catch (error) {
      sendJson(res, 400, { ok: false, error: "Invalid JSON payload" });
      return;
    }

    const stageCode = normalizeStageCode(payload.stageCode);
    const room = getExistingRoom(stageCode);
    if (!room) {
      sendJson(res, 404, { ok: false, error: "Room not found" });
      return;
    }
    if (rejectIfPaused(room, res)) return;

    const actionId = String(payload.actionId || "");
    const currentAction = resolveRoomActionText(currentRoomAction(room), room);
    const subAction = (currentAction?.subActions || []).find((action) => action.id === actionId);
    if (!subAction) {
      sendJson(res, 409, { ok: false, error: "Sub-action is not active" });
      return;
    }

    applyRoomActionEffects(room, subAction);
    broadcastLobby(room);
    sendJson(res, 200, { ok: true, lobby: lobbyPayload(room) });
  }

  return {
    handleActionEffect,
    handleAdvancePresentation,
    handleCompleteAction,
    handleInputEvent
  };
}

module.exports = { createStageActionHandlersRuntime };
