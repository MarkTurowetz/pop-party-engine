export {
  createControllerSubmitApi,
  type ControllerSubmitApi,
  type ControllerSubmitApiOptions,
  type ControllerSubmitJson,
  type ControllerSubmitState
} from "@pop-party/engine/client";

import { createControllerSubmitApi } from "@pop-party/engine/client";

declare global {
  interface Window {
    createControllerSubmitApi?: typeof createControllerSubmitApi;
  }
}

export function installControllerSubmitApiGlobals(target: Window | typeof globalThis = globalThis): void {
  (target as Window).createControllerSubmitApi = createControllerSubmitApi;
}

installControllerSubmitApiGlobals(typeof window !== "undefined" ? window : globalThis);
