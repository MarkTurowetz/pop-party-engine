import { legacyScriptsForRole } from "../legacy/script-manifest";
import { createToolAppContext } from "../context/createToolAppContext";
import { installToolContextAdapter } from "../context/toolContextAdapter";
import { bootLegacySurface } from "../legacy/loadLegacySurface";
import { installFlowAdapters } from "../../tools/flow/installFlowAdapters";

export const legacyFlowToolScripts = legacyScriptsForRole("flow");
export const flowToolContext = createToolAppContext({ surface: "flow" });

installToolContextAdapter(flowToolContext);
installFlowAdapters();

void bootLegacySurface("flow", {
  excludeScripts: ["/client/flow/action-options.js"]
});
