import { legacyScriptsForRole } from "../legacy/script-manifest";
import { createToolAppContext } from "../context/createToolAppContext";
import { installToolContextAdapter } from "../context/toolContextAdapter";
import { bootLegacySurface } from "../legacy/loadLegacySurface";
import { mountFlowToolApp } from "../../tools/flow/mountFlowToolApp";
import { installFlowAdapters } from "../../tools/flow/installFlowAdapters";

export const legacyToolsScripts = legacyScriptsForRole("tools");
export const toolsContext = createToolAppContext({ surface: "tools" });

installToolContextAdapter(toolsContext);
installFlowAdapters();
mountFlowToolApp({ surface: toolsContext.surface });

void bootLegacySurface("tools", {
  excludeScripts: ["/client/flow/action-defaults.js", "/client/flow/action-options.js", "/client/flow/action-summary.js"]
});
