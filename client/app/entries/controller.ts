import { legacyScriptsForRole } from "../legacy/script-manifest";
import { createRuntimeContext } from "../context/createRuntimeContext";
import { bootLegacySurface } from "../legacy/loadLegacySurface";

export const legacyControllerScripts = legacyScriptsForRole("controller");
export const controllerContext = createRuntimeContext({ surface: "controller" });

void bootLegacySurface("controller");
