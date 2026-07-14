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
    { compositionId: "prefab-player-avatar-mc", sourceId: "controller-avatar-runtime", sourceName: "Controller avatar runtime" },
    ...["rex", "stego", "trike", "raptor", "bronto", "ankylo"].map((shape) => ({
      compositionId: `player-object-${shape}`,
      sourceId: "stage-player-roster-fallback",
      sourceName: `Legacy ${shape} player fallback`
    })),
    { compositionId: "prefab-voting-card-mc", sourceId: "stage-voting-card-runtime", sourceName: "Voting card runtime" },
    { compositionId: "voting-card", sourceId: "stage-voting-card-fallback", sourceName: "Legacy voting card fallback" }
  ];
}

module.exports = { artRuntimeReferences };
