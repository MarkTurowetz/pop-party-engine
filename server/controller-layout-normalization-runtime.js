"use strict";

const {
  createControllerLayoutNormalizationRuntime: createEngineControllerLayoutNormalizationRuntime
} = require("../packages/engine/src/server/controller-layout-normalization-runtime");

const legacyGlobalActionIds = new Set([
  "controllerglobalactionmessage",
  "controllerglobalactionbutton"
]);

const localButtonContainerMigrations = {
  joinbutton: { id: "controllerjoinbuttoncontainer", name: "Join Button Container", selector: "#controllerJoinButtonContainer" },
  startgamebutton: { id: "controllerlobbybuttoncontainer", name: "Lobby Button Container", selector: "#controllerLobbyButtonContainer" },
  controllertextsubmitbutton: { id: "controllertextsubmitbuttoncontainer", name: "Text Submit Button Container", selector: "#controllerTextSubmitButtonContainer" },
  controllervoicebutton: { id: "controllervoicebuttoncontainer", name: "Voice Record Button Container", selector: "#controllerVoiceButtonContainer" },
  controllermicaccessbutton: { id: "controllermicaccessbuttoncontainer", name: "Microphone Access Button Container", selector: "#controllerMicAccessButtonContainer" }
};

function migrateControllerLocalButtonElement(element) {
  const migration = localButtonContainerMigrations[element?.id];
  if (!migration) return element;
  return {
    ...element,
    ...migration,
    kind: "art",
    artCompositionId: "",
    defaultAnimationState: "On",
    defaultText: ""
  };
}

function migrateControllerPlayerBannerElement(element) {
  const compactId = String(element?.id || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  if (compactId !== "controllerplayerbanner") return element;
  const isCurrentWidget = Number(element.playerBannerWidgetVersion || 0) >= 1;
  return {
    ...element,
    kind: "art",
    artCompositionId: "controller-player-banner",
    defaultAnimationState: isCurrentWidget ? element.defaultAnimationState : "On",
    playerBannerWidgetVersion: 1
  };
}

function migrateControllerActionElement(element, stateId) {
  if (!element) return element;
  if (element.id === "controllerglobalactionmessage") {
    return {
      ...element,
      id: stateId === "controller-paused" ? "controllerpausedmessage" : "controllerpresentationmessage",
      name: stateId === "controller-paused" ? "Paused Message" : "Presentation Message"
    };
  }
  if (element.id !== "controllerglobalactionbutton") return element;
  const isPaused = stateId === "controller-paused";
  return {
    ...element,
    id: isPaused ? "controllerpausedbuttoncontainer" : "controllerpresentationbuttoncontainer",
    name: isPaused ? "Paused Button Container" : "Presentation Button Container",
    selector: isPaused ? "#controllerPausedButtonContainer" : "#controllerPresentationButtonContainer",
    kind: "art",
    artCompositionId: "",
    defaultAnimationState: "On",
    defaultText: ""
  };
}

function migrateControllerActionState(state) {
  if (!state || !["controller-presentation", "controller-paused"].includes(state.id)) return state;
  return {
    ...state,
    elements: (state.elements || []).map((element) => migrateControllerActionElement(element, state.id))
  };
}

function createControllerLayoutNormalizationRuntime(options) {
  return createEngineControllerLayoutNormalizationRuntime({
    ...options,
    includeMissingDefaultStates: true,
    migrateControllerElement: (element) =>
      migrateControllerPlayerBannerElement(migrateControllerLocalButtonElement(element)),
    migrateControllerState: migrateControllerActionState,
    shouldIncludeControllerState: (state) => state.id !== "intro",
    shouldIncludeGlobalElement: (element) => !legacyGlobalActionIds.has(element.id),
    shouldIncludeHiddenGlobal: (id) => !legacyGlobalActionIds.has(id)
  });
}

module.exports = { createControllerLayoutNormalizationRuntime };
