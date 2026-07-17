import { describe, expect, it, vi } from "vitest";
import { createControllerSetupBindings } from "./controllerSetupBindings";
import { createControllerActionBindings } from "./controllerActionBindings";

describe("createControllerSetupBindings (ported)", () => {
  it("exposes the bind functions", () => {
    const bindings = createControllerSetupBindings({
      elements: {} as never,
      getTextSubmitButton: () => null,
      getControllerState: () => null,
      getSessionValue: () => "",
      joinController: vi.fn(async () => null),
      normalizeStageCode: (v: string) => v,
      removeSessionValue: vi.fn(),
      setDismissedInvalidKey: vi.fn(),
      shouldAutoJoin: () => false,
      updateJoinButton: vi.fn()
    });
    expect(bindings.bindJoinControls).toBeTypeOf("function");
    expect(bindings.bindTextInputControls).toBeTypeOf("function");
  });

  it("installs the global bridge on import", () => {
    const host = globalThis as typeof globalThis & { createControllerSetupBindings?: unknown };
    expect(host.createControllerSetupBindings).toBeTypeOf("function");
  });
});

describe("createControllerActionBindings (ported)", () => {
  it("exposes bindAll", () => {
    const bindings = createControllerActionBindings({
      applyLayoutForPhase: vi.fn(),
      closeAvatarPicker: vi.fn(),
      elements: {} as never,
      getControllerState: () => null,
      getSessionRuntime: () => ({ sendLeaveBeacon: vi.fn() }),
      getSubmitApi: () => ({ startOrCancelGame: vi.fn() }) as never,
      openAvatarPicker: vi.fn(),
      origin: "http://x",
      renderState: vi.fn(),
      setMetaText: vi.fn()
    });
    expect(bindings.bindAll).toBeTypeOf("function");
  });

  it("installs the global bridge on import", () => {
    const host = globalThis as typeof globalThis & { createControllerActionBindings?: unknown };
    expect(host.createControllerActionBindings).toBeTypeOf("function");
  });
});
