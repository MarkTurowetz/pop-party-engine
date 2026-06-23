(function () {
  "use strict";

  function createControllerActionBindings({
    applyLayoutForPhase,
    closeAvatarPicker,
    elements,
    getControllerState,
    getSessionRuntime,
    getSubmitApi,
    openAvatarPicker,
    origin,
    renderState,
    setMetaText
  }) {
    function bindStartButton() {
      elements.startButton.addEventListener("click", async () => {
        const state = getControllerState();
        if (!state?.player?.isVip) return;
        const isCancel = elements.startButton.dataset.optionId === "lobby.cancelStart";
        try {
          const result = await getSubmitApi().startOrCancelGame({ isCancel, startToken: state.startToken });
          if (result.lobby) renderState(result.lobby);
        } catch (error) {
          setMetaText(error.message);
        }
      });
    }

    function bindAvatarPicker() {
      elements.avatar.addEventListener("click", openAvatarPicker);
      elements.avatarPicker.addEventListener("click", (event) => {
        if (event.target === elements.avatarPicker) closeAvatarPicker({ commit: true });
      });
      elements.avatarPickerPanel.addEventListener("click", (event) => {
        event.stopPropagation();
      });
      elements.avatarPickerDoneButton.addEventListener("click", () => closeAvatarPicker({ commit: true }));
    }

    function bindIntroButton() {
      elements.introPresentButton.addEventListener("click", async () => {
        const state = getControllerState();
        if (!state?.player?.isVip) return;
        elements.introPresentButton.disabled = true;
        try {
          const result = await getSubmitApi().presentIntro({ startToken: state.startToken });
          if (result.lobby) renderState(result.lobby);
        } catch (error) {
          elements.introPresentButton.textContent = error.message;
          window.setTimeout(() => {
            elements.introPresentButton.textContent = "Present HI THERE";
          }, 1800);
        } finally {
          elements.introPresentButton.disabled = false;
        }
      });
    }

    function bindWindowLifecycle() {
      window.addEventListener("pagehide", () => {
        getSessionRuntime().sendLeaveBeacon(origin);
      });
      window.addEventListener("resize", () => {
        if (!elements.controllerScreen.classList.contains("hidden")) {
          const state = getControllerState();
          applyLayoutForPhase(state ? state.phase || "lobby" : "join");
        }
      });
    }

    function bindAll() {
      bindStartButton();
      bindAvatarPicker();
      bindIntroButton();
      bindWindowLifecycle();
    }

    return { bindAll };
  }

  window.createControllerActionBindings = createControllerActionBindings;
})();
