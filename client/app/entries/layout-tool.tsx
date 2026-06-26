import { legacyScriptsForRole } from "../legacy/script-manifest";
import { createToolAppContext } from "../context/createToolAppContext";

export const legacyLayoutToolScripts = legacyScriptsForRole("layout");
export const layoutToolContext = createToolAppContext({ surface: "layout" });
