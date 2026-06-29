import { legacyScriptsForRole } from "../legacy/script-manifest";
import { createRuntimeContext } from "../context/createRuntimeContext";
import { bootLegacySurface } from "../legacy/loadLegacySurface";
// Ported runtime modules install their window bridges at import time, before the
// legacy scripts boot, so legacy consumers still resolve the globals.
import "../../runtime/utils";
import "../../runtime/textFit";
import "../../runtime/stageTextRenderer";
import "../../runtime/visualObject";
import "../../runtime/gameObject";
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

export const legacyControllerScripts = legacyScriptsForRole("controller");
export const controllerContext = createRuntimeContext({ surface: "controller" });

void bootLegacySurface("controller");
