import { legacyScriptsForRole } from "../legacy/script-manifest";
import { createRuntimeContext } from "../context/createRuntimeContext";
import { bootLegacySurface } from "../legacy/loadLegacySurface";

export const legacyStageScripts = legacyScriptsForRole("stage");
export const stageContext = createRuntimeContext({ surface: "stage" });

void bootLegacySurface("stage");
