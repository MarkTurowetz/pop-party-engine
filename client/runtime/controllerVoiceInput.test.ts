import { describe, expect, it, vi } from "vitest";
import { createControllerVoiceInput, type ControllerVoiceInputOptions } from "./controllerVoiceInput";

function options(): ControllerVoiceInputOptions {
  return {
    applyLayoutForPhase: vi.fn(),
    button: {} as HTMLButtonElement,
    getReleaseBufferSeconds: () => 1,
    hideViews: vi.fn(),
    introMessage: {} as HTMLElement,
    previewText: vi.fn(async () => null),
    setButtonText: vi.fn(),
    setText: vi.fn(),
    showView: vi.fn(),
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

  it("installs the global bridge on import", () => {
    const host = globalThis as typeof globalThis & { createControllerVoiceInput?: unknown };
    expect(host.createControllerVoiceInput).toBeTypeOf("function");
  });
});
