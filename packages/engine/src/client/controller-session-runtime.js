"use strict";

function createControllerSessionRuntime(options) {
  const {
    elements,
    fetchImpl = globalThis.fetch,
    getControllerState,
    heartbeatRuntime,
    renderState,
    setControllerState,
    setLocalValue,
    setSessionValue
  } = options;

  function enterLobby(stageCode, playerId, playerCapability, lobby, player) {
    setControllerState({ stageCode, playerId, playerCapability, player });
    setSessionValue("partyTemplatePlayerId", playerId);
    setSessionValue("partyTemplatePlayerName", player.name || "");
    setSessionValue("partyTemplateStageCode", stageCode);
    setSessionValue("partyTemplatePlayerCapability", playerCapability);
    setLocalValue("partyTemplateStageCode", stageCode);
    elements.joinState.classList.add("hidden");
    renderState(lobby);
    heartbeatRuntime.start();
  }

  function sendLeaveBeacon(origin) {
    const state = getControllerState();
    if (!state) return;
    const body = JSON.stringify({ stageCode: state.stageCode, playerId: state.playerId });
    fetchImpl(`${origin}/api/leave`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Stage-Code": String(state.stageCode || ""),
        "X-Player-Id": String(state.playerId || ""),
        "X-Player-Capability": String(state.playerCapability || "")
      },
      body,
      keepalive: true
    }).catch(() => {});
  }

  return Object.freeze({ enterLobby, sendLeaveBeacon });
}

module.exports = Object.freeze({ createControllerSessionRuntime });
