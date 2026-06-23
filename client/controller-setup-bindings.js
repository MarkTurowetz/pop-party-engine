(function () {
  "use strict";

  function createControllerSetupBindings({
    elements,
    getControllerState,
    getSessionValue,
    joinController,
    normalizeStageCode,
    removeSessionValue,
    setDismissedInvalidKey,
    shouldAutoJoin,
    updateJoinButton
  }) {
    function showJoinError(error) {
      elements.joinButton.disabled = false;
      elements.joinButton.textContent = error.message;
      window.setTimeout(() => {
        elements.joinButton.textContent = "Join";
        updateJoinButton();
      }, 1800);
    }

    function bindJoinControls() {
      elements.stageCodeInput.addEventListener("input", () => {
        const cursorPosition = elements.stageCodeInput.selectionStart;
        elements.stageCodeInput.value = normalizeStageCode(elements.stageCodeInput.value);
        elements.stageCodeInput.setSelectionRange(cursorPosition, cursorPosition);
        updateJoinButton();
      });
      elements.playerNameInput.addEventListener("input", () => {
        if (!getControllerState() && elements.playerNameInput.value.trim() !== getSessionValue("partyTemplatePlayerName")) {
          removeSessionValue("partyTemplatePlayerId");
        }
        updateJoinButton();
      });

      elements.joinForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        const stageCode = normalizeStageCode(elements.stageCodeInput.value);
        const playerName = elements.playerNameInput.value.trim();
        try {
          await joinController(stageCode, playerName);
        } catch (error) {
          showJoinError(error);
        }
      });

      if (shouldAutoJoin() && normalizeStageCode(elements.stageCodeInput.value) && elements.playerNameInput.value.trim()) {
        elements.joinButton.textContent = "Joining";
        joinController(normalizeStageCode(elements.stageCodeInput.value), elements.playerNameInput.value.trim()).catch(showJoinError);
      }
    }

    function bindTextInputControls() {
      elements.textInput.addEventListener("input", () => {
        const state = getControllerState();
        if (state?.player?.answer?.invalid) {
          setDismissedInvalidKey(`${state.phaseActionId || ""}:${state.player.answer.nonce || 0}`);
        }
        elements.invalidBanner.classList.add("hidden");
        elements.textSubmitButton.disabled = elements.textInput.value.trim().length === 0;
      });
      elements.textInput.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" || event.shiftKey) return;
        event.preventDefault();
        if (!elements.textSubmitButton.disabled) elements.textSubmitButton.click();
      });
    }

    return {
      bindJoinControls,
      bindTextInputControls
    };
  }

  window.createControllerSetupBindings = createControllerSetupBindings;
})();
