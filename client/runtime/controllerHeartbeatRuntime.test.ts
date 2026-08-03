import { describe, expect, it, vi } from "vitest";
import { createControllerHeartbeatRuntime, type ControllerHeartbeatOptions } from "./controllerHeartbeatRuntime";

function options(): ControllerHeartbeatOptions {
  return {
    applyLayoutForPhase: vi.fn(),
    elements: { meta: {} as HTMLElement },
    getJoinButton: () => ({} as HTMLButtonElement),
    getControllerState: vi.fn(),
    hideViews: vi.fn(),
    renderState: vi.fn(),
    sendHeartbeat: vi.fn(async () => ({ lobby: {} })),
    setControllerState: vi.fn(),
    showView: vi.fn()
  };
}

describe("createControllerHeartbeatRuntime (ported)", () => {
  it("returns start/stop and stop is safe before start", () => {
    const runtime = createControllerHeartbeatRuntime(options());
    expect(runtime.start).toBeTypeOf("function");
    expect(runtime.stop).toBeTypeOf("function");
    expect(() => runtime.stop()).not.toThrow();
  });

  it("installs the global bridge on import", () => {
    const host = globalThis as typeof globalThis & { createControllerHeartbeatRuntime?: unknown };
    expect(host.createControllerHeartbeatRuntime).toBeTypeOf("function");
  });

  it("allows only one heartbeat request in flight", async () => {
    let resolveHeartbeat!: (value: { lobby: unknown }) => void;
    const sendHeartbeat = vi.fn(() => new Promise<{ lobby: unknown }>((resolve) => {
      resolveHeartbeat = resolve;
    }));
    const renderState = vi.fn();
    const runtimeOptions = options();
    runtimeOptions.getControllerState = () => ({});
    runtimeOptions.sendHeartbeat = sendHeartbeat;
    runtimeOptions.renderState = renderState;
    const runtime = createControllerHeartbeatRuntime(runtimeOptions);

    const first = runtime.poll();
    await runtime.poll();
    expect(sendHeartbeat).toHaveBeenCalledTimes(1);
    resolveHeartbeat({ lobby: { revision: 2 } });
    await first;
    expect(renderState).toHaveBeenCalledWith({ revision: 2 });
  });

  it("discards an in-flight heartbeat after the runtime is stopped", async () => {
    let resolveHeartbeat!: (value: { lobby: unknown }) => void;
    const renderState = vi.fn();
    const runtimeOptions = options();
    runtimeOptions.getControllerState = () => ({});
    runtimeOptions.sendHeartbeat = () => new Promise((resolve) => { resolveHeartbeat = resolve; });
    runtimeOptions.renderState = renderState;
    const runtime = createControllerHeartbeatRuntime(runtimeOptions);

    const pending = runtime.poll();
    runtime.stop();
    resolveHeartbeat({ lobby: { revision: 3 } });
    await pending;
    expect(renderState).not.toHaveBeenCalled();
  });

  it("invalidates the controller identity when the server ends its game session", async () => {
    const runtimeOptions = options();
    const joinButton = { disabled: true } as HTMLButtonElement;
    runtimeOptions.getControllerState = () => ({ playerId: "p1" });
    runtimeOptions.getJoinButton = () => joinButton;
    runtimeOptions.sendHeartbeat = vi.fn(async () => {
      throw Object.assign(new Error("Game ended"), { code: "KICKED_TO_LOBBY" });
    });
    const runtime = createControllerHeartbeatRuntime(runtimeOptions);

    await runtime.poll();

    expect(runtimeOptions.setControllerState).toHaveBeenCalledWith(null);
    expect(runtimeOptions.hideViews).toHaveBeenCalledOnce();
    expect(runtimeOptions.showView).toHaveBeenCalledWith("join");
    expect(runtimeOptions.applyLayoutForPhase).toHaveBeenCalledWith("join");
    expect(joinButton.disabled).toBe(false);
  });

  it("surfaces a reconnecting state for transient heartbeat failures", async () => {
    const runtimeOptions = options();
    const setText = vi.fn();
    runtimeOptions.getControllerState = () => ({ playerId: "p1" });
    runtimeOptions.sendHeartbeat = vi.fn(async () => { throw new Error("offline"); });
    runtimeOptions.setText = setText;

    await createControllerHeartbeatRuntime(runtimeOptions).poll();

    expect(setText).toHaveBeenCalledWith(runtimeOptions.elements.meta, "Reconnecting to lobby");
    expect(runtimeOptions.setControllerState).not.toHaveBeenCalled();
  });
});
