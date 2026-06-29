import { useSyncExternalStore } from "react";
import type { ArtOrganizationController, ArtOrganizationEditorState } from "./artOrganizationController";

export function useArtOrganization(controller: ArtOrganizationController): ArtOrganizationEditorState {
  return useSyncExternalStore(controller.subscribe, controller.getState, controller.getState);
}
