// Typed port of the legacy client/controller-view-state.js IIFE. Installs
// window.createControllerViewState for the legacy controller runtime.

export interface ControllerViewState {
  hideAll(): void;
  setShown(viewId: string, isShown: boolean): HTMLElement | null;
  show(viewId: string): HTMLElement | null;
  view(viewId: string): HTMLElement | null;
}

export function createControllerViewState(views: Record<string, HTMLElement | null | undefined> = {}): ControllerViewState {
  function allViews(): HTMLElement[] {
    return Object.values(views).filter(Boolean) as HTMLElement[];
  }

  function hideAll(): void {
    for (const view of allViews()) {
      view.classList.add("hidden");
    }
  }

  function show(viewId: string): HTMLElement | null {
    const view = views[viewId] || null;
    if (!view) return null;
    view.classList.remove("hidden");
    return view;
  }

  function setShown(viewId: string, isShown: boolean): HTMLElement | null {
    const view = views[viewId] || null;
    if (!view) return null;
    view.classList.toggle("hidden", isShown === false);
    return view;
  }

  return {
    hideAll,
    setShown,
    show,
    view: (viewId: string) => views[viewId] || null
  };
}

declare global {
  interface Window {
    createControllerViewState?: typeof createControllerViewState;
  }
}

export function installControllerViewStateGlobals(target: Window | typeof globalThis = globalThis): void {
  (target as Window).createControllerViewState = createControllerViewState;
}

installControllerViewStateGlobals(typeof window !== "undefined" ? window : globalThis);
