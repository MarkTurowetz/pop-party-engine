import { legacyScriptsForRole } from "../legacy/script-manifest";
import { createToolAppContext } from "../context/createToolAppContext";

export const legacyArtToolScripts = legacyScriptsForRole("art");
export const artToolContext = createToolAppContext({ surface: "art" });
