import { legacyScriptsForRole } from "../legacy/script-manifest";
import { createToolAppContext } from "../context/createToolAppContext";
import { bootLegacySurface } from "../legacy/loadLegacySurface";
import { mountHostAudioToolApp } from "../../tools/host-audio/mountHostAudioToolApp";

export const legacyHostAudioToolScripts = legacyScriptsForRole("host-audio");
export const hostAudioToolContext = createToolAppContext({ surface: "host-audio" });

mountHostAudioToolApp({ surface: hostAudioToolContext.surface });

void bootLegacySurface("host-audio");
