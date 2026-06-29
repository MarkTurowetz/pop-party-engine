// Typed port of the legacy client/controller-module-cache.js IIFE. Installs
// window.createControllerModuleCache for the legacy controller runtime.

export interface ControllerModuleCache {
  get<T>(key: string, factory: () => T): T;
}

export function createControllerModuleCache(): ControllerModuleCache {
  const modules = new Map<string, unknown>();
  return {
    get<T>(key: string, factory: () => T): T {
      if (!modules.has(key)) modules.set(key, factory());
      return modules.get(key) as T;
    }
  };
}

declare global {
  interface Window {
    createControllerModuleCache?: typeof createControllerModuleCache;
  }
}

export function installControllerModuleCacheGlobals(target: Window | typeof globalThis = globalThis): void {
  (target as Window).createControllerModuleCache = createControllerModuleCache;
}

installControllerModuleCacheGlobals(typeof window !== "undefined" ? window : globalThis);
