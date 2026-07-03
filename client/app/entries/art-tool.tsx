import { createToolAppContext } from "../context/createToolAppContext";
import { mountArtEditor } from "../../tools/art/mountArtEditor";

// The /art route is now React-only: no legacy scripts, no bridge.
export const artToolContext = createToolAppContext({ surface: "art" });
const initialCompositionId = new URLSearchParams(window.location.search).get("composition") || undefined;

void mountArtEditor({
  api: artToolContext.api.art,
  draftApi: artToolContext.api.drafts,
  initialCompositionId,
  surface: artToolContext.surface
});
