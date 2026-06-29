import { useSyncExternalStore } from "react";
import type { FlowEditorController, FlowEditorState } from "./flowEditorController";

/**
 * Subscribe a React component to a {@link FlowEditorController}. The controller is
 * the single source of truth; this hook only mirrors its snapshot into render.
 */
export function useFlowEditor(controller: FlowEditorController): FlowEditorState {
  return useSyncExternalStore(controller.subscribe, controller.getState, controller.getState);
}
