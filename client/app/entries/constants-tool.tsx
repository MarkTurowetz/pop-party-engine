import { legacyScriptsForRole } from "../legacy/script-manifest";
import { createToolAppContext } from "../context/createToolAppContext";

export const legacyConstantsToolScripts = legacyScriptsForRole("constants");
export const constantsToolContext = createToolAppContext({ surface: "constants" });
