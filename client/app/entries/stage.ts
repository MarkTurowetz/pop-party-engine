import { legacyScriptsForRole } from "../legacy/script-manifest";
import { createRuntimeContext } from "../context/createRuntimeContext";
import { bootLegacySurface } from "../legacy/loadLegacySurface";
// Ported runtime modules install their window bridges at import time, before the
// legacy scripts boot, so legacy consumers still resolve the globals.
import "../../runtime/utils";
import "../../runtime/layoutGameObjectRuntime";
import "../../runtime/textFit";
import "../../runtime/stageTextRenderer";
// layoutRuntime re-assigns window.PartyGameTextFit (its own layout text-fit) and must
// load AFTER textFit so its fittedLayoutTextSize wins, matching the legacy load order.
import "../../runtime/layoutRuntime";
// The stage orchestrator (defines setupStage, dispatched by app-shell) — loads last.
import "../../runtime/stageRuntime";
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

export const legacyStageScripts = legacyScriptsForRole("stage");
export const stageContext = createRuntimeContext({ surface: "stage" });

void bootLegacySurface("stage");
