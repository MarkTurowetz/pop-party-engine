import { legacyScriptsForRole } from "../legacy/script-manifest";
import { createToolAppContext } from "../context/createToolAppContext";
import { bootLegacySurface } from "../legacy/loadLegacySurface";
import { installFlowSerializationAdapter } from "../../tools/flow/flowSerializationAdapter";
import { installFlowSelectorsAdapter } from "../../tools/flow/flowSelectorsAdapter";

export const legacyFlowToolScripts = legacyScriptsForRole("flow");
export const flowToolContext = createToolAppContext({ surface: "flow" });

installFlowSerializationAdapter();
installFlowSelectorsAdapter();

void bootLegacySurface("flow");
