import { createToolAppContext } from "../context/createToolAppContext";
import { mountArtEditor } from "../../tools/art/mountArtEditor";

// The /art route is now React-only: no legacy scripts, no bridge.
export const artToolContext = createToolAppContext({ surface: "art" });

void mountArtEditor({ api: artToolContext.api.art, surface: artToolContext.surface });
