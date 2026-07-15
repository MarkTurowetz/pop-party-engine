"use strict";

const { layoutWidgetArtCompositionIds } = require("../shared/stage-layout-art-widgets");
const {
  controllerChoiceOptionArtCompositionId,
  controllerLayoutWidgetArtCompositionIds
} = require("../shared/controller-layout-art-widgets");
const { layoutTextArtCompositionId } = require("../shared/layout-text-art");

function artRuntimeReferences() {
  return [
    ...[...new Set([
      ...Object.values(layoutWidgetArtCompositionIds),
      ...Object.values(controllerLayoutWidgetArtCompositionIds),
      controllerChoiceOptionArtCompositionId,
      layoutTextArtCompositionId
    ])].map((compositionId) => ({
      compositionId,
      sourceId: "layout-art-runtime",
      sourceName: "Layout widget runtime"
    })),
    { compositionId: "prefab-player-widget-mc", sourceId: "stage-player-roster", sourceName: "Player roster runtime" },
    { compositionId: "wipe-widget-mc", sourceId: "stage-wipe", sourceName: "Stage wipe runtime" },
    { compositionId: "prefab-player-avatar-mc", sourceId: "controller-avatar-runtime", sourceName: "Controller avatar runtime" },
    { compositionId: "prefab-voting-card-mc", sourceId: "stage-voting-card-runtime", sourceName: "Voting card runtime" },
    { compositionId: "voting-card", sourceId: "stage-voting-card-fallback", sourceName: "Legacy voting card fallback" }
  ];
}

module.exports = { artRuntimeReferences };
