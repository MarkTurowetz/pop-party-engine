import { legacyScriptsForRole } from "../legacy/script-manifest";
import { createToolAppContext } from "../context/createToolAppContext";
import { installToolContextAdapter } from "../context/toolContextAdapter";
import { bootLegacySurface } from "../legacy/loadLegacySurface";
import { installFlowActionsAdapter } from "../../tools/flow/flowActionsAdapter";
import { installFlowDecisionAdapter } from "../../tools/flow/flowDecisionAdapter";
import { installFlowMutationsAdapter } from "../../tools/flow/flowMutationsAdapter";
import { installFlowSerializationAdapter } from "../../tools/flow/flowSerializationAdapter";
import { installFlowSelectorsAdapter } from "../../tools/flow/flowSelectorsAdapter";

export const legacyFlowToolScripts = legacyScriptsForRole("flow");
export const flowToolContext = createToolAppContext({ surface: "flow" });

installToolContextAdapter(flowToolContext);
installFlowActionsAdapter();
installFlowDecisionAdapter();
installFlowMutationsAdapter();
installFlowSerializationAdapter();
installFlowSelectorsAdapter();

void bootLegacySurface("flow");
