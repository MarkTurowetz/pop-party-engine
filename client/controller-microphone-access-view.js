(function () {
  "use strict";

  function createControllerMicrophoneAccessView({
    applyLayoutForPhase,
    elements,
    grantAccess,
    hideViews,
    renderGlobalMessage,
    showView,
    waiting
  }) {
    const pendingAutoGrantActionIds = new Set();
    const rememberedAccessKey = "partyTemplate.microphoneAccessGranted";

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

    function hasRememberedAccess() {
      try {
        return localStorage.getItem(rememberedAccessKey) === "true";
      } catch (error) {
        return false;
      }
    }

    function rememberAccessGranted() {
      try {
        localStorage.setItem(rememberedAccessKey, "true");
      } catch (error) {
        // Storage can be unavailable in private browsing modes.
      }
    }

    async function browserAlreadyHasAccess() {
      const permissionState = await microphonePermissionState();
      if (permissionState === "granted") {
        rememberAccessGranted();
        return true;
      }
      if (permissionState === "denied") return false;
      if (hasRememberedAccess()) {
        try {
          localStorage.removeItem(rememberedAccessKey);
        } catch (error) {
          // Storage can be unavailable in private browsing modes.
        }
      }
      return false;
    }

    async function requestMicrophoneAccess() {
      const permissionState = await microphonePermissionState();
      if (permissionState === "granted") {
        rememberAccessGranted();
        return true;
      }
      if (permissionState === "denied") {
        throw new DOMException("Microphone access was blocked", "NotAllowedError");
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stopStream(stream);
      rememberAccessGranted();
      return true;
    }

    function reportGranted(input) {
      return Promise.resolve(grantAccess(input.actionId)).catch((error) => {
        elements.status.textContent = error.message || "Could not confirm microphone access";
      }).finally(() => {
        pendingAutoGrantActionIds.delete(input.actionId);
      });
    }

    function autoGrantIfReady(input, alreadyGranted) {
      if (pendingAutoGrantActionIds.has(input.actionId)) return;
      pendingAutoGrantActionIds.add(input.actionId);
      Promise.resolve(alreadyGranted ? true : browserAlreadyHasAccess()).then((hasAccess) => {
        if (!hasAccess) {
          pendingAutoGrantActionIds.delete(input.actionId);
          return;
        }
        rememberAccessGranted();
        elements.button.disabled = true;
        elements.status.textContent = "Microphone ready";
        reportGranted(input);
      }).catch(() => {
        pendingAutoGrantActionIds.delete(input.actionId);
      });
    }

    function renderWaiting(lobby, message = "Waiting for the player to grant microphone access") {
      if (typeof renderGlobalMessage === "function") {
        renderGlobalMessage(lobby, message, { id: "microphoneAccessWaiting" });
        return;
      }
      hideViews();
      applyLayoutForPhase(lobby.phase || "lobby");
      showView("intro");
      waiting.message.textContent = message;
    }

    function render(lobby, me) {
      const input = lobby.microphoneAccess || null;
      if (!input?.actionId) return false;
      const alreadyGranted = (input.grantedPlayerIds || []).includes(me.id);
      if (!isForPlayer(input, me)) {
        renderWaiting(lobby, "Waiting for the next instruction");
        return true;
      }

      hideViews();
      applyLayoutForPhase(lobby.phase || "lobby");
      showView("microphoneAccess");
      elements.prompt.textContent = input.prompt || "Give microphone access to the game";
      elements.button.textContent = input.buttonLabel || "Yes";
      elements.button.disabled = false;
      elements.status.textContent = "Chrome will ask for microphone permission";
      autoGrantIfReady(input, alreadyGranted);
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
      return true;
    }

    return { render };
  }

  window.createControllerMicrophoneAccessView = createControllerMicrophoneAccessView;
})();
