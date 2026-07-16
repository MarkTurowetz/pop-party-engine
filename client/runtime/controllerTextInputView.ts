// Typed port of the legacy client/controller-text-input-view.js IIFE. Imports the
// ported PartyGameControllerText directly and installs
// window.createControllerTextInputView for the legacy controller runtime.

import { PartyGameControllerText } from "./controllerTextRenderer";
import { controllerTextLayoutStateId } from "../../shared/controller-layout-states";

type Dict = Record<string, unknown>;

interface VoiceInput {
  renderWaiting: (lobby: Dict) => void;
  stopRecognition: () => void;
  isListening: () => boolean;
  resetUi: () => void;
  bindButton: (actionId: string) => void;
}

export interface ControllerTextInputViewOptions {
  applyLayoutForPhase: (phase: string) => void;
  dismissedInvalidKey: () => string;
  elements: Record<string, HTMLInputElement & HTMLElement & HTMLButtonElement> & Record<string, HTMLElement>;
  getVoiceInput: () => VoiceInput;
  hideViews: () => void;
  setText?: (target: HTMLElement, value: unknown) => void;
  setTextShown?: (target: HTMLElement, isShown: boolean, options?: Dict) => void;
  setPhaseActionId: (actionId: string) => void;
  showView: (viewId: string) => void;
  submitText: (actionId: string) => void;
}

export function createControllerTextInputView(options: ControllerTextInputViewOptions): { render(lobby: Dict, me: Dict): boolean } {
  const {
    applyLayoutForPhase,
    dismissedInvalidKey,
    elements,
    getVoiceInput,
    hideViews,
    setText,
    setTextShown,
    setPhaseActionId,
    showView,
    submitText
  } = options;

  const writeText =
    typeof setText === "function"
      ? setText
      : (target: HTMLElement, value: unknown) => {
          PartyGameControllerText.setText(target, value);
        };
  const showText =
    typeof setTextShown === "function"
      ? setTextShown
      : (target: HTMLElement, isShown: boolean) => target?.classList?.toggle("hidden", !isShown);

  function setInputLimit(limit: number): void {
    if (limit > 0) {
      (elements.input as HTMLInputElement).maxLength = limit;
    } else {
      elements.input.removeAttribute("maxlength");
    }
  }

  function setVisibility({ isDone, isVoiceInput, showInvalid }: { isDone: boolean; isVoiceInput: boolean; showInvalid: boolean }): void {
    showText(elements.done, isDone, { instant: true });
    showText(elements.input, !isDone && !isVoiceInput, { instant: true });
    showText(elements.submitButton, !isDone && !isVoiceInput, { instant: true });
    showText(elements.voiceButton, !isDone && isVoiceInput, { instant: true });
    showText(elements.voiceStatus, !isDone && isVoiceInput, { instant: true });
    showText(elements.invalidBanner, showInvalid && !isDone, { instant: true });
  }

  function render(lobby: Dict, me: Dict): boolean {
    const input = (lobby.textInput || null) as Dict | null;
    if (!input) return false;
    const isVoiceInput = input.type === "voice" || input.mode === "voiceVip";
    const voiceInput = getVoiceInput();
    if (isVoiceInput && !me.isVip) {
      voiceInput.renderWaiting(lobby);
      return true;
    }
    if (!isVoiceInput) voiceInput.stopRecognition();
    hideViews();
    setPhaseActionId(input.actionId as string);
    applyLayoutForPhase(controllerTextLayoutStateId(input.type, input.mode));
    showView("textInput");
    writeText(elements.prompt, input.prompt || (isVoiceInput ? "Say your answer" : "Write your answer"));
    showText(elements.prompt, true, { instant: true });
    writeText(elements.invalidBanner, "Your submission was invalid");
    (elements.input as HTMLInputElement).placeholder = (input.placeholder as string) || "Answer here";
    setInputLimit(Number(input.characterLimit || 0));

    const answer = me.answer as Dict | undefined;
    const isDone = answer?.done === true;
    const isInvalid = answer?.invalid === true;
    const invalidKey = `${input.actionId}:${answer?.nonce || 0}`;
    const showInvalid = isInvalid && dismissedInvalidKey() !== invalidKey;
    setVisibility({ isDone, isVoiceInput: isVoiceInput as boolean, showInvalid });

    if (isDone) {
      writeText(elements.done, isVoiceInput ? `You said: ${answer?.text || ""}` : `You wrote: ${answer?.text || ""}`);
    } else if (showInvalid) {
      (elements.input as HTMLInputElement).value = "";
    } else if (isVoiceInput && !voiceInput.isListening()) {
      voiceInput.resetUi();
    }

    (elements.submitButton as HTMLButtonElement).disabled = (elements.input as HTMLInputElement).value.trim().length === 0;
    (elements.submitButton as HTMLButtonElement).onclick = () => submitText(input.actionId as string);
    voiceInput.bindButton(input.actionId as string);
    setVisibility({ isDone, isVoiceInput: isVoiceInput as boolean, showInvalid });
    return true;
  }

  return { render };
}

declare global {
  interface Window {
    createControllerTextInputView?: typeof createControllerTextInputView;
  }
}

export function installControllerTextInputViewGlobals(target: Window | typeof globalThis = globalThis): void {
  (target as Window).createControllerTextInputView = createControllerTextInputView;
}

installControllerTextInputViewGlobals(typeof window !== "undefined" ? window : globalThis);
