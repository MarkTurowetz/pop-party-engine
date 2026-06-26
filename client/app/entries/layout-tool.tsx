import { legacyScriptsForRole } from "../legacy/script-manifest";
import { createToolAppContext } from "../context/createToolAppContext";
import { bootLegacySurface } from "../legacy/loadLegacySurface";

export const legacyLayoutToolScripts = legacyScriptsForRole("layout");
export const layoutToolContext = createToolAppContext({ surface: "layout" });

void bootLegacySurface("layout");
