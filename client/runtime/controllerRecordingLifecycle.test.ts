import { describe, expect, it, vi } from "vitest";
import { createControllerRecordingLifecycle, type ControllerRecordingLifecycleOptions } from "./controllerRecordingLifecycle";

function fakeRecognition() {
  return {
    continuous: false,
    interimResults: false,
    lang: "",
    onresult: null,
    onerror: null,
    onend: null,
    start: vi.fn(),
    stop: vi.fn(),
    abort: vi.fn()
  };
}

function lifecycle(overrides: Partial<ControllerRecordingLifecycleOptions> = {}) {
  const recognition = fakeRecognition();
  const onStatus = vi.fn();
  const onError = vi.fn();
  const api = createControllerRecordingLifecycle({
    previewText: vi.fn(async () => null),
    submitText: vi.fn(async () => null),
    recognitionConstructor: () => (function Rec() {
      return recognition;
    }) as unknown as new () => typeof recognition,
    onStatus,
    onError,
    ...overrides
  });
  return { api, recognition, onStatus, onError };
}

describe("createControllerRecordingLifecycle (ported)", () => {
  it("begin starts recognition and goes busy", () => {
    const { api, recognition, onStatus } = lifecycle();
    expect(api.isBusy()).toBe(false);
    expect(api.begin("act1")).toBe(true);
    expect(api.isBusy()).toBe(true);
    expect(api.state()).toBe("listening");
    expect(recognition.start).toHaveBeenCalled();
    expect(onStatus).toHaveBeenCalledWith("Listening");
  });

  it("begin returns false and errors when no recognition is available", () => {
    const { api, onError } = lifecycle({ recognitionConstructor: () => null });
    expect(api.begin("act1")).toBe(false);
    expect(api.isBusy()).toBe(false);
    expect(onError).toHaveBeenCalled();
  });

  it("cancel resets to idle", () => {
    const { api } = lifecycle();
    api.begin("act1");
    api.cancel({ abort: true });
    expect(api.isBusy()).toBe(false);
    expect(api.state()).toBe("idle");
  });

  it("installs the global bridge on import", () => {
    const host = globalThis as typeof globalThis & { createControllerRecordingLifecycle?: unknown };
    expect(host.createControllerRecordingLifecycle).toBeTypeOf("function");
  });
});
