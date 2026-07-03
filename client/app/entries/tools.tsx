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
import "../../runtime/utils";
import "../../runtime/layoutGameObjectRuntime";
import "../../runtime/textFit";
import "../../runtime/stageTextRenderer";
// layoutRuntime re-assigns window.PartyGameTextFit and must load AFTER textFit.
import "../../runtime/layoutRuntime";
import "../../runtime/stageRuntime";
// The /tools dashboard tab router (defines setupToolDashboard, dispatched by app-shell).
import { registerDashboardTool, showDashboardTool } from "../../runtime/toolDashboard";
import "../../runtime/visualObject";
import "../../runtime/gameObject";
import "../../runtime/qrCode";
import "../../runtime/stageDebugPanel";
import "../../runtime/stageWidgetBindings";
import "../../runtime/stageRenderOrchestrator";
import "../../runtime/stageActionRunners";
import "../../runtime/stageArtObjectVisuals";
import "../../runtime/stageVisualControllers";
import "../../runtime/stageWidgetArtRenderer";
import "../../runtime/stageWipeController";
import "../../runtime/stagePlayerRoster";
import "../../runtime/stageVotingCardVisuals";
import "../../runtime/controllerModuleCache";
import "../../runtime/controllerViewState";
import "../../runtime/controllerTextRenderer";
import "../../runtime/controllerHeartbeatRuntime";
import "../../runtime/controllerSubmitApi";
import "../../runtime/controllerAvatarView";
import "../../runtime/controllerChoiceInputView";
import "../../runtime/controllerTextInputView";
import "../../runtime/controllerRecordingLifecycle";
import "../../runtime/controllerVoiceInput";
import "../../runtime/controllerMicrophoneAccessView";
import "../../runtime/controllerLobbyView";
import "../../runtime/controllerGlobalActionView";
import "../../runtime/controllerSessionRuntime";
import "../../runtime/controllerStateRuntime";
import "../../runtime/controllerSetupBindings";
import "../../runtime/controllerActionBindings";
import "../../runtime/controller";
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

// The TS tool dashboard (toolDashboard.ts) drives the tabs via registerDashboardTool:
// each tool registers its dirty/save/setup, routed into its React controller. This
// replaced the old window.setupFlowTool/saveGameFlow/isFlowDirty/… shim globals.
const revealScreen = (id: string) => () => document.querySelector(`#${id}`)?.classList.remove("hidden");
const initialToolParams = new URLSearchParams(window.location.search);
const initialArtCompositionId = initialToolParams.get("tool") === "art" ? initialToolParams.get("composition") || undefined : undefined;

export const legacyToolsScripts = legacyScriptsForRole("tools");
export const toolsContext = createToolAppContext({ surface: "tools" });

installToolContextAdapter(toolsContext);

let flowController: FlowEditorController | null = null;
void mountFlowEditor({
  api: toolsContext.api.flow,
  draftApi: toolsContext.api.drafts,
  layoutApi: toolsContext.api.layout,
  surface: toolsContext.surface,
  revealScreen: false
}).then((mounted) => {
  flowController = mounted.controller;
});
registerDashboardTool("flow", {
  isDirty: () => flowController?.getState().dirty ?? false,
  save: () => flowController?.save() ?? Promise.resolve(),
  setup: revealScreen("flowScreen")
});

let constantsController: ConstantsController | null = null;
void mountConstantsEditor({
  api: toolsContext.api.constants,
  draftApi: toolsContext.api.drafts,
  surface: toolsContext.surface,
  revealScreen: false
}).then((mounted) => {
  constantsController = mounted.controller;
});
registerDashboardTool("constants", {
  isDirty: () => constantsController?.getState().dirty ?? false,
  save: () => constantsController?.save() ?? Promise.resolve(),
  setup: revealScreen("constantsScreen")
});

let hostAudioController: HostAudioController | null = null;
void mountHostAudioEditor({
  api: toolsContext.api.hostAudio,
  draftApi: toolsContext.api.drafts,
  surface: toolsContext.surface,
  revealScreen: false
}).then((mounted) => {
  hostAudioController = mounted.controller;
});
registerDashboardTool("host-audio", {
  isDirty: () => hostAudioController?.getState().dirty ?? false,
  save: () => hostAudioController?.save() ?? Promise.resolve(),
  setup: revealScreen("hostAudioScreen")
});

let artEditor: MountedArtEditor | null = null;
let pendingArtCompositionId = "";
const selectArtComposition = (compositionId: string): boolean => {
  if (!artEditor) return false;
  const compositions = artEditor.compositionsController.getState().compositions;
  if (!compositions.some((composition) => composition.id === compositionId)) return false;
  artEditor.compositionsController.selectComposition(compositionId);
  return true;
};
const openArtComposition = (compositionId: string) => {
  pendingArtCompositionId = compositionId;
  void showDashboardTool("art");
  if (selectArtComposition(compositionId)) pendingArtCompositionId = "";
};
void mountArtEditor({
  api: toolsContext.api.art,
  draftApi: toolsContext.api.drafts,
  initialCompositionId: initialArtCompositionId,
  surface: toolsContext.surface,
  revealScreen: false
}).then((mounted) => {
  artEditor = mounted;
  if (pendingArtCompositionId && selectArtComposition(pendingArtCompositionId)) pendingArtCompositionId = "";
});
registerDashboardTool("art", {
  isDirty: () =>
    Boolean(
      artEditor &&
        (artEditor.assetsController.getState().dirty ||
          artEditor.compositionsController.getState().dirty ||
          artEditor.organizationController.getState().dirty)
    ),
  save: async () => {
    if (!artEditor) return;
    if (artEditor.assetsController.getState().dirty) await artEditor.assetsController.save();
    if (artEditor.compositionsController.getState().dirty) await artEditor.compositionsController.save();
    if (artEditor.organizationController.getState().dirty) await artEditor.organizationController.save();
  },
  setup: revealScreen("artScreen")
});

let layoutEditor: MountedLayoutEditor | null = null;
void mountLayoutEditor({
  api: toolsContext.api.layout,
  artApi: toolsContext.api.art,
  draftApi: toolsContext.api.drafts,
  onOpenArtComposition: openArtComposition,
  surface: toolsContext.surface,
  revealScreen: false
}).then((mounted) => {
  layoutEditor = mounted;
});
registerDashboardTool("layout", {
  isDirty: () => layoutEditor?.stageController.getState().dirty ?? false,
  save: () => layoutEditor?.stageController.save() ?? Promise.resolve(),
  setup: revealScreen("layoutScreen")
});
registerDashboardTool("controller-layout", {
  isDirty: () => layoutEditor?.controllerController.getState().dirty ?? false,
  save: () => layoutEditor?.controllerController.save() ?? Promise.resolve(),
  setup: revealScreen("layoutScreen")
});

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
