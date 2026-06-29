import {
  legacyScriptsForRole,
  legacyFlowScripts,
  legacyConstantsScripts,
  legacyHostAudioScripts,
  legacyArtScripts,
  legacyLayoutScripts
} from "../legacy/script-manifest";
import { createToolAppContext } from "../context/createToolAppContext";
import { installToolContextAdapter } from "../context/toolContextAdapter";
import { bootLegacySurface } from "../legacy/loadLegacySurface";
// Ported runtime modules install their window bridges before the legacy stage/
// controller runtime scripts boot on /tools.
import "../../runtime/textFit";
import "../../runtime/visualObject";
import "../../runtime/qrCode";
import { mountFlowEditor } from "../../tools/flow/mountFlowEditor";
import type { FlowEditorController } from "../../tools/flow/flowEditorController";
import { mountConstantsEditor } from "../../tools/constants/mountConstantsEditor";
import type { ConstantsController } from "../../tools/constants/constantsController";
import { mountHostAudioEditor } from "../../tools/host-audio/mountHostAudioEditor";
import type { HostAudioController } from "../../tools/host-audio/hostAudioController";
import { mountArtEditor } from "../../tools/art/mountArtEditor";
import type { MountedArtEditor } from "../../tools/art/mountArtEditor";
import { mountLayoutEditor } from "../../tools/layout/mountLayoutEditor";
import type { MountedLayoutEditor } from "../../tools/layout/mountLayoutEditor";

// The legacy tool dashboard (tool-dashboard.js) drives the flow tab through three
// global hooks that used to live in flow-tool.js. Flow is React now, so we shim
// them to route into the React editor: setup reveals the screen, save/dirty defer
// to the controller. This bridge goes away when /tools itself becomes React (Phase 2).
declare global {
  interface Window {
    setupFlowTool?: () => void;
    saveGameFlow?: () => Promise<unknown>;
    isFlowDirty?: () => boolean;
    // Constants dashboard hooks. isDirty inlines these two vars; we encode the
    // React controller's dirty flag into them (non-empty gameConstants vs "{}").
    setupConstantsTool?: () => void;
    saveGameConstants?: () => Promise<unknown>;
    gameConstants?: unknown;
    constantsSavedSnapshot?: string;
    setupHostAudioTool?: () => void;
    saveHostAudios?: () => Promise<unknown>;
    isHostAudiosDirty?: () => boolean;
    setupArtTool?: () => void;
    pendingArtReplacement?: unknown;
    isArtCompositionsDirty?: () => boolean;
    isArtOrganizationDirty?: () => boolean;
    saveArtReplacement?: () => Promise<unknown>;
    saveArtCompositions?: () => Promise<unknown>;
    saveArtOrganization?: () => Promise<unknown>;
    setupLayoutTool?: (mode?: string) => void;
    isLayoutDirty?: () => boolean;
    isControllerLayoutDirty?: () => boolean;
    saveStageLayouts?: () => Promise<unknown>;
    saveControllerLayouts?: () => Promise<unknown>;
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

let constantsController: ConstantsController | null = null;
void mountConstantsEditor({ api: toolsContext.api.constants, surface: toolsContext.surface, revealScreen: false }).then(
  (mounted) => {
    constantsController = mounted.controller;
    const syncDirty = () => {
      window.gameConstants = mounted.controller.getState().dirty ? { __dirty: true } : {};
      window.constantsSavedSnapshot = "{}";
    };
    mounted.controller.subscribe(syncDirty);
    syncDirty();
  }
);
window.setupConstantsTool = () => {
  document.querySelector("#constantsScreen")?.classList.remove("hidden");
};
window.saveGameConstants = () => (constantsController ? constantsController.save() : Promise.resolve());
window.gameConstants = {};
window.constantsSavedSnapshot = "{}";

let hostAudioController: HostAudioController | null = null;
void mountHostAudioEditor({ api: toolsContext.api.hostAudio, surface: toolsContext.surface, revealScreen: false }).then(
  (mounted) => {
    hostAudioController = mounted.controller;
  }
);
window.setupHostAudioTool = () => {
  document.querySelector("#hostAudioScreen")?.classList.remove("hidden");
};
window.saveHostAudios = () => (hostAudioController ? hostAudioController.save() : Promise.resolve());
window.isHostAudiosDirty = () => (hostAudioController ? hostAudioController.getState().dirty : false);

let artEditor: MountedArtEditor | null = null;
void mountArtEditor({ api: toolsContext.api.art, surface: toolsContext.surface, revealScreen: false }).then((mounted) => {
  artEditor = mounted;
  const syncReplacement = () => {
    window.pendingArtReplacement = mounted.assetsController.getState().dirty ? { __dirty: true } : null;
  };
  mounted.assetsController.subscribe(syncReplacement);
  syncReplacement();
});
window.setupArtTool = () => {
  document.querySelector("#artScreen")?.classList.remove("hidden");
};
window.pendingArtReplacement = null;
window.isArtCompositionsDirty = () => (artEditor ? artEditor.compositionsController.getState().dirty : false);
window.isArtOrganizationDirty = () => (artEditor ? artEditor.organizationController.getState().dirty : false);
window.saveArtReplacement = () => (artEditor ? artEditor.assetsController.save() : Promise.resolve());
window.saveArtCompositions = () => (artEditor ? artEditor.compositionsController.save() : Promise.resolve());
window.saveArtOrganization = () => (artEditor ? artEditor.organizationController.save() : Promise.resolve());

let layoutEditor: MountedLayoutEditor | null = null;
void mountLayoutEditor({ api: toolsContext.api.layout, surface: toolsContext.surface, revealScreen: false }).then(
  (mounted) => {
    layoutEditor = mounted;
  }
);
window.setupLayoutTool = () => {
  document.querySelector("#layoutScreen")?.classList.remove("hidden");
};
window.isLayoutDirty = () => (layoutEditor ? layoutEditor.stageController.getState().dirty : false);
window.isControllerLayoutDirty = () => (layoutEditor ? layoutEditor.controllerController.getState().dirty : false);
window.saveStageLayouts = () => (layoutEditor ? layoutEditor.stageController.save() : Promise.resolve());
window.saveControllerLayouts = () => (layoutEditor ? layoutEditor.controllerController.save() : Promise.resolve());

// All five tools are React now — exclude every tool's legacy scripts.
void bootLegacySurface("tools", {
  excludeScripts: [
    ...legacyFlowScripts,
    ...legacyConstantsScripts,
    ...legacyHostAudioScripts,
    ...legacyArtScripts,
    ...legacyLayoutScripts
  ]
});
