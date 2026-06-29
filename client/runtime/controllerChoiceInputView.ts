// Typed port of the legacy client/controller-choice-input-view.js IIFE. Imports the
// ported PartyGameControllerText directly and installs
// window.createControllerChoiceInputView for the legacy controller runtime.

import { PartyGameControllerText } from "./controllerTextRenderer";

type Dict = Record<string, unknown>;

export interface ControllerChoiceInputViewOptions {
  applyLayoutForPhase: (phase: string) => void;
  bindPress: (button: HTMLElement) => void;
  elements: Record<string, HTMLElement>;
  hideViews: () => void;
  setButtonText?: (target: HTMLElement, value: unknown, spec?: Dict) => void;
  setText?: (target: HTMLElement, value: unknown) => void;
  setTextShown?: (target: HTMLElement, isShown: boolean, options?: Dict) => void;
  showView: (viewId: string) => void;
  submitChoice: (actionId: string, optionIndex: number, cardId: string) => void;
}

export function createControllerChoiceInputView(options: ControllerChoiceInputViewOptions): {
  render(lobby: Dict, me: Dict): boolean;
} {
  const { applyLayoutForPhase, bindPress, elements, hideViews, setButtonText, setText, setTextShown, showView, submitChoice } =
    options;

  const writeText =
    typeof setText === "function"
      ? setText
      : (target: HTMLElement, value: unknown) => {
          PartyGameControllerText.setText(target, value);
        };
  const writeButtonText = typeof setButtonText === "function" ? setButtonText : (writeText as (t: HTMLElement, v: unknown, s?: Dict) => void);
  const showText =
    typeof setTextShown === "function"
      ? setTextShown
      : (target: HTMLElement, isShown: boolean) => target?.classList?.toggle("hidden", !isShown);

  function render(lobby: Dict, me: Dict): boolean {
    const input = (me.input || lobby.input || null) as Dict | null;
    if (!input) return false;
    hideViews();
    applyLayoutForPhase((lobby.phase as string) || "lobby");
    showView("choice");
    writeText(elements.prompt, input.prompt || "Answer this question by tapping an answer");
    elements.grid.replaceChildren();

    const answer = me.answer as Dict | undefined;
    const selectedIndex = Number.isFinite(Number(answer?.optionIndex)) ? Number(answer?.optionIndex) : -1;
    const isDone = input.mode === "submitOnce" && answer?.done === true;
    showText(elements.done, isDone as boolean, { instant: true });
    elements.grid.classList.toggle("hidden", isDone as boolean);
    if (isDone) {
      writeText(elements.done, `You chose: ${answer?.text || ""}`);
    }

    const visibleOptions = ((input.options as Dict[]) || []).filter(
      (option) => input.type !== "vote" || option.authorPlayerId !== me.id
    );
    for (const option of visibleOptions) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "choice-option-button";
      button.dataset.controllerOption = "";
      button.dataset.optionId = `choice.${option.index}`;
      button.classList.toggle("is-selected", Number(option.index) === selectedIndex);
      writeButtonText(button, option.label || option.text || `Option ${Number(option.index) + 1}`, {
        width: 320,
        height: 72,
        fontSize: 24
      });
      button.disabled = isDone as boolean;
      button.addEventListener("click", () => submitChoice(input.actionId as string, Number(option.index), (option.cardId as string) || ""));
      bindPress(button);
      elements.grid.appendChild(button);
    }

    return true;
  }

  return { render };
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
