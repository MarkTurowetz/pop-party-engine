import { createToolAppContext } from "../context/createToolAppContext";
import { mountLayoutEditor } from "../../tools/layout/mountLayoutEditor";

// The /layout route is now React-only: no legacy scripts, no bridge.
export const layoutToolContext = createToolAppContext({ surface: "layout" });

void mountLayoutEditor({
  api: layoutToolContext.api.layout,
  draftApi: layoutToolContext.api.drafts,
  surface: layoutToolContext.surface
});
