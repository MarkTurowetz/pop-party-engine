import { legacyScriptsForRole } from "../legacy/script-manifest";
import { createToolAppContext } from "../context/createToolAppContext";
import { bootLegacySurface } from "../legacy/loadLegacySurface";

export const legacyConstantsToolScripts = legacyScriptsForRole("constants");
export const constantsToolContext = createToolAppContext({ surface: "constants" });

void bootLegacySurface("constants");
