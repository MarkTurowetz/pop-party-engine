import { legacyScriptsForRole } from "../legacy/script-manifest";
import { createRuntimeContext } from "../context/createRuntimeContext";

export const legacyControllerScripts = legacyScriptsForRole("controller");
export const controllerContext = createRuntimeContext({ surface: "controller" });
