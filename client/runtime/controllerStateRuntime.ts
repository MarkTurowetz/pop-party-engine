export {
  createControllerStateRuntime,
  type ControllerStateRenderContext,
  type ControllerStateRuntime,
  type ControllerStateRuntimeDictionary,
  type ControllerStateRuntimeOptions,
  type ControllerStateSpec,
  type ControllerStateViewWithRender
} from "@pop-party/engine/client";

import { createControllerStateRuntime } from "@pop-party/engine/client";

declare global {
  interface Window {
    createControllerStateRuntime?: typeof createControllerStateRuntime;
  }
}

export function installControllerStateRuntimeGlobals(target: Window | typeof globalThis = globalThis): void {
  (target as Window).createControllerStateRuntime = createControllerStateRuntime;
}

installControllerStateRuntimeGlobals(typeof window !== "undefined" ? window : globalThis);
