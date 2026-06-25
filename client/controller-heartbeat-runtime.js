(function () {
  "use strict";

  function createControllerHeartbeatRuntime({
    applyLayoutForPhase,
    closeAvatarPicker,
    elements,
    getControllerState,
    hideViews,
    renderState,
    sendHeartbeat,
    setControllerState,
    showView
  }) {
    let timer = null;

    function stop() {
      window.clearInterval(timer);
      timer = null;
    }

    async function pollHeartbeat() {
      const state = getControllerState();
      if (!state) return;
      try {
        const result = await sendHeartbeat();
        renderState(result.lobby);
      } catch (error) {
        if (error.code === "KICKED_TO_LOBBY") {
          stop();
          setControllerState(null);
          closeAvatarPicker({ commit: false });
          hideViews();
          showView("join");
          applyLayoutForPhase("join");
          elements.joinButton.disabled = false;
          return;
        }
        elements.meta.textContent = "Reconnecting to lobby";
      }
    }

    function start() {
      stop();
      timer = window.setInterval(pollHeartbeat, 1000);
    }

    return {
      start,
      stop
    };
  }

  window.createControllerHeartbeatRuntime = createControllerHeartbeatRuntime;
})();
