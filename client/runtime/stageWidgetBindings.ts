// Typed port of the legacy client/stage/widget-art-bindings.js IIFE. Installs
// window.PartyGameStageWidgetBindings for the legacy stage runtime.

interface WidgetDefinition {
  compositionId: string;
  layoutElementId: string;
  overlayComponentId?: string;
  previewTextOverrides: Record<string, string>;
}

const definitions: Record<string, WidgetDefinition> = {
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
    overlayComponentId: "qr-placeholder",
    previewTextOverrides: {}
  },
  joinWidget: {
    compositionId: "join-widget",
    layoutElementId: "joinprompt",
    previewTextOverrides: { "join-text": "Join the Lobby at bit.ly/popcontroller" }
  },
  waitingStatus: {
    compositionId: "waiting-status-widget",
    layoutElementId: "waitingstatus",
    previewTextOverrides: { "status-text": "Waiting for Ava to start the game" }
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
  stageWipe: {
    compositionId: "wipe-widget-mc",
    layoutElementId: "",
    previewTextOverrides: {}
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

function definition(widgetId: string): WidgetDefinition | null {
  return definitions[widgetId] || null;
}

function definitionForLayoutElement(elementId: unknown): WidgetDefinition | null {
  return definitionsByLayoutElementId.get(String(elementId || "").toLowerCase()) || null;
}

function previewTextOverrides(elementId: unknown): Record<string, string> {
  return { ...(definitionForLayoutElement(elementId)?.previewTextOverrides || {}) };
}

export const PartyGameStageWidgetBindings = {
  all: definitions,
  definition,
  definitionForLayoutElement,
  previewTextOverrides
};

declare global {
  interface Window {
    PartyGameStageWidgetBindings?: typeof PartyGameStageWidgetBindings;
  }
}

export function installStageWidgetBindingsGlobals(target: Window | typeof globalThis = globalThis): void {
  (target as Window).PartyGameStageWidgetBindings = PartyGameStageWidgetBindings;
}

installStageWidgetBindingsGlobals(typeof window !== "undefined" ? window : globalThis);
