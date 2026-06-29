import { useSyncExternalStore } from "react";
import type { HostAudioController, HostAudioEditorState } from "./hostAudioController";

export function useHostAudioEditor(controller: HostAudioController): HostAudioEditorState {
  return useSyncExternalStore(controller.subscribe, controller.getState, controller.getState);
}
