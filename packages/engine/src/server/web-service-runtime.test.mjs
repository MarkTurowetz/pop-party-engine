import { EventEmitter } from "node:events";
import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const { createWebServiceRuntime } = require("./web-service-runtime");

function createFakeServer({ listenError = null } = {}) {
  const server = new EventEmitter();
  server.listening = false;
  server.listen = vi.fn((port, host) => {
    queueMicrotask(() => {
      if (listenError) return server.emit("error", listenError);
      server.listening = true;
      server.emit("listening");
    });
  });
  server.address = vi.fn(() => ({ port: 4321 }));
  server.close = vi.fn((callback) => {
    server.listening = false;
    callback();
  });
  return server;
}

describe("createWebServiceRuntime", () => {
  it("initializes before binding and owns cleanup scheduling and shutdown", async () => {
    const events = [];
    const server = createFakeServer();
    const sweep = vi.fn();
    const timer = {};
    const setIntervalRuntime = vi.fn(() => timer);
    const clearIntervalRuntime = vi.fn();
    const runtime = createWebServiceRuntime({
      requestHandler() {},
      port: 0,
      initialize() { events.push("initialize"); },
      createServer() { events.push("create"); return server; },
      networkInterfaces: () => ({ lan: [{ family: "IPv4", internal: false, address: "192.0.2.8" }] }),
      setInterval: setIntervalRuntime,
      clearInterval: clearIntervalRuntime,
      sweep,
      onStarted(startup) { events.push(`started:${startup.port}`); }
    });

    const startup = await runtime.start();

    expect(events).toEqual(["create", "initialize", "started:4321"]);
    expect(server.listen).toHaveBeenCalledWith(0, "0.0.0.0");
    expect(startup).toEqual({
      host: "0.0.0.0",
      port: 4321,
      localUrl: "http://localhost:4321",
      lanUrls: ["http://192.0.2.8:4321"]
    });
    expect(setIntervalRuntime).toHaveBeenCalledWith(sweep, 2000);
    expect(runtime.lifecycle).toBe("running");

    await runtime.stop();
    expect(clearIntervalRuntime).toHaveBeenCalledWith(timer);
    expect(server.close).toHaveBeenCalledOnce();
    expect(runtime.lifecycle).toBe("stopped");
  });

  it("fails before binding when authoritative initialization fails", async () => {
    const server = createFakeServer();
    const runtime = createWebServiceRuntime({
      requestHandler() {},
      initialize() { throw new Error("invalid content release"); },
      createServer: () => server
    });

    await expect(runtime.start()).rejects.toThrow("invalid content release");
    expect(server.listen).not.toHaveBeenCalled();
    expect(runtime.lifecycle).toBe("failed");
  });

  it("surfaces binding failures without starting cleanup work", async () => {
    const error = Object.assign(new Error("already used"), { code: "EADDRINUSE" });
    const server = createFakeServer({ listenError: error });
    const setIntervalRuntime = vi.fn();
    const runtime = createWebServiceRuntime({
      requestHandler() {},
      createServer: () => server,
      setInterval: setIntervalRuntime,
      sweep() {}
    });

    await expect(runtime.start()).rejects.toMatchObject({ code: "EADDRINUSE" });
    expect(setIntervalRuntime).not.toHaveBeenCalled();
    expect(runtime.lifecycle).toBe("failed");
  });
});
