import { legacyScriptsForRole } from "../legacy/script-manifest";
import { createToolAppContext } from "../context/createToolAppContext";

export const legacyToolsScripts = legacyScriptsForRole("tools");
export const toolsContext = createToolAppContext({ surface: "tools" });
