const COMPLETABLE_ACTION_TYPES = new Set([
  "transition",
  "transitionState",
  "displayText",
  "present",
  "setPlayersShown",
  "setPlayerAnswersShown",
  "revealPlayerAnswerCorrectness",
  "showPoints",
  "givePendingPoints",
  "setTimerShown",
  "startCraftingTimer",
  "getRandomMultipleChoiceContent",
  "prepareVotingCards",
  "setVotingCardsShown",
  "voteOnAnswersInput",
  "revealVotingResults",
  "multipleChoiceInput",
  "triviaInput",
  "textSubmissionInput",
  "doNothing",
  "playAudio"
]);

function createStageActionHandlersRuntime({
  applyRoomActionEffects,
  broadcastLobby,
  completeCurrentAction,
  currentRoomAction,
  getExistingRoom,
  lobbyPayload,
  normalizeStageCode,
  readJson,
  resolveRoomActionText,
  sendJson
}) {
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

    const currentAction = currentRoomAction(room);
    if (COMPLETABLE_ACTION_TYPES.has(currentAction?.type)) {
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
    handleCompleteAction
  };
}

module.exports = { createStageActionHandlersRuntime };
