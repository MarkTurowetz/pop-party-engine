import { legacyScriptsForRole } from "../legacy/script-manifest";
import { createToolAppContext } from "../context/createToolAppContext";
import { bootLegacySurface } from "../legacy/loadLegacySurface";

export const legacyArtToolScripts = legacyScriptsForRole("art");
export const artToolContext = createToolAppContext({ surface: "art" });

void bootLegacySurface("art");
