import { legacyScriptsForRole } from "../legacy/script-manifest";
import { createToolAppContext } from "../context/createToolAppContext";
import { bootLegacySurface } from "../legacy/loadLegacySurface";
import { mountLayoutToolApp } from "../../tools/layout/mountLayoutToolApp";

export const legacyLayoutToolScripts = legacyScriptsForRole("layout");
export const layoutToolContext = createToolAppContext({ surface: "layout" });

mountLayoutToolApp({ surface: layoutToolContext.surface });

void bootLegacySurface("layout");
