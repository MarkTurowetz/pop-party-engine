(function () {
  "use strict";

  function createControllerGlobalActionView({
    advanceStageClick,
    applyLayoutForPhase,
    elements,
    hideViews
  }) {
    let pendingKey = "";

    function isPresentClickAction(lobby) {
      return lobby?.action?.type === "present" && Boolean(lobby.action.id);
    }

    function actionKey(config) {
      return `${config.id || "global"}:${config.actionId || ""}:${config.eventType || ""}`;
    }

    function syncPendingAction(config) {
      const key = actionKey(config);
      if (pendingKey && pendingKey !== key) pendingKey = "";
    }

    function setButtonPending(config, isPending) {
      elements.button.disabled = isPending;
      elements.button.textContent = isPending
        ? config.pendingLabel || "Working"
        : config.buttonLabel || "Next";
    }

    function bindButton(config) {
      elements.button.onclick = async () => {
        if (pendingKey) return;
        const key = actionKey(config);
        pendingKey = key;
        setButtonPending(config, true);
        try {
          await config.run();
        } catch (error) {
          elements.message.textContent = error.message || "Could not advance";
        } finally {
          if (pendingKey === key) pendingKey = "";
          setButtonPending(config, false);
        }
      };
    }

    function renderConfig(config) {
      syncPendingAction(config);
      hideViews();
      applyLayoutForPhase(config.layoutPhase || "lobby");
      elements.state.classList.remove("hidden");
      elements.message.textContent = config.message || "Waiting for the next instruction";
      elements.button.dataset.optionId = config.optionId || "global.action";
      elements.button.dataset.actionId = config.actionId || "";
      elements.button.dataset.eventType = config.eventType || "";
      elements.button.classList.toggle("hidden", config.showButton !== true);
      elements.button.onclick = null;

      if (config.showButton === true) {
        elements.button.disabled = config.enabled !== true;
        setButtonPending(config, pendingKey === actionKey(config));
        if (config.enabled === true && typeof config.run === "function") bindButton(config);
      } else {
        elements.button.disabled = true;
        elements.button.textContent = config.buttonLabel || "Next";
      }
      return true;
    }

    function presentClickConfig(lobby, me) {
      if (!isPresentClickAction(lobby)) return null;
      const action = lobby.action;
      const isVip = me?.isVip === true;
      return {
        id: "presentStageClick",
        actionId: action.id,
        buttonLabel: "Next",
        enabled: isVip,
        eventType: "stageClick",
        layoutPhase: lobby.phase || "lobby",
        message: isVip ? "Tap Next to continue" : "Waiting for the VIP to continue",
        optionId: "global.next",
        pendingLabel: "Advancing",
        run: () => advanceStageClick(action.id),
        showButton: isVip
      };
    }

    function renderPresentClick(lobby, me) {
      const config = presentClickConfig(lobby, me);
      return config ? renderConfig(config) : false;
    }

    function renderMessage(lobby, message, options = {}) {
      return renderConfig({
        id: options.id || "message",
        actionId: options.actionId || "",
        buttonLabel: options.buttonLabel || "Next",
        enabled: options.enabled === true,
        eventType: options.eventType || "",
        layoutPhase: options.layoutPhase || lobby?.phase || "lobby",
        message,
        optionId: options.optionId || "global.message",
        pendingLabel: options.pendingLabel || "Working",
        run: options.run,
        showButton: options.showButton === true
      });
    }

    return {
      presentClickConfig,
      render: renderPresentClick,
      renderConfig,
      renderMessage
    };
  }

  window.createControllerGlobalActionView = createControllerGlobalActionView;
})();
