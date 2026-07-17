// Typed port of the legacy client/controller-setup-bindings.js IIFE. Imports the
// ported PartyGameControllerText directly and installs
// window.createControllerSetupBindings for the legacy controller runtime.

import { PartyGameControllerText } from "./controllerTextRenderer";

type Dict = Record<string, unknown>;
const BUTTON_SPEC = { width: 260, height: 64, fontSize: 24 };

export interface ControllerSetupBindingsOptions {
  elements: Record<string, HTMLInputElement & HTMLButtonElement & HTMLFormElement & HTMLElement> & Record<string, HTMLElement>;
  getJoinButton: () => HTMLButtonElement;
  getTextSubmitButton: () => HTMLButtonElement | null;
  getControllerState: () => Dict | null | undefined;
  getSessionValue: (key: string) => string;
  joinController: (stageCode: string, playerName: string) => Promise<unknown>;
  normalizeStageCode: (value: string) => string;
  removeSessionValue: (key: string) => void;
  setButtonText?: (target: HTMLElement, value: unknown, spec?: Dict) => void;
  setShown?: (target: HTMLElement, isShown: boolean, options?: Dict) => void;
  setLocalValue?: (key: string, value: string) => void;
  setDismissedInvalidKey: (key: string) => void;
  shouldAutoJoin: () => boolean;
  updateJoinButton: () => void;
}

export function createControllerSetupBindings(options: ControllerSetupBindingsOptions) {
  const {
    elements,
    getJoinButton,
    getTextSubmitButton,
    getControllerState,
    getSessionValue,
    joinController,
    normalizeStageCode,
    removeSessionValue,
    setButtonText,
    setShown,
    setLocalValue,
    setDismissedInvalidKey,
    shouldAutoJoin,
    updateJoinButton
  } = options;

  const writeButtonText =
    typeof setButtonText === "function"
      ? setButtonText
      : (target: HTMLElement, value: unknown, spec?: Dict) => {
          PartyGameControllerText.setButtonText(target, value, spec);
        };

  function showJoinError(error: Error): void {
    getJoinButton().disabled = false;
    writeButtonText(getJoinButton(), error.message, { width: 260, height: 64, fontSize: 22 });
    window.setTimeout(() => {
      writeButtonText(getJoinButton(), "Join", { ...BUTTON_SPEC });
      updateJoinButton();
    }, 1800);
  }

  function bindJoinControls(): void {
    const stageInput = elements.stageCodeInput as HTMLInputElement;
    const nameInput = elements.playerNameInput as HTMLInputElement;
    stageInput.addEventListener("input", () => {
      const cursorPosition = stageInput.selectionStart;
      stageInput.value = normalizeStageCode(stageInput.value);
      stageInput.setSelectionRange(cursorPosition, cursorPosition);
      updateJoinButton();
    });
    nameInput.addEventListener("input", () => {
      if (!getControllerState() && nameInput.value.trim() !== getSessionValue("partyTemplatePlayerName")) {
        removeSessionValue("partyTemplatePlayerId");
      }
      setLocalValue?.("partyTemplatePlayerName", nameInput.value.trim());
      updateJoinButton();
    });

    (elements.joinForm as HTMLFormElement).addEventListener("submit", async (event) => {
      event.preventDefault();
      const stageCode = normalizeStageCode(stageInput.value);
      const playerName = nameInput.value.trim();
      setLocalValue?.("partyTemplatePlayerName", playerName);
      try {
        await joinController(stageCode, playerName);
      } catch (error) {
        showJoinError(error as Error);
      }
    });

    if (shouldAutoJoin() && normalizeStageCode(stageInput.value) && nameInput.value.trim()) {
      writeButtonText(getJoinButton(), "Joining", { ...BUTTON_SPEC });
      joinController(normalizeStageCode(stageInput.value), nameInput.value.trim()).catch(showJoinError);
    }
  }

  function bindTextInputControls(): void {
    const textInput = elements.textInput as HTMLInputElement;
    textInput.addEventListener("input", () => {
      const state = getControllerState();
      const answer = (state?.player as Dict)?.answer as Dict | undefined;
      if (answer?.invalid) {
        setDismissedInvalidKey(`${state?.phaseActionId || ""}:${answer.nonce || 0}`);
      }
      if (setShown) setShown(elements.invalidBanner, false, { instant: true });
      else elements.invalidBanner.classList.add("hidden");
      const submitButton = getTextSubmitButton();
      if (submitButton) submitButton.disabled = textInput.value.trim().length === 0;
    });
    textInput.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" || event.shiftKey) return;
      event.preventDefault();
      const submitButton = getTextSubmitButton();
      if (submitButton && !submitButton.disabled) submitButton.click();
    });
  }

  return { bindJoinControls, bindTextInputControls };
}

declare global {
  interface Window {
    createControllerSetupBindings?: typeof createControllerSetupBindings;
  }
}

export function installControllerSetupBindingsGlobals(target: Window | typeof globalThis = globalThis): void {
  (target as Window).createControllerSetupBindings = createControllerSetupBindings;
}

installControllerSetupBindingsGlobals(typeof window !== "undefined" ? window : globalThis);
