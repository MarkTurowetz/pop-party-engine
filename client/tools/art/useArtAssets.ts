import { useSyncExternalStore } from "react";
import type { ArtAssetsController, ArtAssetsEditorState } from "./artAssetsController";

export function useArtAssets(controller: ArtAssetsController): ArtAssetsEditorState {
  return useSyncExternalStore(controller.subscribe, controller.getState, controller.getState);
}
