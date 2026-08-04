"use strict";

function createControllerHeartbeatRuntime(options) {
  const {
    applyLayoutForPhase,
    clearIntervalImpl = globalThis.clearInterval.bind(globalThis),
    elements,
    eventTarget = globalThis,
    getJoinButton,
    getControllerState,
    hideViews,
    intervalMs = 1000,
    renderState,
    sendHeartbeat,
    setControllerState,
    setIntervalImpl = globalThis.setInterval.bind(globalThis),
    setText,
    showView,
    visibilityTarget = globalThis.document
  } = options;

  const writeText = typeof setText === "function"
    ? setText
    : (target, value) => { target.textContent = String(value ?? ""); };

  let timer = null;
  let polling = false;
  let runId = 0;
  let listening = false;

  function pollWhenForegrounded() {
    if (visibilityTarget?.visibilityState && visibilityTarget.visibilityState !== "visible") return;
    void pollHeartbeat();
  }

  function attachForegroundListeners() {
    if (listening) return;
    eventTarget?.addEventListener?.("focus", pollWhenForegrounded);
    visibilityTarget?.addEventListener?.("visibilitychange", pollWhenForegrounded);
    listening = true;
  }

  function detachForegroundListeners() {
    if (!listening) return;
    eventTarget?.removeEventListener?.("focus", pollWhenForegrounded);
    visibilityTarget?.removeEventListener?.("visibilitychange", pollWhenForegrounded);
    listening = false;
  }

  function stop() {
    if (timer !== null) clearIntervalImpl(timer);
    timer = null;
    detachForegroundListeners();
    runId += 1;
  }

  async function pollHeartbeat() {
    const state = getControllerState();
    if (!state || polling) return;
    const activeRunId = runId;
    polling = true;
    try {
      const result = await sendHeartbeat();
      if (activeRunId !== runId) return;
      renderState(result.lobby);
    } catch (error) {
      if (error?.code === "KICKED_TO_LOBBY") {
        stop();
        setControllerState(null);
        hideViews();
        showView("join");
        applyLayoutForPhase("join");
        getJoinButton().disabled = false;
        return;
      }
      writeText(elements.meta, "Reconnecting to lobby");
    } finally {
      polling = false;
    }
  }

  function start() {
    stop();
    attachForegroundListeners();
    timer = setIntervalImpl(pollHeartbeat, intervalMs);
  }

  return Object.freeze({ poll: pollHeartbeat, start, stop });
}

module.exports = Object.freeze({ createControllerHeartbeatRuntime });
