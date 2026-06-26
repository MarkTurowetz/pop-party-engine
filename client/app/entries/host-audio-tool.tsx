import { legacyScriptsForRole } from "../legacy/script-manifest";
import { createToolAppContext } from "../context/createToolAppContext";
import { bootLegacySurface } from "../legacy/loadLegacySurface";

export const legacyHostAudioToolScripts = legacyScriptsForRole("host-audio");
export const hostAudioToolContext = createToolAppContext({ surface: "host-audio" });

void bootLegacySurface("host-audio");
