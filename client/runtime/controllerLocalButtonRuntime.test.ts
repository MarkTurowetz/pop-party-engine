import { describe, expect, it, vi } from "vitest";
import { createControllerLocalButtonRuntime, type ControllerLocalButtonSlot } from "./controllerLocalButtonRuntime";

function slot(layoutPhase: string, container: HTMLElement): ControllerLocalButtonSlot {
  return {
    buttonId: `${layoutPhase}Button`,
    container,
    layoutPhase,
    optionId: `${layoutPhase}.submit`
  };
}

describe("createControllerLocalButtonRuntime", () => {
  it("spawns one local button and reuses it while its layout remains active", () => {
    const container = { replaceChildren: vi.fn() } as unknown as HTMLElement;
    const textSlot = slot("controller-text-input", container);
    const button = {
      dataset: {},
      isConnected: true,
      parentElement: container,
      remove: vi.fn()
    } as unknown as HTMLButtonElement;
    const order: string[] = [];
    const lifecycle = vi.fn((_button, state) => order.push(state));
    const runtime = createControllerLocalButtonRuntime({
      bindPress: vi.fn(),
      createButton: vi.fn(() => button),
      setButtonLifecycleState: lifecycle
    });

    expect(runtime.activate(textSlot, () => order.push("initialize"))).toEqual({ button, isNew: true });
    expect(runtime.activate(textSlot)).toEqual({ button, isNew: false });
    expect(button.dataset.optionId).toBe("controller-text-input.submit");
    expect(lifecycle).toHaveBeenCalledTimes(1);
    expect(lifecycle).toHaveBeenCalledWith(button, "On");
    expect(order).toEqual(["initialize", "On"]);
  });

  it("creates a submit button for a form-owned Join slot", () => {
    const container = { replaceChildren: vi.fn() } as unknown as HTMLElement;
    const joinSlot = { ...slot("join", container), buttonType: "submit" as const };
    const created = {
      dataset: {},
      isConnected: true,
      parentElement: null,
      remove: vi.fn(),
      type: "button"
    } as unknown as HTMLButtonElement;
    const createButton = vi.fn((activeSlot: ControllerLocalButtonSlot) => {
      created.type = activeSlot.buttonType || "button";
      return created;
    });
    const runtime = createControllerLocalButtonRuntime({ createButton });

    runtime.activate(joinSlot);
    expect(createButton).toHaveBeenCalledWith(joinSlot);
    expect(created.type).toBe("submit");
    expect(container.replaceChildren).toHaveBeenCalledWith(created);
  });

  it("turns off, disposes, and removes the button before another layout mounts", () => {
    const textContainer = { replaceChildren: vi.fn() } as unknown as HTMLElement;
    const voiceContainer = { replaceChildren: vi.fn() } as unknown as HTMLElement;
    const textSlot = slot("controller-text-input", textContainer);
    const voiceSlot = slot("controller-voice-input", voiceContainer);
    const firstButton = {
      dataset: {},
      isConnected: true,
      parentElement: textContainer,
      remove: vi.fn()
    } as unknown as HTMLButtonElement;
    const secondButton = {
      dataset: {},
      isConnected: true,
      parentElement: voiceContainer,
      remove: vi.fn()
    } as unknown as HTMLButtonElement;
    const lifecycle = vi.fn();
    const disposeButtonArt = vi.fn();
    const runtime = createControllerLocalButtonRuntime({
      createButton: vi.fn()
        .mockReturnValueOnce(firstButton)
        .mockReturnValueOnce(secondButton),
      disposeButtonArt,
      setButtonLifecycleState: lifecycle
    });

    runtime.activate(textSlot);
    runtime.prepareForLayout(voiceSlot.layoutPhase);
    expect(lifecycle).toHaveBeenLastCalledWith(firstButton, "Off");
    expect(disposeButtonArt).toHaveBeenCalledWith(firstButton);
    expect(firstButton.remove).toHaveBeenCalledOnce();
    expect(runtime.active()).toBe(null);

    runtime.activate(voiceSlot);
    expect(runtime.active(voiceSlot)).toBe(secondButton);
    expect(runtime.active(textSlot)).toBe(null);
  });

  it("does not dispose the active button when a different slot asks to clean up", () => {
    const firstContainer = { replaceChildren: vi.fn() } as unknown as HTMLElement;
    const secondContainer = { replaceChildren: vi.fn() } as unknown as HTMLElement;
    const firstSlot = slot("join", firstContainer);
    const secondSlot = slot("lobby", secondContainer);
    const button = {
      dataset: {},
      isConnected: true,
      parentElement: firstContainer,
      remove: vi.fn()
    } as unknown as HTMLButtonElement;
    const runtime = createControllerLocalButtonRuntime({ createButton: () => button });

    runtime.activate(firstSlot);
    runtime.dispose(secondSlot);

    expect(button.remove).not.toHaveBeenCalled();
    expect(runtime.active(firstSlot)).toBe(button);
  });
});
