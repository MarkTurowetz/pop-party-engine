(function attachPartyGameStageWidgetBindings(global) {
  "use strict";

  const definitions = {
    stageCodePanel: {
      compositionId: "stage-code-panel",
      layoutElementId: "stagecodepanel",
      previewTextOverrides: { "panel-code": "NUZ7" }
    },
    stageCodeWidget: {
      compositionId: "stage-code-widget",
      layoutElementId: "stagecodebadge",
      previewTextOverrides: { "badge-code": "NUZ7" }
    },
    joinQr: {
      compositionId: "join-qr-code",
      layoutElementId: "stagejoinqr",
      previewTextOverrides: { "qr-url": "pop-party.onrender.com/controller?stage=NUZ7" }
    },
    joinWidget: {
      compositionId: "join-widget",
      layoutElementId: "joinprompt",
      previewTextOverrides: { "join-text": "Join the Lobby at bit.ly/popcontroller" }
    },
    countdownPopup: {
      compositionId: "countdown-popup",
      layoutElementId: "startpopup",
      previewTextOverrides: { "popup-text": "Starting in 3" }
    },
    craftingTimer: {
      compositionId: "crafting-timer-widget",
      layoutElementId: "craftingtimer",
      previewTextOverrides: { "timer-value": "30" }
    },
    presentationClickPrompt: {
      compositionId: "presentation-click-prompt",
      layoutElementId: "presentclickwidget",
      previewTextOverrides: {}
    }
  };

  const definitionsByLayoutElementId = new Map(
    Object.values(definitions).map((definition) => [definition.layoutElementId, definition])
  );

  function definition(widgetId) {
    return definitions[widgetId] || null;
  }

  function definitionForLayoutElement(elementId) {
    return definitionsByLayoutElementId.get(String(elementId || "").toLowerCase()) || null;
  }

  function previewTextOverrides(elementId) {
    return { ...(definitionForLayoutElement(elementId)?.previewTextOverrides || {}) };
  }

  global.PartyGameStageWidgetBindings = {
    all: definitions,
    definition,
    definitionForLayoutElement,
    previewTextOverrides
  };
})(typeof window !== "undefined" ? window : globalThis);
