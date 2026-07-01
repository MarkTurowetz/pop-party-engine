import { createToolAppContext } from "../context/createToolAppContext";
import { installToolContextAdapter } from "../context/toolContextAdapter";
import { mountFlowEditor } from "../../tools/flow/mountFlowEditor";

// The /flow route is now React-only: no legacy scripts, no window.PartyGame* bridge.
export const flowToolContext = createToolAppContext({ surface: "flow" });

installToolContextAdapter(flowToolContext);
void mountFlowEditor({
  api: flowToolContext.api.flow,
  layoutApi: flowToolContext.api.layout,
  surface: flowToolContext.surface
});
