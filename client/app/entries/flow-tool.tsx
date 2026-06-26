import { legacyScriptsForRole } from "../legacy/script-manifest";
import { createToolAppContext } from "../context/createToolAppContext";
import { bootLegacySurface } from "../legacy/loadLegacySurface";
import { installFlowActionsAdapter } from "../../tools/flow/flowActionsAdapter";
import { installFlowMutationsAdapter } from "../../tools/flow/flowMutationsAdapter";
import { installFlowSerializationAdapter } from "../../tools/flow/flowSerializationAdapter";
import { installFlowSelectorsAdapter } from "../../tools/flow/flowSelectorsAdapter";

export const legacyFlowToolScripts = legacyScriptsForRole("flow");
export const flowToolContext = createToolAppContext({ surface: "flow" });

installFlowActionsAdapter();
installFlowMutationsAdapter();
installFlowSerializationAdapter();
installFlowSelectorsAdapter();

void bootLegacySurface("flow");
