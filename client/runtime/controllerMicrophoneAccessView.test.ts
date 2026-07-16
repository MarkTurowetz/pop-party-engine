import { describe, expect, it, vi } from "vitest";
import { createControllerMicrophoneAccessView } from "./controllerMicrophoneAccessView";

describe("createControllerMicrophoneAccessView (ported)", () => {
  it("render returns false without a microphoneAccess input (no DOM touched)", () => {
    const view = createControllerMicrophoneAccessView({
      applyLayoutForPhase: vi.fn(),
      elements: {} as never,
      getButton: vi.fn(),
      grantAccess: vi.fn(),
      hideViews: vi.fn(),
      showView: vi.fn(),
      waiting: { message: {} as HTMLElement }
    });
    expect(view.render({}, {})).toBe(false);
  });

  it("installs the global bridge on import", () => {
    const host = globalThis as typeof globalThis & { createControllerMicrophoneAccessView?: unknown };
    expect(host.createControllerMicrophoneAccessView).toBeTypeOf("function");
  });
});
