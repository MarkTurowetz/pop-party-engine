import { legacyScriptsForRole } from "../legacy/script-manifest";
import { createToolAppContext } from "../context/createToolAppContext";
import { installToolContextAdapter } from "../context/toolContextAdapter";
import { bootLegacySurface } from "../legacy/loadLegacySurface";
import { mountFlowToolApp } from "../../tools/flow/mountFlowToolApp";
import { mountFlowEditor } from "../../tools/flow/mountFlowEditor";
import { installFlowAdapters } from "../../tools/flow/installFlowAdapters";

export const legacyFlowToolScripts = legacyScriptsForRole("flow");
export const flowToolContext = createToolAppContext({ surface: "flow" });

installToolContextAdapter(flowToolContext);

const reactFlowPreview = new URLSearchParams(window.location.search).get("reactFlowPreview") || "";

if (reactFlowPreview === "replace") {
  // React-only path: own the surface end to end, no legacy scripts loaded.
  void mountFlowEditor({ api: flowToolContext.api.flow, surface: flowToolContext.surface });
} else {
  // Legacy bridge path (default + overlay preview) until React-only is the default.
  installFlowAdapters();
  mountFlowToolApp({ surface: flowToolContext.surface });
  void bootLegacySurface("flow", {
    excludeScripts: [
      "/client/flow/action-defaults.js",
      "/client/flow/action-options.js",
      "/client/flow/action-summary.js"
    ]
  });
}
