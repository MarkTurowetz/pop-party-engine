type LifecycleState = "Off" | "On";

export interface ControllerLocalButtonSlot {
  buttonClassName?: string;
  buttonId: string;
  container: HTMLElement;
  layoutPhase: string;
  optionId: string;
}

export interface ControllerLocalButtonRuntimeOptions {
  bindPress?: (button: HTMLButtonElement) => void;
  createButton?: (slot: ControllerLocalButtonSlot) => HTMLButtonElement;
  disposeButtonArt?: (button: HTMLButtonElement) => void;
  setButtonLifecycleState?: (button: HTMLButtonElement, state: LifecycleState) => void;
}

export function createControllerLocalButtonRuntime(options: ControllerLocalButtonRuntimeOptions = {}) {
  const { bindPress, createButton, disposeButtonArt, setButtonLifecycleState } = options;
  let activeButton: HTMLButtonElement | null = null;
  let activeSlot: ControllerLocalButtonSlot | null = null;

  function defaultCreateButton(slot: ControllerLocalButtonSlot): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.id = slot.buttonId;
    button.className = [
      "primary-button",
      "controller-submit-button",
      "controller-local-action-button",
      slot.buttonClassName || ""
    ].filter(Boolean).join(" ");
    return button;
  }

  function dispose(): void {
    if (!activeButton) return;
    setButtonLifecycleState?.(activeButton, "Off");
    disposeButtonArt?.(activeButton);
    activeButton.remove();
    activeButton = null;
    activeSlot = null;
  }

  function activate(
    slot: ControllerLocalButtonSlot,
    initialize?: (button: HTMLButtonElement) => void
  ): { button: HTMLButtonElement; isNew: boolean } {
    if (activeButton && activeSlot === slot && activeButton.isConnected) {
      return { button: activeButton, isNew: false };
    }
    dispose();
    const button = (createButton || defaultCreateButton)(slot);
    button.dataset.controllerOption = "";
    button.dataset.optionId = slot.optionId;
    if (!button.parentElement) slot.container.replaceChildren(button);
    bindPress?.(button);
    activeButton = button;
    activeSlot = slot;
    initialize?.(button);
    setButtonLifecycleState?.(button, "On");
    return { button, isNew: true };
  }

  function prepareForLayout(layoutPhase: string): void {
    if (activeSlot && activeSlot.layoutPhase !== layoutPhase) dispose();
  }

  function active(slot?: ControllerLocalButtonSlot): HTMLButtonElement | null {
    if (slot && activeSlot !== slot) return null;
    return activeButton?.isConnected ? activeButton : null;
  }

  return { activate, active, dispose, prepareForLayout };
}
