const layoutWidgetArtCompositionIds = Object.freeze({
  stagecodepanel: "stage-code-panel",
  stagecodebadge: "stage-code-widget",
  stagejoinqr: "join-qr-code",
  waitingstatus: "waiting-status-widget",
  joinprompt: "join-widget",
  startpopup: "countdown-popup",
  craftingtimer: "crafting-timer-widget",
  presentclickwidget: "presentation-click-prompt"
});

function stageLayoutWidgetArtCompositionId(elementId) {
  return layoutWidgetArtCompositionIds[String(elementId || "").toLowerCase()] || "";
}

const api = {
  layoutWidgetArtCompositionIds,
  stageLayoutWidgetArtCompositionId
};

if (typeof module !== "undefined" && module.exports) module.exports = api;
if (typeof window !== "undefined") window.PartyStageLayoutArtWidgets = api;
