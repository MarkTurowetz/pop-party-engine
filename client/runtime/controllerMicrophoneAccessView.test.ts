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
      renderGlobalMessage: vi.fn(),
      showView: vi.fn()
    });
    expect(view.render({}, {})).toBe(false);
  });

  it("installs the global bridge on import", () => {
    const host = globalThis as typeof globalThis & { createControllerMicrophoneAccessView?: unknown };
    expect(host.createControllerMicrophoneAccessView).toBeTypeOf("function");
  });

  it("renders non-target players through the semantic Presentation layout bridge", () => {
    const renderGlobalMessage = vi.fn();
    const view = createControllerMicrophoneAccessView({
      applyLayoutForPhase: vi.fn(),
      elements: {} as never,
      getButton: vi.fn(),
      grantAccess: vi.fn(),
      hideViews: vi.fn(),
      renderGlobalMessage,
      showView: vi.fn()
    });

    expect(view.render({ microphoneAccess: { actionId: "mic", mode: "vip", vipPlayerId: "vip" } }, { id: "guest" })).toBe(true);
    expect(renderGlobalMessage).toHaveBeenCalledWith(
      expect.any(Object),
      "Waiting for the next instruction",
      { id: "microphoneAccessWaiting" }
    );
  });
});
