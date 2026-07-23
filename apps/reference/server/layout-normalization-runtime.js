"use strict";

const {
  createLayoutNormalizationRuntime: createEngineLayoutNormalizationRuntime
} = require("../../../packages/engine/src/server/layout-normalization-runtime");
const {
  stageLayoutWidgetArtCompositionId
} = require("../../../shared/stage-layout-art-widgets");
const {
  controllerLayoutWidgetArtCompositionId
} = require("../../../shared/controller-layout-art-widgets");
const {
  isLayoutTextArtElementId,
  isLayoutTextArtSelector
} = require("../../../shared/layout-text-art");

function createLayoutNormalizationRuntime(options = {}) {
  const semanticRoles = options.semanticRoles || {};
  const semanticCompositionId = (role) => String(semanticRoles[role]?.compositionId || "");
  const semanticLayoutTextCompositionId = semanticCompositionId("engine.stage.layoutText");
  if (!semanticLayoutTextCompositionId) throw new Error("Layout normalization requires engine.stage.layoutText");
  const stageRoleByElementId = {
    stagecodepanel: "engine.stage.roomCodePanel",
    stagecodebadge: "engine.stage.roomCode",
    stagejoinqr: "engine.stage.joinQrCode",
    waitingstatus: "engine.stage.waitingStatus",
    joinprompt: "engine.stage.joinPrompt",
    startpopup: "engine.stage.countdown",
    craftingtimer: "engine.stage.timer",
    presentclickwidget: "engine.stage.presentationAdvancePrompt"
  };
  const controllerRoleByElementId = {
    controlleravatar: "engine.controller.avatarChoice",
    controllerinvalidbanner: "engine.controller.invalidSubmission",
    controllermicaccessbutton: "engine.controller.submitControl",
    controllerplayerbanner: "engine.controller.playerIdentity",
    controllertextinput: "engine.controller.textInput",
    controllertextsubmitbutton: "engine.controller.submitControl",
    controllervoicebutton: "engine.controller.submitControl",
    playernamefield: "engine.controller.playerNameInput",
    stagecodefield: "engine.controller.stageCodeInput"
  };
  const semanticStageWidgetArtCompositionId = (value) => {
    const id = String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    const role = stageRoleByElementId[id];
    return role ? semanticCompositionId(role) : stageLayoutWidgetArtCompositionId(value);
  };
  const semanticControllerWidgetArtCompositionId = (value) => {
    const id = String(value || "").toLowerCase().replace(/^#/, "").replace(/[^a-z0-9]/g, "");
    const role = controllerRoleByElementId[id];
    return role ? semanticCompositionId(role) : controllerLayoutWidgetArtCompositionId(value);
  };
  return createEngineLayoutNormalizationRuntime({
    controllerLayoutWidgetArtCompositionId: semanticControllerWidgetArtCompositionId,
    defaultAnimationStateForElement: ({ controllerWidgetArtCompositionId, id }) =>
      id === "startpopup" ? "Park" : controllerWidgetArtCompositionId ? "On" : "",
    inferLayoutElementKind: (kind, selector) => {
      const cleanKind = String(kind || "").trim().toLowerCase();
      if (cleanKind === "text") return "text";
      return /waitingstatus|joinprompt|stage-title|stage(?:presentation|prompt|intro)|roundintro.*text/i.test(String(selector || ""))
        ? "text"
        : "art";
    },
    isLayoutTextArtElementId,
    isLayoutTextArtSelector,
    layoutTextArtCompositionId: semanticLayoutTextCompositionId,
    stageLayoutWidgetArtCompositionId: semanticStageWidgetArtCompositionId,
    ...options
  });
}

module.exports = { createLayoutNormalizationRuntime };
