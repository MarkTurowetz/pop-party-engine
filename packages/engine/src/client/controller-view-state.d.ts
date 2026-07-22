export interface ControllerViewState {
  hideAll(): void;
  setShown(viewId: string, isShown: boolean): HTMLElement | null;
  show(viewId: string): HTMLElement | null;
  view(viewId: string): HTMLElement | null;
}
export function createControllerViewState(views?: Record<string, HTMLElement | null | undefined>): ControllerViewState;
