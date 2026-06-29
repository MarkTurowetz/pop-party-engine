import { legacyScriptsForRole, legacyFlowScripts } from "../legacy/script-manifest";
import { createToolAppContext } from "../context/createToolAppContext";
import { installToolContextAdapter } from "../context/toolContextAdapter";
import { bootLegacySurface } from "../legacy/loadLegacySurface";
import { mountFlowEditor } from "../../tools/flow/mountFlowEditor";
import type { FlowEditorController } from "../../tools/flow/flowEditorController";
import { mountLayoutToolApp } from "../../tools/layout/mountLayoutToolApp";
import { mountConstantsToolApp } from "../../tools/constants/mountConstantsToolApp";
import { mountHostAudioToolApp } from "../../tools/host-audio/mountHostAudioToolApp";
import { mountArtToolApp } from "../../tools/art/mountArtToolApp";

// The legacy tool dashboard (tool-dashboard.js) drives the flow tab through three
// global hooks that used to live in flow-tool.js. Flow is React now, so we shim
// them to route into the React editor: setup reveals the screen, save/dirty defer
// to the controller. This bridge goes away when /tools itself becomes React (Phase 2).
declare global {
  interface Window {
    setupFlowTool?: () => void;
    saveGameFlow?: () => Promise<unknown>;
    isFlowDirty?: () => boolean;
  }
}

export const legacyToolsScripts = legacyScriptsForRole("tools");
export const toolsContext = createToolAppContext({ surface: "tools" });

installToolContextAdapter(toolsContext);

let flowController: FlowEditorController | null = null;
void mountFlowEditor({ api: toolsContext.api.flow, surface: toolsContext.surface, revealScreen: false }).then(
  (mounted) => {
    flowController = mounted.controller;
  }
);

window.setupFlowTool = () => {
  document.querySelector("#flowScreen")?.classList.remove("hidden");
};
window.saveGameFlow = () => (flowController ? flowController.save() : Promise.resolve());
window.isFlowDirty = () => (flowController ? flowController.getState().dirty : false);

mountLayoutToolApp({ surface: toolsContext.surface });
mountConstantsToolApp({ surface: toolsContext.surface });
mountHostAudioToolApp({ surface: toolsContext.surface });
mountArtToolApp({ surface: toolsContext.surface });

// Load the other tools' legacy scripts, but none of the flow-tool scripts.
void bootLegacySurface("tools", {
  excludeScripts: legacyFlowScripts
});
