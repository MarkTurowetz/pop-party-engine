(function () {
  "use strict";

  function createControllerLobbyView({
    applyLayoutForPhase,
    elements,
    hideViews,
    setAvatar
  }) {
    function renderMissingPlayer() {
      elements.meta.textContent = "Reconnecting to lobby";
      hideViews();
      elements.introPresentButton.classList.add("hidden");
      elements.lobbyState.classList.remove("hidden");
      elements.startButton.classList.add("hidden");
    }

    function renderInGamePhase(me, phase) {
      hideViews();
      elements.introState.classList.toggle("hidden", phase !== "intro");
      elements.introPresentButton.classList.toggle("hidden", !(me.isVip && phase === "intro"));
      elements.introPresentButton.disabled = !(me.isVip && phase === "intro");
      applyLayoutForPhase(phase);
    }

    function renderLobby(lobby, me, phase) {
      hideViews();
      elements.introPresentButton.classList.add("hidden");
      elements.lobbyState.classList.remove("hidden");
      elements.playerName.textContent = me.name;
      setAvatar(me);
      elements.meta.textContent = me.isVip ? "VIP Player" : "Waiting for the VIP";
      elements.startButton.classList.toggle("hidden", !me.isVip);
      elements.startButton.classList.toggle("danger-button", phase === "starting");
      elements.startButton.textContent = phase === "starting" ? "Cancel" : "Start Game";
      elements.startButton.dataset.optionId = phase === "starting" ? "lobby.cancelStart" : "lobby.startGame";
      elements.startButton.disabled = !me.isVip;
      applyLayoutForPhase(phase);

      if (!me.isVip || phase !== "starting") return null;
      const clockOffset = (lobby.serverNow || Date.now()) - Date.now();
      const updateCancelButton = () => {
        const now = Date.now() + clockOffset;
        const cancelLocked = now >= (lobby.countdownEndsAt || now);
        elements.startButton.disabled = cancelLocked;
        if (cancelLocked) {
          elements.startButton.classList.remove("is-pressed", "is-releasing");
        }
      };
      updateCancelButton();
      return window.setInterval(updateCancelButton, 50);
    }

    return {
      renderInGamePhase,
      renderLobby,
      renderMissingPlayer
    };
  }

  window.createControllerLobbyView = createControllerLobbyView;
})();
