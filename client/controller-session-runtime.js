(function () {
  "use strict";

  function createControllerSessionRuntime({
    elements,
    getControllerState,
    heartbeatRuntime,
    renderState,
    setControllerState,
    setLocalValue,
    setSessionValue
  }) {
    function enterLobby(stageCode, playerId, lobby, player) {
      setControllerState({ stageCode, playerId, player });
      setSessionValue("partyTemplatePlayerId", playerId);
      setSessionValue("partyTemplatePlayerName", player.name);
      setSessionValue("partyTemplateStageCode", stageCode);
      setLocalValue("partyTemplateStageCode", stageCode);
      elements.joinState.classList.add("hidden");
      elements.lobbyState.classList.remove("hidden");
      renderState(lobby);
      heartbeatRuntime.start();
    }

    function sendLeaveBeacon(origin) {
      const state = getControllerState();
      if (!state || !navigator.sendBeacon) return;
      const body = JSON.stringify({
        stageCode: state.stageCode,
        playerId: state.playerId
      });
      navigator.sendBeacon(`${origin}/api/leave`, new Blob([body], { type: "application/json" }));
    }

    return {
      enterLobby,
      sendLeaveBeacon
    };
  }

  window.createControllerSessionRuntime = createControllerSessionRuntime;
})();
