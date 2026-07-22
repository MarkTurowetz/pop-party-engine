// Typed port of the legacy client/controller-view-state.js IIFE. Installs
// window.createControllerViewState for the legacy controller runtime.

import { createControllerViewState } from "@pop-party/engine/client";
export { createControllerViewState } from "@pop-party/engine/client";
export type { ControllerViewState } from "@pop-party/engine/client";

declare global {
  interface Window {
    createControllerViewState?: typeof createControllerViewState;
  }
}

export function installControllerViewStateGlobals(target: Window | typeof globalThis = globalThis): void {
  (target as Window).createControllerViewState = createControllerViewState;
}

installControllerViewStateGlobals(typeof window !== "undefined" ? window : globalThis);
