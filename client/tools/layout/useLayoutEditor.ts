import { useSyncExternalStore } from "react";
import type { LayoutController, LayoutEditorState } from "./layoutController";

export function useLayoutEditor(controller: LayoutController): LayoutEditorState {
  return useSyncExternalStore(controller.subscribe, controller.getState, controller.getState);
}
