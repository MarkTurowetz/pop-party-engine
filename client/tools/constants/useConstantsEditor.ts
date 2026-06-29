import { useSyncExternalStore } from "react";
import type { ConstantsController, ConstantsEditorState } from "./constantsController";

export function useConstantsEditor(controller: ConstantsController): ConstantsEditorState {
  return useSyncExternalStore(controller.subscribe, controller.getState, controller.getState);
}
