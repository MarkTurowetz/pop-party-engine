import { legacyScriptsForRole } from "../legacy/script-manifest";
import { createToolAppContext } from "../context/createToolAppContext";
import { bootLegacySurface } from "../legacy/loadLegacySurface";
import { installFlowSerializationAdapter } from "../../tools/flow/flowSerializationAdapter";

export const legacyFlowToolScripts = legacyScriptsForRole("flow");
export const flowToolContext = createToolAppContext({ surface: "flow" });

installFlowSerializationAdapter();

void bootLegacySurface("flow");
