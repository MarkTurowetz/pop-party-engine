import { describe, expect, it, vi } from "vitest";
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

  it("installs the global bridge on import", () => {
    const host = globalThis as typeof globalThis & { createControllerVoiceInput?: unknown };
    expect(host.createControllerVoiceInput).toBeTypeOf("function");
  });
});
