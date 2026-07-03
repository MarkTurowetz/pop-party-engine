import { createToolAppContext } from "../context/createToolAppContext";
import { mountLayoutEditor } from "../../tools/layout/mountLayoutEditor";

// The /layout route is now React-only: no legacy scripts, no bridge.
export const layoutToolContext = createToolAppContext({ surface: "layout" });

void mountLayoutEditor({
  api: layoutToolContext.api.layout,
  artApi: layoutToolContext.api.art,
  draftApi: layoutToolContext.api.drafts,
  onOpenArtComposition: (compositionId) => {
    const url = new URL("/art", window.location.origin);
    url.searchParams.set("composition", compositionId);
    window.location.href = url.toString();
  },
  surface: layoutToolContext.surface
});
