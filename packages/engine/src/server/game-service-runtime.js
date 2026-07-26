"use strict";

const { createGameReadinessRuntime } = require("./game-readiness-runtime");
const { createWebServiceRuntime } = require("./web-service-runtime");

class GameServiceError extends Error {
  constructor(message, { code = "GAME_SERVICE_FAILED", details = {} } = {}) {
    super(message);
    this.name = "GameServiceError";
    this.code = code;
    this.details = Object.freeze({ ...details });
  }
}

function serviceError(code, message, details = {}) {
  return new GameServiceError(message, { code, details });
}

function diagnosticFor(error) {
  return Object.freeze({
    code: String(error?.code || "GAME_SERVICE_START_FAILED"),
    message: String(error?.message || "Game service startup failed"),
    details: Object.freeze({ ...(error?.details || {}) })
  });
}

function createGameServiceRuntime(options = {}) {
  if (typeof options.createRequestHandler !== "function") {
    throw new Error("Game service request-handler factory is required");
  }
  const readiness = createGameReadinessRuntime({
    gameDefinition: options.gameDefinition,
    engineVersion: options.engineVersion,
    contentSchemaVersion: options.contentSchemaVersion
  });
  const initialize = typeof options.initialize === "function" ? options.initialize : async () => {};
  const onStarted = typeof options.onStarted === "function" ? options.onStarted : async () => {};
  let active = null;
  let requestHandler = null;
  let state = Object.freeze({ status: "pending", diagnostic: null, release: null });

  function dispatch(request, response) {
    if (!requestHandler) {
      throw serviceError("GAME_SERVICE_NOT_READY", "Game service received a request before startup completed");
    }
    return requestHandler(request, response);
  }

  async function initializeService() {
    const candidate = await readiness.check();
    let candidateHandler;
    try {
      candidateHandler = await options.createRequestHandler(candidate);
    } catch (error) {
      throw serviceError("GAME_REQUEST_HANDLER_CREATE_FAILED", "Game request handler could not be created", {
        cause: String(error?.message || error)
      });
    }
    if (typeof candidateHandler !== "function") {
      throw serviceError("GAME_REQUEST_HANDLER_INVALID", "Game request-handler factory did not return a function");
    }
    try {
      await initialize(candidate);
    } catch (error) {
      throw serviceError("GAME_SERVICE_INITIALIZE_FAILED", "Game service initialization failed", {
        cause: String(error?.message || error)
      });
    }
    active = candidate;
    requestHandler = candidateHandler;
  }

  const webService = createWebServiceRuntime({
    requestHandler: dispatch,
    host: options.host,
    port: options.port,
    initialize: initializeService,
    sweep: options.sweep,
    sweepIntervalMs: options.sweepIntervalMs,
    createServer: options.createServer,
    networkInterfaces: options.networkInterfaces,
    setInterval: options.setInterval,
    clearInterval: options.clearInterval,
    onError: options.onError,
    async onStarted(startup) {
      await onStarted(startup, active);
    }
  });

  async function start() {
    state = Object.freeze({ status: "starting", diagnostic: null, release: null });
    try {
      const startup = await webService.start();
      state = Object.freeze({ status: "running", diagnostic: null, release: active.release });
      return startup;
    } catch (error) {
      active = null;
      requestHandler = null;
      state = Object.freeze({ status: "failed", diagnostic: diagnosticFor(error), release: null });
      throw error;
    }
  }

  async function stop() {
    await webService.stop();
    active = null;
    requestHandler = null;
    state = Object.freeze({ status: "stopped", diagnostic: null, release: null });
  }

  return Object.freeze({
    readiness,
    server: webService.server,
    start,
    stop,
    get active() {
      return active;
    },
    get lifecycle() {
      return webService.lifecycle;
    },
    get startup() {
      return webService.startup;
    },
    get state() {
      return state;
    }
  });
}

module.exports = Object.freeze({ GameServiceError, createGameServiceRuntime });
