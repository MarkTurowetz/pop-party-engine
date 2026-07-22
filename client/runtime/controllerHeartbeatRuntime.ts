export {
  createControllerHeartbeatRuntime,
  type ControllerHeartbeatOptions,
  type ControllerHeartbeatRuntime
} from "@pop-party/engine/client";

import { createControllerHeartbeatRuntime } from "@pop-party/engine/client";

declare global {
  interface Window {
    createControllerHeartbeatRuntime?: typeof createControllerHeartbeatRuntime;
  }
}

export function installControllerHeartbeatGlobals(target: Window | typeof globalThis = globalThis): void {
  (target as Window).createControllerHeartbeatRuntime = createControllerHeartbeatRuntime;
}

installControllerHeartbeatGlobals(typeof window !== "undefined" ? window : globalThis);
