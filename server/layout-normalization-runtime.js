"use strict";

const {
  createLayoutNormalizationRuntime: createEngineLayoutNormalizationRuntime
} = require("../packages/engine/src/server/layout-normalization-runtime");
const {
  stageLayoutWidgetArtCompositionId
} = require("../shared/stage-layout-art-widgets");
const {
  controllerLayoutWidgetArtCompositionId
} = require("../shared/controller-layout-art-widgets");
const {
  isLayoutTextArtElementId,
  isLayoutTextArtSelector,
  layoutTextArtCompositionId
} = require("../shared/layout-text-art");

function createLayoutNormalizationRuntime(options = {}) {
  return createEngineLayoutNormalizationRuntime({
    controllerLayoutWidgetArtCompositionId,
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
    layoutTextArtCompositionId,
    stageLayoutWidgetArtCompositionId,
    ...options
  });
}

module.exports = { createLayoutNormalizationRuntime };
