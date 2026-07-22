// Typed port of the legacy client/controller-module-cache.js IIFE. Installs
// window.createControllerModuleCache for the legacy controller runtime.

import { createControllerModuleCache } from "@pop-party/engine/client";
export { createControllerModuleCache } from "@pop-party/engine/client";
export type { ControllerModuleCache } from "@pop-party/engine/client";

declare global {
  interface Window {
    createControllerModuleCache?: typeof createControllerModuleCache;
  }
}

export function installControllerModuleCacheGlobals(target: Window | typeof globalThis = globalThis): void {
  (target as Window).createControllerModuleCache = createControllerModuleCache;
}

installControllerModuleCacheGlobals(typeof window !== "undefined" ? window : globalThis);
