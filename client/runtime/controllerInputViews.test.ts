import { describe, expect, it, vi } from "vitest";
import { createControllerChoiceInputView } from "./controllerChoiceInputView";
import { createControllerTextInputView } from "./controllerTextInputView";
import { controllerLayoutStateIds } from "../../shared/controller-layout-states";

describe("createControllerChoiceInputView (ported)", () => {
  it("render returns false without an input (no DOM touched)", () => {
    const view = createControllerChoiceInputView({
      applyLayoutForPhase: vi.fn(),
      bindPress: vi.fn(),
      elements: {} as never,
      hideViews: vi.fn(),
      showView: vi.fn(),
      submitChoice: vi.fn()
    });
    expect(view.render({}, {})).toBe(false);
  });

  it("explicitly turns on the prompt and response grid for an active choice input", () => {
    const setTextShown = vi.fn();
    const applyLayoutForPhase = vi.fn();
    const elements = {
      done: {},
      grid: { replaceChildren: vi.fn() },
      prompt: {},
      state: {}
    } as unknown as {
      done: HTMLElement;
      grid: HTMLElement;
      prompt: HTMLElement;
      state: HTMLElement;
    };
    const view = createControllerChoiceInputView({
      applyLayoutForPhase,
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
    expect(applyLayoutForPhase).toHaveBeenCalledWith(controllerLayoutStateIds.multipleChoice);
  });

  it("uses the voting controller layout for vote inputs", () => {
    const applyLayoutForPhase = vi.fn();
    const view = createControllerChoiceInputView({
      applyLayoutForPhase,
      bindPress: vi.fn(),
      elements: {
        done: {} as HTMLElement,
        grid: { replaceChildren: vi.fn() } as unknown as HTMLElement,
        prompt: {} as HTMLElement,
        state: {} as HTMLElement
      },
      hideViews: vi.fn(),
      setText: vi.fn(),
      setTextShown: vi.fn(),
      showView: vi.fn(),
      submitChoice: vi.fn()
    });

    expect(view.render({ input: { actionId: "vote", type: "vote", options: [] } }, {})).toBe(true);
    expect(applyLayoutForPhase).toHaveBeenCalledWith(controllerLayoutStateIds.voting);
  });

  it("keeps choice button hit targets mounted across heartbeat renders", () => {
    type Listener = () => void;
    class FakeButton {
      className = "";
      dataset: Record<string, string> = {};
      disabled = false;
      type = "button";
      parent: FakeGrid | null = null;
      listeners = new Map<string, Listener[]>();
      classList = {
        toggle: vi.fn()
      };
      addEventListener(type: string, listener: Listener) {
        this.listeners.set(type, [...(this.listeners.get(type) || []), listener]);
      }
      remove() {
        this.parent?.remove(this);
      }
      click() {
        for (const listener of this.listeners.get("click") || []) listener();
      }
    }
    class FakeGrid {
      nodes: FakeButton[] = [];
      get children() {
        return this.nodes;
      }
      querySelectorAll() {
        return this.nodes;
      }
      insertBefore(button: FakeButton, current: FakeButton | null) {
        this.remove(button);
        const index = current ? this.nodes.indexOf(current) : -1;
        if (index >= 0) this.nodes.splice(index, 0, button);
        else this.nodes.push(button);
        button.parent = this;
      }
      remove(button: FakeButton) {
        const index = this.nodes.indexOf(button);
        if (index >= 0) this.nodes.splice(index, 1);
        if (button.parent === this) button.parent = null;
      }
    }

    const grid = new FakeGrid();
    vi.stubGlobal("document", { createElement: () => new FakeButton() });
    const bindPress = vi.fn();
    const setButtonText = vi.fn();
    const submitChoice = vi.fn();
    const view = createControllerChoiceInputView({
      applyLayoutForPhase: vi.fn(),
      bindPress,
      elements: {
        done: {} as HTMLElement,
        grid: grid as unknown as HTMLElement,
        prompt: {} as HTMLElement,
        state: {} as HTMLElement
      },
      hideViews: vi.fn(),
      setButtonText,
      setText: vi.fn(),
      setTextShown: vi.fn(),
      showView: vi.fn(),
      submitChoice
    });
    const lobby = {
      input: {
        actionId: "vote-action",
        type: "vote",
        options: [
          { index: 0, cardId: "card-a", label: "Alpha" },
          { index: 1, cardId: "card-b", label: "Beta" }
        ]
      }
    };

    view.render(lobby, { id: "player" });
    const firstButton = grid.nodes[0];
    view.render(lobby, { id: "player" });

    expect(grid.nodes[0]).toBe(firstButton);
    expect(bindPress).toHaveBeenCalledTimes(2);
    expect(setButtonText).toHaveBeenCalledTimes(2);
    firstButton.click();
    expect(submitChoice).toHaveBeenCalledWith("vote-action", 0, "card-a");
    vi.unstubAllGlobals();
  });

  it("resolves dynamic prompt fields by layout id after the Crafting layout is applied", () => {
    const calls: string[] = [];
    const view = createControllerChoiceInputView({
      applyLayoutForPhase: () => calls.push("layout"),
      bindPress: vi.fn(),
      elements: {
        done: "controllerChoiceDone",
        grid: { replaceChildren: vi.fn() } as unknown as HTMLElement,
        prompt: "controllerChoicePrompt",
        state: {} as HTMLElement
      },
      hideViews: vi.fn(),
      setText: (target) => calls.push(`text:${String(target)}`),
      setTextShown: (target, shown) => calls.push(`shown:${String(target)}:${shown}`),
      showView: vi.fn(),
      submitChoice: vi.fn()
    });

    expect(view.render({ input: { actionId: "choice", options: [], prompt: "Choose a fossil" }, phase: "crafting-game-state" }, {})).toBe(true);
    expect(calls).toEqual([
      "layout",
      "text:controllerChoicePrompt",
      "shown:controllerChoicePrompt:true",
      "shown:controllerChoiceDone:false",
      "shown:[object Object]:true"
    ]);
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
      disposeButton: vi.fn(),
      elements: {} as never,
      getSubmitButton: vi.fn(),
      getVoiceInput: vi.fn(),
      getVoiceButton: vi.fn(),
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

  it("selects the voice layout for a voice input", () => {
    const applyLayoutForPhase = vi.fn();
    const getVoiceButton = vi.fn(() => ({} as HTMLButtonElement));
    const voiceInput = {
      bindButton: vi.fn(),
      isListening: () => false,
      renderWaiting: vi.fn(),
      resetUi: vi.fn(),
      stopRecognition: vi.fn()
    };
    const view = createControllerTextInputView({
      applyLayoutForPhase,
      dismissedInvalidKey: () => "",
      disposeButton: vi.fn(),
      elements: {
        done: {} as HTMLElement,
        input: { removeAttribute: vi.fn(), value: "" } as unknown as HTMLInputElement,
        invalidBanner: {} as HTMLElement,
        prompt: {} as HTMLElement,
        voiceStatus: {} as HTMLElement
      } as never,
      getSubmitButton: vi.fn(),
      getVoiceInput: () => voiceInput,
      getVoiceButton,
      hideViews: vi.fn(),
      setPhaseActionId: vi.fn(),
      setText: vi.fn(),
      setTextShown: vi.fn(),
      showView: vi.fn(),
      submitText: vi.fn()
    });

    expect(view.render({ textInput: { actionId: "voice", type: "voice" } }, { isVip: true })).toBe(true);
    expect(applyLayoutForPhase).toHaveBeenCalledWith(controllerLayoutStateIds.voiceInput);
    expect(getVoiceButton).toHaveBeenCalledOnce();
    expect(voiceInput.bindButton).toHaveBeenCalledWith("voice");
  });

  it("clears native input once for a new moment visit and preserves typing on heartbeats", () => {
    const inputElement = { removeAttribute: vi.fn(), value: "old answer" } as unknown as HTMLInputElement;
    const getSubmitButton = vi.fn(() => ({ disabled: false } as HTMLButtonElement));
    const view = createControllerTextInputView({
      applyLayoutForPhase: vi.fn(),
      dismissedInvalidKey: () => "",
      disposeButton: vi.fn(),
      elements: {
        done: {} as HTMLElement,
        input: inputElement,
        invalidBanner: {} as HTMLElement,
        prompt: {} as HTMLElement,
        voiceStatus: {} as HTMLElement
      } as never,
      getSubmitButton,
      getVoiceInput: () => ({
        bindButton: vi.fn(), isListening: () => false, renderWaiting: vi.fn(), resetUi: vi.fn(), stopRecognition: vi.fn()
      }),
      getVoiceButton: vi.fn(),
      hideViews: vi.fn(),
      setPhaseActionId: vi.fn(),
      setText: vi.fn(),
      setTextShown: vi.fn(),
      showView: vi.fn(),
      submitText: vi.fn()
    });

    view.render({ textInput: { actionId: "write", visitId: 7, type: "text" } }, {});
    expect(inputElement.value).toBe("");
    inputElement.value = "typing now";
    view.render({ textInput: { actionId: "write", visitId: 7, type: "text" } }, {});
    expect(inputElement.value).toBe("typing now");
    view.render({ textInput: { actionId: "write", visitId: 8, type: "text" } }, {});
    expect(inputElement.value).toBe("");
  });

  it("disposes the local input button after the answer is complete", () => {
    const disposeButton = vi.fn();
    const getSubmitButton = vi.fn();
    const view = createControllerTextInputView({
      applyLayoutForPhase: vi.fn(),
      dismissedInvalidKey: () => "",
      disposeButton,
      elements: {
        done: {} as HTMLElement,
        input: { removeAttribute: vi.fn(), value: "finished" } as unknown as HTMLInputElement,
        invalidBanner: {} as HTMLElement,
        prompt: {} as HTMLElement,
        voiceStatus: {} as HTMLElement
      } as never,
      getSubmitButton,
      getVoiceInput: () => ({
        bindButton: vi.fn(),
        isListening: () => false,
        renderWaiting: vi.fn(),
        resetUi: vi.fn(),
        stopRecognition: vi.fn()
      }),
      getVoiceButton: vi.fn(),
      hideViews: vi.fn(),
      setPhaseActionId: vi.fn(),
      setText: vi.fn(),
      setTextShown: vi.fn(),
      showView: vi.fn(),
      submitText: vi.fn()
    });

    expect(view.render({ textInput: { actionId: "text", type: "text" } }, { answer: { done: true, text: "finished" } })).toBe(true);
    expect(disposeButton).toHaveBeenCalledOnce();
    expect(getSubmitButton).not.toHaveBeenCalled();
  });
});
