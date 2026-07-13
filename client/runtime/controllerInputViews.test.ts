import { describe, expect, it, vi } from "vitest";
import { createControllerChoiceInputView } from "./controllerChoiceInputView";
import { createControllerTextInputView } from "./controllerTextInputView";

describe("createControllerChoiceInputView (ported)", () => {
  it("render returns false without an input (no DOM touched)", () => {
    const view = createControllerChoiceInputView({
      applyLayoutForPhase: vi.fn(),
      bindPress: vi.fn(),
      elements: {} as Record<string, HTMLElement>,
      hideViews: vi.fn(),
      showView: vi.fn(),
      submitChoice: vi.fn()
    });
    expect(view.render({}, {})).toBe(false);
  });

  it("explicitly turns on the prompt and response grid for an active choice input", () => {
    const setTextShown = vi.fn();
    const elements = {
      done: {},
      grid: { replaceChildren: vi.fn() },
      prompt: {},
      state: {}
    } as unknown as Record<string, HTMLElement>;
    const view = createControllerChoiceInputView({
      applyLayoutForPhase: vi.fn(),
      bindPress: vi.fn(),
      elements,
      hideViews: vi.fn(),
      setText: vi.fn(),
      setTextShown,
      showView: vi.fn(),
      submitChoice: vi.fn()
    });

    expect(
      view.render(
        { input: { actionId: "choice", inputMode: "submitOnce", options: [], prompt: "Pick one" }, phase: "crafting" },
        {}
      )
    ).toBe(true);
    expect(setTextShown).toHaveBeenCalledWith(elements.prompt, true, { instant: true });
    expect(setTextShown).toHaveBeenCalledWith(elements.grid, true, { instant: true });
  });

  it("installs the global bridge on import", () => {
    const host = globalThis as typeof globalThis & { createControllerChoiceInputView?: unknown };
    expect(host.createControllerChoiceInputView).toBeTypeOf("function");
  });
});

describe("createControllerTextInputView (ported)", () => {
  it("render returns false without a textInput (no DOM touched)", () => {
    const view = createControllerTextInputView({
      applyLayoutForPhase: vi.fn(),
      dismissedInvalidKey: () => "",
      elements: {} as never,
      getVoiceInput: vi.fn(),
      hideViews: vi.fn(),
      setPhaseActionId: vi.fn(),
      showView: vi.fn(),
      submitText: vi.fn()
    });
    expect(view.render({}, {})).toBe(false);
  });

  it("installs the global bridge on import", () => {
    const host = globalThis as typeof globalThis & { createControllerTextInputView?: unknown };
    expect(host.createControllerTextInputView).toBeTypeOf("function");
  });
});
