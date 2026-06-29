import { describe, expect, it, vi } from "vitest";
import { createControllerGlobalActionView } from "./controllerGlobalActionView";

function view() {
  return createControllerGlobalActionView({
    advanceStageClick: vi.fn(),
    applyLayoutForPhase: vi.fn(),
    elements: {} as never,
    hideViews: vi.fn(),
    showView: vi.fn()
  });
}

describe("createControllerGlobalActionView (ported)", () => {
  it("presentClickConfig is null without a present click action", () => {
    expect(view().presentClickConfig({}, {})).toBe(null);
    expect(view().presentClickConfig({ action: { type: "present" } }, {})).toBe(null);
  });

  it("presentClickConfig enables the button for the VIP only", () => {
    const lobby = { action: { type: "present", id: "a1" }, phase: "intro" };
    const vip = view().presentClickConfig(lobby, { isVip: true });
    const guest = view().presentClickConfig(lobby, { isVip: false });
    expect(vip?.enabled).toBe(true);
    expect(vip?.showButton).toBe(true);
    expect(vip?.message).toBe("Tap Next to continue");
    expect(guest?.enabled).toBe(false);
    expect(guest?.message).toBe("Waiting for the VIP to continue");
  });

  it("installs the global bridge on import", () => {
    const host = globalThis as typeof globalThis & { createControllerGlobalActionView?: unknown };
    expect(host.createControllerGlobalActionView).toBeTypeOf("function");
  });
});
