import { afterEach, describe, expect, it, vi } from "vitest";
import { createControllerVoiceInput, type ControllerVoiceInputOptions } from "./controllerVoiceInput";

function options(): ControllerVoiceInputOptions {
  return {
    getButton: () => null,
    getReleaseBufferSeconds: () => 1,
    previewText: vi.fn(async () => null),
    renderGlobalMessage: vi.fn(),
    setButtonText: vi.fn(),
    setText: vi.fn(),
    status: {} as HTMLElement,
    submitText: vi.fn(async () => null)
  };
}

describe("createControllerVoiceInput (ported)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("is not listening before any recording begins", () => {
    const view = createControllerVoiceInput(options());
    expect(view.isListening()).toBe(false);
  });

  it("exposes the voice-input surface", () => {
    const view = createControllerVoiceInput(options());
    expect(view.bindButton).toBeTypeOf("function");
    expect(view.renderWaiting).toBeTypeOf("function");
    expect(view.start).toBeTypeOf("function");
  });

  it("renders waiting through the semantic Presentation layout bridge", () => {
    const renderGlobalMessage = vi.fn();
    const view = createControllerVoiceInput({ ...options(), renderGlobalMessage });
    view.renderWaiting({ phase: "voice-moment" });
    expect(renderGlobalMessage).toHaveBeenCalledWith(
      { phase: "voice-moment" },
      "Waiting for the VIP to answer",
      { id: "voiceInputWaiting" }
    );
  });

  it("keeps the record button enabled while listening so pointer capture can deliver release", async () => {
    const recognition = {
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
    const setPointerCapture = vi.fn();
    const releasePointerCapture = vi.fn();
    const button = {
      dataset: {} as DOMStringMap,
      disabled: false,
      onclick: null,
      onpointerdown: null,
      onpointerup: null,
      onpointercancel: null,
      onkeydown: null,
      onkeyup: null,
      setPointerCapture,
      hasPointerCapture: () => true,
      releasePointerCapture
    } as unknown as HTMLButtonElement;
    const status = { dataset: {} as DOMStringMap } as HTMLElement;
    const setButtonText = vi.fn((target: HTMLElement, value: unknown) => {
      target.dataset.controllerTextValue = String(value);
    });
    const setText = vi.fn((target: HTMLElement, value: unknown) => {
      target.dataset.textFitSource = String(value);
    });
    const Recognition = function Recognition() {
      return recognition;
    } as unknown as new () => typeof recognition;
    vi.stubGlobal("window", {
      SpeechRecognition: Recognition,
      clearTimeout: vi.fn(),
      setTimeout: vi.fn(() => 1)
    });
    vi.stubGlobal("navigator", { permissions: { query: vi.fn(async () => ({ state: "granted" })) } });
    vi.stubGlobal("localStorage", { getItem: vi.fn(), setItem: vi.fn(), removeItem: vi.fn() });
    const view = createControllerVoiceInput({
      ...options(),
      getButton: () => button,
      setButtonText,
      setText,
      status
    });
    view.bindButton("voice-action");

    button.onpointerdown?.({ preventDefault: vi.fn(), pointerId: 7 } as unknown as PointerEvent);
    await Promise.resolve();
    await Promise.resolve();

    expect(recognition.start).toHaveBeenCalledOnce();
    expect(button.disabled).toBe(false);
    expect(button.dataset.controllerTextValue).toBe("Release To Send");
    expect(setPointerCapture).toHaveBeenCalledWith(7);

    button.onpointerup?.({ preventDefault: vi.fn(), pointerId: 7 } as unknown as PointerEvent);
    expect(button.disabled).toBe(true);
    expect(button.dataset.controllerTextValue).toBe("Processing");
    expect(releasePointerCapture).toHaveBeenCalledWith(7);
    view.stopRecognition();
  });

  it("does not start a continuous recording after release wins a pending permission check", async () => {
    let resolvePermission!: (value: { state: string }) => void;
    const permission = new Promise<{ state: string }>((resolve) => {
      resolvePermission = resolve;
    });
    const recognition = {
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
    const button = {
      dataset: {} as DOMStringMap,
      disabled: false,
      onclick: null,
      onpointerdown: null,
      onpointerup: null,
      onpointercancel: null,
      onkeydown: null,
      onkeyup: null,
      setPointerCapture: vi.fn(),
      hasPointerCapture: () => true,
      releasePointerCapture: vi.fn()
    } as unknown as HTMLButtonElement;
    const Recognition = function Recognition() {
      return recognition;
    } as unknown as new () => typeof recognition;
    vi.stubGlobal("window", { SpeechRecognition: Recognition, clearTimeout: vi.fn(), setTimeout: vi.fn(() => 1) });
    vi.stubGlobal("navigator", { permissions: { query: vi.fn(() => permission) } });
    vi.stubGlobal("localStorage", { getItem: vi.fn(), setItem: vi.fn(), removeItem: vi.fn() });
    const view = createControllerVoiceInput({
      ...options(),
      getButton: () => button,
      status: { dataset: {} as DOMStringMap } as HTMLElement
    });
    view.bindButton("voice-action");

    button.onpointerdown?.({ preventDefault: vi.fn(), pointerId: 3 } as unknown as PointerEvent);
    button.onpointerup?.({ preventDefault: vi.fn(), pointerId: 3 } as unknown as PointerEvent);
    resolvePermission({ state: "granted" });
    await Promise.resolve();
    await Promise.resolve();

    expect(recognition.start).not.toHaveBeenCalled();
  });

  it("installs the global bridge on import", () => {
    const host = globalThis as typeof globalThis & { createControllerVoiceInput?: unknown };
    expect(host.createControllerVoiceInput).toBeTypeOf("function");
  });
});
