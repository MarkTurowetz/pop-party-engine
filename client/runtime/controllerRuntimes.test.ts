import { describe, expect, it, vi } from "vitest";
import { createControllerSessionRuntime } from "./controllerSessionRuntime";
import { createControllerStateRuntime, type ControllerStateRuntimeOptions } from "./controllerStateRuntime";

describe("createControllerSessionRuntime (ported)", () => {
  it("installs the global bridge on import", () => {
    const host = globalThis as typeof globalThis & { createControllerSessionRuntime?: unknown };
    expect(host.createControllerSessionRuntime).toBeTypeOf("function");
  });

  it("exposes enterLobby + sendLeaveBeacon", () => {
    const runtime = createControllerSessionRuntime({
      elements: {} as Record<string, HTMLElement>,
      getControllerState: () => null,
      heartbeatRuntime: { start: vi.fn() },
      renderState: vi.fn(),
      setControllerState: vi.fn(),
      setLocalValue: vi.fn(),
      setSessionValue: vi.fn(),
      showView: vi.fn()
    });
    expect(runtime.enterLobby).toBeTypeOf("function");
    expect(runtime.sendLeaveBeacon).toBeTypeOf("function");
  });
});

describe("createControllerStateRuntime (ported)", () => {
  function options(over: Partial<ControllerStateRuntimeOptions> = {}): ControllerStateRuntimeOptions {
    const view = (render: () => boolean | number | null) => ({ render: vi.fn(render) });
    return {
      closeAvatarPicker: vi.fn(),
      getChoiceInputView: () => view(() => true),
      getGlobalActionView: () => ({ render: vi.fn(() => true), renderMessage: vi.fn(() => null) }),
      getLobbyView: () => ({ renderInGamePhase: vi.fn(), renderLobby: vi.fn(() => 99) }),
      getMicrophoneAccessView: () => view(() => true),
      getTextInputView: () => view(() => true),
      getVoiceInput: () => ({ stopRecognition: vi.fn() }),
      ...over
    };
  }

  it("routes a paused mid-game lobby to the paused spec", () => {
    const runtime = createControllerStateRuntime(options());
    const result = runtime.render({ isPaused: true, phase: "intro" }, {});
    expect(result.id).toBe("paused");
  });

  it("routes a microphone-access lobby to that spec", () => {
    const runtime = createControllerStateRuntime(options());
    const result = runtime.render({ microphoneAccess: { actionId: "a1" }, phase: "intro" }, {});
    expect(result.id).toBe("microphoneAccess");
  });

  it("falls through to the lobby view and surfaces its countdown timer", () => {
    const runtime = createControllerStateRuntime(options());
    const result = runtime.render({ phase: "lobby" }, {});
    expect(result.id).toBe("lobby");
    expect(result.countdownTimer).toBe(99);
  });
});
