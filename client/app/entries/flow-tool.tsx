import { legacyScriptsForRole } from "../legacy/script-manifest";
import { createToolAppContext } from "../context/createToolAppContext";

export const legacyFlowToolScripts = legacyScriptsForRole("flow");
export const flowToolContext = createToolAppContext({ surface: "flow" });
