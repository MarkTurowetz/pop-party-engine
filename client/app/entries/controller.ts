import { legacyScriptsForRole } from "../legacy/script-manifest";
import { createRuntimeContext } from "../context/createRuntimeContext";
import { bootLegacySurface } from "../legacy/loadLegacySurface";
// Ported runtime modules install their window bridges at import time, before the
// legacy scripts boot, so legacy consumers still resolve the globals.
import "../../runtime/textFit";
import "../../runtime/visualObject";

export const legacyControllerScripts = legacyScriptsForRole("controller");
export const controllerContext = createRuntimeContext({ surface: "controller" });

void bootLegacySurface("controller");
