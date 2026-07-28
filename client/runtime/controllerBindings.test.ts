import { describe, expect, it, vi } from "vitest";
import { createControllerSetupBindings } from "./controllerSetupBindings";
import { createControllerActionBindings } from "./controllerActionBindings";

describe("createControllerSetupBindings (ported)", () => {
  it("exposes the bind functions", () => {
    const bindings = createControllerSetupBindings({
      elements: {} as never,
      getJoinButton: () => ({} as HTMLButtonElement),
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

  it("saves the current writing draft on every edit with an ordered sequence", async () => {
    const listeners: Record<string, () => void> = {};
    const textInput = {
      addEventListener: (type: string, listener: () => void) => {
        listeners[type] = listener;
      },
      value: ""
    } as unknown as HTMLInputElement;
    const saveTextDraft = vi.fn(async () => null);
    const bindings = createControllerSetupBindings({
      elements: {
        invalidBanner: { classList: { add: vi.fn() } },
        textInput
      } as never,
      getJoinButton: () => ({} as HTMLButtonElement),
      getTextSubmitButton: () => ({ disabled: false } as HTMLButtonElement),
      getControllerState: () => ({
        lobby: { textInput: { actionId: "write", visitId: 12, type: "text" } },
        player: {}
      }),
      getSessionValue: () => "",
      joinController: vi.fn(async () => null),
      normalizeStageCode: (v: string) => v,
      removeSessionValue: vi.fn(),
      saveTextDraft,
      setDismissedInvalidKey: vi.fn(),
      shouldAutoJoin: () => false,
      updateJoinButton: vi.fn()
    });
    bindings.bindTextInputControls();

    textInput.value = "A";
    listeners.input();
    textInput.value = "Answer";
    listeners.input();
    await Promise.resolve();

    expect(saveTextDraft).toHaveBeenNthCalledWith(1, "write", "A", 1);
    expect(saveTextDraft).toHaveBeenNthCalledWith(2, "write", "Answer", 2);
  });
});

describe("createControllerActionBindings (ported)", () => {
  it("exposes bindAll", () => {
    const bindings = createControllerActionBindings({
      applyLayoutForPhase: vi.fn(),
      closeAvatarPicker: vi.fn(),
      elements: {} as never,
      getStartButton: () => null,
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
