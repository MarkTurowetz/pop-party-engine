// Typed port of the legacy client/stage/widget-art-bindings.js IIFE. Installs
// window.PartyGameStageWidgetBindings for the legacy stage runtime.

import { runtimeSemanticCompositionId } from "./semanticRoleRuntime";

interface WidgetDefinition {
  compositionId: string;
  layoutElementId: string;
  overlayComponentId?: string;
  previewTextOverrides: Record<string, string>;
}

const definitions: Record<string, WidgetDefinition> = {
  stageCodePanel: {
    get compositionId() { return runtimeSemanticCompositionId("engine.stage.roomCodePanel"); },
    layoutElementId: "stagecodepanel",
    previewTextOverrides: { "panel-code": "NUZ7" }
  },
  stageCodeWidget: {
    get compositionId() { return runtimeSemanticCompositionId("engine.stage.roomCode"); },
    layoutElementId: "stagecodebadge",
    previewTextOverrides: { "badge-code": "NUZ7" }
  },
  joinQr: {
    get compositionId() { return runtimeSemanticCompositionId("engine.stage.joinQrCode"); },
    layoutElementId: "stagejoinqr",
    overlayComponentId: "qr-placeholder",
    previewTextOverrides: {}
  },
  joinWidget: {
    get compositionId() { return runtimeSemanticCompositionId("engine.stage.joinPrompt"); },
    layoutElementId: "joinprompt",
    previewTextOverrides: { "join-text": "Join the Lobby at bit.ly/popcontroller" }
  },
  waitingStatus: {
    get compositionId() { return runtimeSemanticCompositionId("engine.stage.waitingStatus"); },
    layoutElementId: "waitingstatus",
    previewTextOverrides: { "status-text": "Waiting for Ava to start the game" }
  },
  countdownPopup: {
    get compositionId() { return runtimeSemanticCompositionId("engine.stage.countdown"); },
    layoutElementId: "startpopup",
    previewTextOverrides: { "popup-text": "Starting in 3" }
  },
  craftingTimer: {
    get compositionId() { return runtimeSemanticCompositionId("engine.stage.timer"); },
    layoutElementId: "craftingtimer",
    previewTextOverrides: { "timer-value": "30" }
  },
  stageWipe: {
    get compositionId() { return runtimeSemanticCompositionId("engine.stage.transition"); },
    layoutElementId: "",
    previewTextOverrides: {}
  },
  presentationClickPrompt: {
    get compositionId() { return runtimeSemanticCompositionId("engine.stage.presentationAdvancePrompt"); },
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
