export {
  createControllerSessionRuntime,
  type ControllerSessionDictionary,
  type ControllerSessionPlayer,
  type ControllerSessionRuntime,
  type ControllerSessionRuntimeOptions,
  type ControllerSessionState
} from "@pop-party/engine/client";

import { createControllerSessionRuntime } from "@pop-party/engine/client";

declare global {
  interface Window {
    createControllerSessionRuntime?: typeof createControllerSessionRuntime;
  }
}

export function installControllerSessionRuntimeGlobals(target: Window | typeof globalThis = globalThis): void {
  (target as Window).createControllerSessionRuntime = createControllerSessionRuntime;
}

installControllerSessionRuntimeGlobals(typeof window !== "undefined" ? window : globalThis);
