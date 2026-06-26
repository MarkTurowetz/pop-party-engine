import { legacyScriptsForRole } from "../legacy/script-manifest";
import { createRuntimeContext } from "../context/createRuntimeContext";

export const legacyStageScripts = legacyScriptsForRole("stage");
export const stageContext = createRuntimeContext({ surface: "stage" });
