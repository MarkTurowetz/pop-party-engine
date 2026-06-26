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
    setText,
    setControllerState,
    showView
  }) {
    const writeText = typeof setText === "function"
      ? setText
      : (target, value) => {
        window.PartyGameControllerText?.setText(target, value);
      };

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
        writeText(elements.meta, "Reconnecting to lobby");
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
