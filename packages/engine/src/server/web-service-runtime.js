"use strict";

const http = require("node:http");
const os = require("node:os");

function normalizePort(value) {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error("Web service port must be an integer from 0 through 65535");
  }
  return port;
}

function normalizeSweepInterval(value) {
  const interval = Number(value);
  if (!Number.isFinite(interval) || interval <= 0) {
    throw new Error("Web service sweep interval must be greater than zero");
  }
  return interval;
}

function resolveListeningPort(server, requestedPort) {
  const address = server.address?.();
  return address && typeof address === "object" && Number.isInteger(address.port)
    ? address.port
    : requestedPort;
}

function resolveLanUrls(networkInterfaces, port) {
  const urls = [];
  for (const network of Object.values(networkInterfaces() || {})) {
    for (const details of network || []) {
      if (details.family === "IPv4" && !details.internal) {
        urls.push(`http://${details.address}:${port}`);
      }
    }
  }
  return Object.freeze(urls);
}

function listen(server, port, host) {
  return new Promise((resolve, reject) => {
    function cleanup() {
      server.removeListener("error", handleError);
      server.removeListener("listening", handleListening);
    }
    function handleError(error) {
      cleanup();
      reject(error);
    }
    function handleListening() {
      cleanup();
      resolve();
    }
    server.once("error", handleError);
    server.once("listening", handleListening);
    server.listen(port, host);
  });
}

function close(server) {
  if (!server.listening) return Promise.resolve();
  return new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}

function createWebServiceRuntime(options = {}) {
  const requestHandler = options.requestHandler || options.router;
  if (typeof requestHandler !== "function") throw new Error("Web service request handler is required");
  const host = String(options.host || "0.0.0.0");
  const port = normalizePort(options.port ?? 3000);
  const initialize = typeof options.initialize === "function" ? options.initialize : async () => {};
  const sweep = typeof options.sweep === "function" ? options.sweep : null;
  const sweepIntervalMs = normalizeSweepInterval(options.sweepIntervalMs ?? 2000);
  const createServer = options.createServer || http.createServer;
  const networkInterfaces = options.networkInterfaces || os.networkInterfaces;
  const setIntervalRuntime = options.setInterval || setInterval;
  const clearIntervalRuntime = options.clearInterval || clearInterval;
  const onStarted = typeof options.onStarted === "function" ? options.onStarted : () => {};
  const onError = typeof options.onError === "function" ? options.onError : (error) => console.error(error);
  const server = createServer(requestHandler);
  let lifecycle = "created";
  let startPromise = null;
  let sweepTimer = null;
  let startup = null;

  function reportRuntimeError(error) {
    onError(error);
  }

  async function start() {
    if (lifecycle === "stopped") throw new Error("Web service cannot restart after it has stopped");
    if (startPromise) return startPromise;
    lifecycle = "starting";
    startPromise = (async () => {
      try {
        await initialize();
        await listen(server, port, host);
        const listeningPort = resolveListeningPort(server, port);
        startup = Object.freeze({
          host,
          port: listeningPort,
          localUrl: `http://localhost:${listeningPort}`,
          lanUrls: resolveLanUrls(networkInterfaces, listeningPort)
        });
        server.on("error", reportRuntimeError);
        if (sweep) sweepTimer = setIntervalRuntime(sweep, sweepIntervalMs);
        lifecycle = "running";
        await onStarted(startup);
        return startup;
      } catch (error) {
        if (sweepTimer !== null) {
          clearIntervalRuntime(sweepTimer);
          sweepTimer = null;
        }
        server.removeListener("error", reportRuntimeError);
        await close(server).catch(() => {});
        lifecycle = "failed";
        throw error;
      }
    })();
    return startPromise;
  }

  async function stop() {
    if (lifecycle === "stopped") return;
    if (sweepTimer !== null) {
      clearIntervalRuntime(sweepTimer);
      sweepTimer = null;
    }
    server.removeListener("error", reportRuntimeError);
    await close(server);
    lifecycle = "stopped";
  }

  return Object.freeze({
    server,
    start,
    stop,
    get lifecycle() {
      return lifecycle;
    },
    get startup() {
      return startup;
    }
  });
}

module.exports = Object.freeze({ createWebServiceRuntime, resolveLanUrls });
