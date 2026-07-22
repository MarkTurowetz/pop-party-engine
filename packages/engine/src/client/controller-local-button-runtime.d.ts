export type ControllerLocalButtonLifecycleState = "Off" | "On";

export interface ControllerLocalButtonSlot {
  buttonClassName?: string;
  buttonId: string;
  buttonType?: "button" | "submit";
  container: HTMLElement;
  layoutPhase: string;
  optionId: string;
}

export interface ControllerLocalButtonRuntimeOptions {
  bindPress?: (button: HTMLButtonElement) => void;
  createButton?: (slot: ControllerLocalButtonSlot) => HTMLButtonElement;
  disposeButtonArt?: (button: HTMLButtonElement) => void;
  setButtonLifecycleState?: (button: HTMLButtonElement, state: ControllerLocalButtonLifecycleState) => void;
}

export interface ControllerLocalButtonRuntime {
  activate(slot: ControllerLocalButtonSlot, initialize?: (button: HTMLButtonElement) => void): { button: HTMLButtonElement; isNew: boolean };
  active(slot?: ControllerLocalButtonSlot): HTMLButtonElement | null;
  dispose(slot?: ControllerLocalButtonSlot): void;
  prepareForLayout(layoutPhase: string): void;
}

export function createControllerLocalButtonRuntime(options?: ControllerLocalButtonRuntimeOptions): ControllerLocalButtonRuntime;
