import { legacyScriptsForRole } from "../legacy/script-manifest";
import { createToolAppContext } from "../context/createToolAppContext";
import { bootLegacySurface } from "../legacy/loadLegacySurface";
import { installFlowSerializationAdapter } from "../../tools/flow/flowSerializationAdapter";

export const legacyToolsScripts = legacyScriptsForRole("tools");
export const toolsContext = createToolAppContext({ surface: "tools" });

installFlowSerializationAdapter();

void bootLegacySurface("tools");
