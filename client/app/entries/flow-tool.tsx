import { legacyScriptsForRole } from "../legacy/script-manifest";
import { createToolAppContext } from "../context/createToolAppContext";
import { installToolContextAdapter } from "../context/toolContextAdapter";
import { bootLegacySurface } from "../legacy/loadLegacySurface";
import { mountFlowToolApp } from "../../tools/flow/mountFlowToolApp";
import { installFlowAdapters } from "../../tools/flow/installFlowAdapters";

export const legacyFlowToolScripts = legacyScriptsForRole("flow");
export const flowToolContext = createToolAppContext({ surface: "flow" });

installToolContextAdapter(flowToolContext);
installFlowAdapters();
mountFlowToolApp({ surface: flowToolContext.surface });

void bootLegacySurface("flow", {
  excludeScripts: ["/client/flow/action-defaults.js", "/client/flow/action-options.js", "/client/flow/action-summary.js"]
});
