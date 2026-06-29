import { useSyncExternalStore } from "react";
import type { ArtCompositionsController, ArtCompositionsEditorState } from "./artCompositionsController";

export function useArtCompositions(controller: ArtCompositionsController): ArtCompositionsEditorState {
  return useSyncExternalStore(controller.subscribe, controller.getState, controller.getState);
}
