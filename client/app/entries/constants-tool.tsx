import { legacyScriptsForRole } from "../legacy/script-manifest";
import { createToolAppContext } from "../context/createToolAppContext";
import { bootLegacySurface } from "../legacy/loadLegacySurface";
import { mountConstantsToolApp } from "../../tools/constants/mountConstantsToolApp";

export const legacyConstantsToolScripts = legacyScriptsForRole("constants");
export const constantsToolContext = createToolAppContext({ surface: "constants" });

mountConstantsToolApp({ surface: constantsToolContext.surface });

void bootLegacySurface("constants");
