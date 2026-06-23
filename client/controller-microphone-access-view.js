(function () {
  "use strict";

  function createControllerMicrophoneAccessView({
    applyLayoutForPhase,
    elements,
    grantAccess,
    hideViews,
    waiting
  }) {
    function isForPlayer(input, me) {
      if (!input) return false;
      return input.mode === "all" || me?.id === input.vipPlayerId;
    }

    function stopStream(stream) {
      for (const track of stream?.getTracks?.() || []) {
        track.stop();
      }
    }

    async function microphonePermissionState() {
      try {
        const permission = await navigator.permissions?.query?.({ name: "microphone" });
        return permission?.state || "";
      } catch (error) {
        return "";
      }
    }

    async function requestMicrophoneAccess() {
      const permissionState = await microphonePermissionState();
      if (permissionState === "granted") return true;
      if (permissionState === "denied") {
        throw new DOMException("Microphone access was blocked", "NotAllowedError");
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stopStream(stream);
      return true;
    }

    function renderWaiting(lobby, message = "Waiting for the player to grant microphone access") {
      hideViews();
      waiting.state.classList.remove("hidden");
      waiting.message.textContent = message;
      applyLayoutForPhase(lobby.phase || "lobby");
    }

    function render(lobby, me) {
      const input = lobby.microphoneAccess || null;
      if (!input?.actionId) return false;
      const alreadyGranted = (input.grantedPlayerIds || []).includes(me.id);
      if (!isForPlayer(input, me) || alreadyGranted) {
        renderWaiting(lobby, "Waiting for the next instruction");
        return true;
      }

      hideViews();
      elements.state.classList.remove("hidden");
      elements.prompt.textContent = input.prompt || "Give microphone access to the game";
      elements.button.textContent = input.buttonLabel || "Yes";
      elements.button.disabled = false;
      elements.status.textContent = "Chrome will ask for microphone permission";
      elements.button.onclick = async () => {
        if (!navigator.mediaDevices?.getUserMedia) {
          elements.status.textContent = "Microphone permission is not available in this browser";
          elements.button.disabled = true;
          return;
        }
        elements.button.disabled = true;
        elements.status.textContent = "Opening microphone permission";
        try {
          await requestMicrophoneAccess();
          elements.status.textContent = "Microphone ready";
          await grantAccess(input.actionId);
        } catch (error) {
          elements.button.disabled = false;
          elements.status.textContent = error?.name === "NotAllowedError"
            ? "Microphone access was blocked"
            : "Could not open the microphone";
        }
      };
      applyLayoutForPhase(lobby.phase || "lobby");
      return true;
    }

    return { render };
  }

  window.createControllerMicrophoneAccessView = createControllerMicrophoneAccessView;
})();
