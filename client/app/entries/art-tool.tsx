import { legacyScriptsForRole } from "../legacy/script-manifest";
import { createToolAppContext } from "../context/createToolAppContext";
import { bootLegacySurface } from "../legacy/loadLegacySurface";
import { mountArtToolApp } from "../../tools/art/mountArtToolApp";

export const legacyArtToolScripts = legacyScriptsForRole("art");
export const artToolContext = createToolAppContext({ surface: "art" });

mountArtToolApp({ surface: artToolContext.surface });

void bootLegacySurface("art");
