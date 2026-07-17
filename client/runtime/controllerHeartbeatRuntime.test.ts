import { describe, expect, it, vi } from "vitest";
import { createControllerHeartbeatRuntime, type ControllerHeartbeatOptions } from "./controllerHeartbeatRuntime";

function options(): ControllerHeartbeatOptions {
  return {
    applyLayoutForPhase: vi.fn(),
    closeAvatarPicker: vi.fn(),
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
});
