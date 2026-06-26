import { legacyScriptsForRole } from "../legacy/script-manifest";
import { createToolAppContext } from "../context/createToolAppContext";

export const legacyHostAudioToolScripts = legacyScriptsForRole("host-audio");
export const hostAudioToolContext = createToolAppContext({ surface: "host-audio" });
