(function () {
  "use strict";

  function createControllerGlobalActionView({
    advanceStageClick,
    applyLayoutForPhase,
    elements,
    hideViews
  }) {
    let pendingActionId = "";

    function isPresentClickAction(lobby) {
      return lobby?.action?.type === "present" && Boolean(lobby.action.id);
    }

    function syncPendingAction(actionId) {
      if (pendingActionId && pendingActionId !== actionId) pendingActionId = "";
    }

    function setButtonPending(isPending) {
      elements.button.disabled = isPending;
      elements.button.textContent = isPending ? "Advancing" : "Next";
    }

    function bindButton(action) {
      elements.button.onclick = async () => {
        if (pendingActionId) return;
        pendingActionId = action.id;
        setButtonPending(true);
        try {
          await advanceStageClick(action.id);
        } catch (error) {
          elements.message.textContent = error.message || "Could not advance";
        } finally {
          if (pendingActionId === action.id) pendingActionId = "";
          setButtonPending(false);
        }
      };
    }

    function render(lobby, me) {
      if (!isPresentClickAction(lobby)) return false;
      const action = lobby.action;
      syncPendingAction(action.id);
      hideViews();
      elements.state.classList.remove("hidden");
      elements.button.dataset.optionId = "global.next";
      elements.button.dataset.actionId = action.id;
      elements.button.dataset.eventType = "stageClick";
      elements.button.classList.toggle("hidden", me?.isVip !== true);
      if (me?.isVip === true) {
        setButtonPending(pendingActionId === action.id);
      } else {
        elements.button.disabled = true;
        elements.button.textContent = "Next";
      }
      elements.message.textContent = me?.isVip === true
        ? "Tap Next to continue"
        : "Waiting for the VIP to continue";
      if (me?.isVip === true) bindButton(action);
      applyLayoutForPhase(lobby.phase || "lobby");
      return true;
    }

    return { render };
  }

  window.createControllerGlobalActionView = createControllerGlobalActionView;
})();
