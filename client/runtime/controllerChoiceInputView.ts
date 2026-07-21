// Typed port of the legacy client/controller-choice-input-view.js IIFE. Imports the
// ported PartyGameControllerText directly and installs
// window.createControllerChoiceInputView for the legacy controller runtime.

import { PartyGameControllerText } from "./controllerTextRenderer";
import { controllerChoiceLayoutStateId } from "../../shared/controller-layout-states";

type Dict = Record<string, unknown>;
type TextTarget = HTMLElement | string;

export interface ControllerChoiceInputViewOptions {
  applyLayoutForPhase: (phase: string) => void;
  bindPress: (button: HTMLElement) => void;
  elements: {
    done: TextTarget;
    grid: HTMLElement;
    prompt: TextTarget;
    state: HTMLElement;
  };
  hideViews: () => void;
  setButtonText?: (target: HTMLElement, value: unknown, spec?: Dict) => void;
  setText?: (target: TextTarget, value: unknown) => void;
  setTextShown?: (target: TextTarget, isShown: boolean, options?: Dict) => void;
  showView: (viewId: string) => void;
  submitChoice: (actionId: string, optionIndex: number, cardId: string) => void;
}

export function createControllerChoiceInputView(options: ControllerChoiceInputViewOptions): {
  render(lobby: Dict, me: Dict): boolean;
  reset(): void;
} {
  const { applyLayoutForPhase, bindPress, elements, hideViews, setButtonText, setText, setTextShown, showView, submitChoice } =
    options;

  const writeText =
    typeof setText === "function"
      ? setText
      : (target: TextTarget, value: unknown) => {
          if (typeof target === "string") return;
          PartyGameControllerText.setText(target, value);
        };
  const writeButtonText = typeof setButtonText === "function" ? setButtonText : (writeText as (t: HTMLElement, v: unknown, s?: Dict) => void);
  const showText =
    typeof setTextShown === "function"
      ? setTextShown
      : (target: TextTarget, isShown: boolean) => {
          if (typeof target !== "string") target?.classList?.toggle("hidden", !isShown);
        };

  function buttonKey(actionId: unknown, visitId: unknown, option: Dict): string {
    return [String(visitId || ""), String(actionId || ""), String(option.index ?? ""), String(option.cardId || "")].join(":");
  }

  function createChoiceButton(key: string): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "choice-option-button";
    button.dataset.controllerOption = "";
    button.dataset.controllerChoiceKey = key;
    button.addEventListener("click", () => {
      const optionIndex = Number(button.dataset.controllerChoiceOptionIndex);
      if (button.disabled || !Number.isFinite(optionIndex)) return;
      submitChoice(
        button.dataset.controllerChoiceActionId || "",
        optionIndex,
        button.dataset.controllerChoiceCardId || ""
      );
    });
    bindPress(button);
    return button;
  }

  function reconcileChoiceButtons(input: Dict, visibleOptions: Dict[], selectedIndex: number, isDone: boolean): void {
    const existing = new Map<string, HTMLButtonElement>();
    const currentButtons = typeof elements.grid.querySelectorAll === "function"
      ? Array.from(elements.grid.querySelectorAll<HTMLButtonElement>("button.choice-option-button"))
      : [];
    for (const node of currentButtons) {
      const key = node.dataset.controllerChoiceKey || "";
      if (key && !existing.has(key)) existing.set(key, node);
      else node.remove();
    }

    const desired: HTMLButtonElement[] = [];
    for (const option of visibleOptions) {
      const key = buttonKey(input.actionId, input.visitId, option);
      const button = existing.get(key) || createChoiceButton(key);
      existing.delete(key);
      const label = String(option.label || option.text || `Option ${Number(option.index) + 1}`);
      button.dataset.controllerChoiceActionId = String(input.actionId || "");
      button.dataset.controllerChoiceOptionIndex = String(option.index ?? "");
      button.dataset.controllerChoiceCardId = String(option.cardId || "");
      button.dataset.optionId = `choice.${option.index}`;
      button.classList.toggle("is-selected", Number(option.index) === selectedIndex);
      if (button.dataset.controllerChoiceLabel !== label) {
        button.dataset.controllerChoiceLabel = label;
        writeButtonText(button, label, { width: 320, height: 72, fontSize: 24 });
      }
      if (button.disabled !== isDone) button.disabled = isDone;
      desired.push(button);
    }
    for (const stale of existing.values()) stale.remove();

    // Do not re-append buttons that are already in the correct position. Moving
    // an active button between pointerdown and pointerup cancels native click.
    for (let index = 0; index < desired.length; index += 1) {
      const button = desired[index];
      const current = elements.grid.children[index] || null;
      if (current !== button) elements.grid.insertBefore(button, current);
    }
  }

  function render(lobby: Dict, me: Dict): boolean {
    const input = (me.input || lobby.input || null) as Dict | null;
    if (!input) return false;
    hideViews();
    applyLayoutForPhase(controllerChoiceLayoutStateId(input.type));
    showView("choice");
    writeText(elements.prompt, input.prompt || "Answer this question by tapping an answer");
    showText(elements.prompt, true, { instant: true });

    const answer = me.answer as Dict | undefined;
    const selectedIndex = Number.isFinite(Number(answer?.optionIndex)) ? Number(answer?.optionIndex) : -1;
    const isDone = input.mode === "submitOnce" && answer?.done === true;
    showText(elements.done, isDone as boolean, { instant: true });
    showText(elements.grid, !isDone, { instant: true });
    if (isDone) {
      writeText(elements.done, `You chose: ${answer?.text || ""}`);
    }

    const visibleOptions = ((input.options as Dict[]) || []).filter(
      (option) => input.type !== "vote" || option.authorPlayerId !== me.id
    );
    reconcileChoiceButtons(input, visibleOptions, selectedIndex, Boolean(isDone));

    return true;
  }

  function reset(): void {
    const buttons = typeof elements.grid.querySelectorAll === "function"
      ? Array.from(elements.grid.querySelectorAll<HTMLButtonElement>("button.choice-option-button"))
      : [];
    for (const button of buttons) button.remove();
  }

  return { render, reset };
}

declare global {
  interface Window {
    createControllerChoiceInputView?: typeof createControllerChoiceInputView;
  }
}

export function installControllerChoiceInputViewGlobals(target: Window | typeof globalThis = globalThis): void {
  (target as Window).createControllerChoiceInputView = createControllerChoiceInputView;
}

installControllerChoiceInputViewGlobals(typeof window !== "undefined" ? window : globalThis);
