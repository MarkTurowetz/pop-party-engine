"use strict";

function createControllerSubmitApi(options) {
  const { getControllerState, postJson } = options;

  function payloadBase() {
    const state = getControllerState();
    if (!state) return null;
    return {
      gameSessionId: Number(state.lobby?.gameSessionId || 0),
      playerId: state.playerId,
      stageCode: state.stageCode
    };
  }

  function inputVisitId(actionId) {
    const state = getControllerState();
    const lobby = state?.lobby;
    const playerInput = state?.player?.input;
    const candidates = [lobby?.textInput, lobby?.microphoneAccess, playerInput, lobby?.input];
    const input = candidates.find((candidate) => String(candidate?.actionId || "") === actionId);
    return Number(input?.visitId || 0);
  }

  function join(stageCode, playerName, playerId) {
    return postJson("/api/join", { stageCode, playerName, playerId });
  }

  function heartbeat() {
    const base = payloadBase();
    if (!base) return Promise.resolve(null);
    return postJson("/api/heartbeat", base);
  }

  function submitChoice(actionId, optionIndex, cardId = "") {
    const base = payloadBase();
    if (!base) return Promise.resolve(null);
    return postJson("/api/controller-choice", { ...base, actionId, cardId, inputVisitId: inputVisitId(actionId), optionIndex });
  }

  function submitText(actionId, text) {
    const base = payloadBase();
    if (!base) return Promise.resolve(null);
    return postJson("/api/controller-text-submit", { ...base, actionId, inputVisitId: inputVisitId(actionId), text });
  }

  function grantMicrophoneAccess(actionId) {
    const base = payloadBase();
    if (!base) return Promise.resolve(null);
    return postJson("/api/controller-microphone-access", { ...base, actionId, inputVisitId: inputVisitId(actionId) });
  }

  function inputEvent(actionId, eventType) {
    const base = payloadBase();
    if (!base) return Promise.resolve(null);
    return postJson("/api/input-event", { ...base, actionId, eventType });
  }

  function startOrCancelGame({ isCancel = false, startToken = "" } = {}) {
    const base = payloadBase();
    if (!base) return Promise.resolve(null);
    return postJson(isCancel ? "/api/cancel-start" : "/api/start", { ...base, startToken });
  }

  function updateAvatar(shape) {
    const base = payloadBase();
    if (!base) return Promise.resolve(null);
    return postJson("/api/avatar", { ...base, shape });
  }

  return Object.freeze({
    heartbeat,
    grantMicrophoneAccess,
    inputEvent,
    join,
    submitChoice,
    submitText,
    startOrCancelGame,
    updateAvatar
  });
}

module.exports = Object.freeze({ createControllerSubmitApi });
