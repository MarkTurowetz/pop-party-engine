(function () {
  "use strict";

  function createControllerSetupBindings({
    elements,
    getControllerState,
    getSessionValue,
    joinController,
    normalizeStageCode,
    removeSessionValue,
    setButtonText,
    setLocalValue,
    setDismissedInvalidKey,
    shouldAutoJoin,
    updateJoinButton
  }) {
    const writeButtonText = typeof setButtonText === "function"
      ? setButtonText
      : (target, value) => {
        if (target) target.textContent = String(value ?? "");
      };

    function showJoinError(error) {
      elements.joinButton.disabled = false;
      writeButtonText(elements.joinButton, error.message, {
        width: 260,
        height: 64,
        fontSize: 22
      });
      window.setTimeout(() => {
        writeButtonText(elements.joinButton, "Join", {
          width: 260,
          height: 64,
          fontSize: 24
        });
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
        setLocalValue?.("partyTemplatePlayerName", elements.playerNameInput.value.trim());
        updateJoinButton();
      });

      elements.joinForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        const stageCode = normalizeStageCode(elements.stageCodeInput.value);
        const playerName = elements.playerNameInput.value.trim();
        setLocalValue?.("partyTemplatePlayerName", playerName);
        try {
          await joinController(stageCode, playerName);
        } catch (error) {
          showJoinError(error);
        }
      });

      if (shouldAutoJoin() && normalizeStageCode(elements.stageCodeInput.value) && elements.playerNameInput.value.trim()) {
        writeButtonText(elements.joinButton, "Joining", {
          width: 260,
          height: 64,
          fontSize: 24
        });
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
