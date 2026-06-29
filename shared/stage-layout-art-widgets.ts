// Dual-use (server require + window global) stage layout widget art-composition map.
// Built to shared/stage-layout-art-widgets.js via `npm run build:shared` (committed
// output). Wrapped in an IIFE so declarations stay local to the shared compilation.

(function (): void {
  "use strict";

  const layoutWidgetArtCompositionIds: Record<string, string> = Object.freeze({
    stagecodepanel: "stage-code-panel",
    stagecodebadge: "stage-code-widget",
    stagejoinqr: "join-qr-code",
    waitingstatus: "waiting-status-widget",
    joinprompt: "join-widget",
    startpopup: "countdown-popup",
    craftingtimer: "crafting-timer-widget",
    presentclickwidget: "presentation-click-prompt"
  });

  function stageLayoutWidgetArtCompositionId(elementId: unknown): string {
    return layoutWidgetArtCompositionIds[String(elementId || "").toLowerCase()] || "";
  }

  const api = {
    layoutWidgetArtCompositionIds,
    stageLayoutWidgetArtCompositionId
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof window !== "undefined") (window as unknown as Record<string, unknown>).PartyStageLayoutArtWidgets = api;
})();
