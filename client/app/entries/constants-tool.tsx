import { createToolAppContext } from "../context/createToolAppContext";
import { mountConstantsEditor } from "../../tools/constants/mountConstantsEditor";

// The /constants route is now React-only: no legacy scripts, no bridge.
export const constantsToolContext = createToolAppContext({ surface: "constants" });

void mountConstantsEditor({ api: constantsToolContext.api.constants, surface: constantsToolContext.surface });
