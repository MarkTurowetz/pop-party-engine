(function attachPartyGameHotkeys() {
  "use strict";

  const commandByDigit = {
    Digit1: "spawn-controllers",
    Digit2: "tap-random-option",
    Digit3: "submit-random-text"
  };

  function commandFromEvent(event) {
    if (!event.shiftKey || !event.altKey || !(event.metaKey || event.ctrlKey)) return "";
    return commandByDigit[event.code] || commandByDigit[`Digit${event.key}`] || "";
  }

  window.addEventListener("keydown", (event) => {
    const command = commandFromEvent(event);
    if (!command) return;
    event.preventDefault();
    event.stopPropagation();
    try {
      const response = chrome.runtime.sendMessage({ type: "party-game-hotkey-command", command });
      if (response?.catch) response.catch(() => {});
    } catch (error) {
      // The extension context can be invalidated during a reload.
    }
  }, { capture: true });
})();
