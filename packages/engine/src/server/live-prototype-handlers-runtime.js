"use strict";

function sessionIdFrom(req, payload = {}) {
  return String(
    req.headers?.["x-pop-party-authoring-session"]
    || payload.sessionId
    || ""
  );
}

function createLivePrototypeHandlersRuntime(options = {}) {
  const workspace = options.workspace;
  const readJson = options.readJson;
  const sendJson = options.sendJson;
  if (!workspace || typeof readJson !== "function" || typeof sendJson !== "function") {
    throw new Error("Live prototype handlers require a workspace and HTTP helpers");
  }

  async function run(res, operation, successStatus = 200) {
    try {
      const result = await operation();
      sendJson(res, successStatus, { ok: true, ...result });
    } catch (error) {
      sendJson(res, error?.status || 400, {
        ok: false,
        error: error.message,
        errorCode: error.code || "LIVE_PROTOTYPE_OPERATION_FAILED",
        diagnostics: error.diagnostics || []
      });
    }
  }

  async function handleBegin(req, res) {
    let payload = {};
    try {
      payload = await readJson(req, 64 * 1024);
    } catch (error) {
      // A header-only begin request is valid.
    }
    await run(res, () => workspace.begin(sessionIdFrom(req, payload)));
  }

  async function handleHeartbeat(req, res) {
    let payload = {};
    try {
      payload = await readJson(req, 64 * 1024);
    } catch (error) {
      // A header-only heartbeat is valid.
    }
    await run(res, () => workspace.heartbeat(sessionIdFrom(req, payload)));
  }

  async function handleDiscard(req, res) {
    let payload = {};
    try {
      payload = await readJson(req, 64 * 1024);
    } catch (error) {
      // sendBeacon can arrive with an empty JSON body.
    }
    await run(res, () => workspace.discard(sessionIdFrom(req, payload)));
  }

  async function handleSave(req, res) {
    let payload;
    try {
      payload = await readJson(req, 128 * 1024);
    } catch (error) {
      sendJson(res, 400, { ok: false, error: "Invalid workspace save payload" });
      return;
    }
    await run(res, () => workspace.save(
      sessionIdFrom(req, payload),
      String(payload.idempotencyKey || "")
    ));
  }

  function sendState(res) {
    sendJson(res, 200, { ok: true, ...workspace.state() });
  }

  return Object.freeze({
    handleBegin,
    handleDiscard,
    handleHeartbeat,
    handleSave,
    sendState,
    sessionIdFrom
  });
}

module.exports = Object.freeze({ createLivePrototypeHandlersRuntime, sessionIdFrom });
