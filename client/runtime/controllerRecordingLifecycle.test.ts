import { afterEach, describe, expect, it, vi } from "vitest";
import { createControllerRecordingLifecycle, type ControllerRecordingLifecycleOptions } from "./controllerRecordingLifecycle";

interface FakeRecognition {
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  lang: string;
  onresult: ((event: { resultIndex?: number; results: Record<number, unknown> & { length: number } }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

function fakeRecognition(): FakeRecognition {
  return {
    continuous: false,
    interimResults: false,
    maxAlternatives: 0,
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
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("begin starts recognition and goes busy", () => {
    const { api, recognition, onStatus } = lifecycle();
    expect(api.isBusy()).toBe(false);
    expect(api.begin("act1")).toBe(true);
    expect(api.isBusy()).toBe(true);
    expect(api.state()).toBe("listening");
    expect(recognition.start).toHaveBeenCalled();
    expect(recognition.continuous).toBe(true);
    expect(recognition.interimResults).toBe(false);
    expect(recognition.maxAlternatives).toBe(1);
    expect(onStatus).toHaveBeenCalledWith("Listening");
  });

  it("processes cumulative recognition results incrementally without repeated status renders", async () => {
    vi.stubGlobal("window", { clearTimeout: vi.fn(), setTimeout: vi.fn(() => 1) });
    const submitText = vi.fn(async () => null);
    const { api, recognition, onStatus } = lifecycle({ submitText });
    api.begin("act1");

    const firstResults = {
      length: 1,
      0: { isFinal: true, 0: { transcript: "hello" } }
    };
    recognition.onresult?.({ resultIndex: 0, results: firstResults });

    let staleResultReads = 0;
    const secondResults = {
      length: 2,
      get 0() {
        staleResultReads += 1;
        return { isFinal: true, 0: { transcript: "hello" } };
      },
      1: { isFinal: true, 0: { transcript: "world" } }
    };
    recognition.onresult?.({ resultIndex: 1, results: secondResults });

    expect(staleResultReads).toBe(0);
    expect(onStatus).toHaveBeenCalledTimes(1);
    expect(api.isCapturing()).toBe(true);

    api.release("act1");
    recognition.onend?.();
    await vi.waitFor(() => {
      expect(submitText).toHaveBeenCalledWith("act1", "hello world");
    });
  });

  it("begin returns false and errors when no recognition is available", () => {
    const { api, onError } = lifecycle({ recognitionConstructor: () => null });
    expect(api.begin("act1")).toBe(false);
    expect(api.isBusy()).toBe(false);
    expect(api.isCapturing()).toBe(false);
    expect(onError).toHaveBeenCalled();
  });

  it("cancel resets to idle", () => {
    const onStateChange = vi.fn();
    const { api, recognition } = lifecycle({ onStateChange });
    api.begin("act1");
    api.cancel({ abort: true });
    expect(api.isBusy()).toBe(false);
    expect(api.state()).toBe("idle");
    expect(onStateChange.mock.calls.map(([state]) => state)).toEqual(["listening", "idle"]);
    expect(recognition.onresult).toBeNull();
    expect(recognition.onerror).toBeNull();
    expect(recognition.onend).toBeNull();
    expect(recognition.abort).toHaveBeenCalledOnce();
  });

  it("installs the global bridge on import", () => {
    const host = globalThis as typeof globalThis & { createControllerRecordingLifecycle?: unknown };
    expect(host.createControllerRecordingLifecycle).toBeTypeOf("function");
  });
});
