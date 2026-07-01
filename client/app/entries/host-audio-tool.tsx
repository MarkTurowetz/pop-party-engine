import { createToolAppContext } from "../context/createToolAppContext";
import { mountHostAudioEditor } from "../../tools/host-audio/mountHostAudioEditor";

// The /host-audio route is now React-only: no legacy scripts, no bridge.
export const hostAudioToolContext = createToolAppContext({ surface: "host-audio" });

void mountHostAudioEditor({
  api: hostAudioToolContext.api.hostAudio,
  draftApi: hostAudioToolContext.api.drafts,
  surface: hostAudioToolContext.surface
});
