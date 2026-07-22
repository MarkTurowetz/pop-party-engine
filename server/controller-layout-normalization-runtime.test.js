import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { createControllerLayoutNormalizationRuntime } = require("./controller-layout-normalization-runtime");
const { createControllerLayoutNormalizationRuntime: createEngineControllerLayoutNormalizationRuntime } = require("@pop-party/engine/server");
const semanticRoles = { "engine.controller.playerIdentity": { compositionId: "controller-player-banner" } };

function runtime() {
  const defaults = {
    canvas: { width: 390, height: 844 },
    global: { id: "global", name: "Global", elements: [] },
    states: []
  };
  return createControllerLayoutNormalizationRuntime({
    cloneJson: (value) => JSON.parse(JSON.stringify(value)),
    defaultControllerLayouts: defaults,
    normalizeLayoutNumber: (value, fallback) => Number(value || fallback),
    normalizeLayoutState: (state) => state ? JSON.parse(JSON.stringify(state)) : null,
    semanticRoles
  });
}

describe("controller layout normalization", () => {
  it("keeps reference migrations and default-state resurrection out of the neutral engine policy", () => {
    const defaultControllerLayouts = {
      canvas: { width: 390, height: 844 },
      global: { id: "global", name: "Global", elements: [] },
      states: [{ id: "lobby", name: "Lobby", elements: [] }]
    };
    const engine = createEngineControllerLayoutNormalizationRuntime({
      cloneJson: (value) => JSON.parse(JSON.stringify(value)),
      defaultControllerLayouts,
      normalizeLayoutNumber: (value, fallback) => Number(value ?? fallback),
      normalizeLayoutState: (state) => state ? JSON.parse(JSON.stringify(state)) : null
    });
    const layouts = engine.normalizeControllerLayouts({
      global: defaultControllerLayouts.global,
      states: [{ id: "intro", name: "Game-owned Intro", elements: [{ id: "controllerplayerbanner" }] }]
    });

    expect(layouts.states).toHaveLength(1);
    expect(layouts.states[0]).toMatchObject({ id: "intro" });
    expect(layouts.states[0].elements[0]).toMatchObject({
      id: "controllerplayerbanner",
      defaultAnimationState: "On"
    });
    expect(layouts.states[0].elements[0]).not.toHaveProperty("artCompositionId");
  });

  it("defaults every controller placement to On unless it is explicitly hidden initially", () => {
    const layouts = runtime().normalizeControllerLayouts({
      canvas: { width: 390, height: 844 },
      global: { id: "global", name: "Global", elements: [] },
      states: [
        {
          id: "controller-text-input",
          name: "Text Input",
          elements: [
            { id: "prompt" },
            { id: "warning", defaultAnimationState: "Off" },
            { id: "legacy-hidden", defaultAnimationState: "Park" }
          ]
        }
      ]
    });

    expect(layouts.states[0].elements.map((element) => element.defaultAnimationState)).toEqual(["On", "Off", "Off"]);
  });

  it("migrates the legacy Player Banner to the compound widget and turns it On once", () => {
    const layouts = runtime().normalizeControllerLayouts({
      canvas: { width: 390, height: 844 },
      global: {
        id: "global",
        name: "Global",
        elements: [{ id: "controllerPlayerBanner", defaultAnimationState: "Off" }]
      },
      states: []
    });

    expect(layouts.global.elements[0]).toMatchObject({
      kind: "art",
      artCompositionId: "controller-player-banner",
      defaultAnimationState: "On",
      playerBannerWidgetVersion: 1
    });
  });

  it("preserves an explicitly authored Player Banner state after widget migration", () => {
    const layouts = runtime().normalizeControllerLayouts({
      canvas: { width: 390, height: 844 },
      global: {
        id: "global",
        name: "Global",
        elements: [{ id: "controllerPlayerBanner", defaultAnimationState: "Off", playerBannerWidgetVersion: 1 }]
      },
      states: []
    });

    expect(layouts.global.elements[0].defaultAnimationState).toBe("Off");
  });

  it("migrates legacy global action art into uniquely owned state containers", () => {
    const layouts = runtime().normalizeControllerLayouts({
      canvas: { width: 390, height: 844 },
      global: {
        id: "global",
        name: "Global",
        elements: [
          { id: "controllerplayerbanner" },
          { id: "controllerglobalactionmessage" },
          { id: "controllerglobalactionbutton" }
        ]
      },
      states: [
        {
          id: "controller-presentation",
          name: "Presentation",
          hiddenGlobals: ["controllerglobalactionmessage"],
          elements: [
            { id: "controllerglobalactionmessage", name: "Message" },
            { id: "controllerglobalactionbutton", selector: "#controllerGlobalActionButton", artCompositionId: "controller-primary-button" }
          ]
        },
        {
          id: "controller-paused",
          name: "Paused",
          elements: [
            { id: "controllerglobalactionmessage", name: "Message" },
            { id: "controllerglobalactionbutton", selector: "#controllerGlobalActionButton", artCompositionId: "controller-primary-button" }
          ]
        }
      ]
    });

    expect(layouts.global.elements.map((element) => element.id)).toEqual(["controllerplayerbanner"]);
    expect(layouts.states[0].elements.map((element) => element.id)).toEqual([
      "controllerpresentationmessage",
      "controllerpresentationbuttoncontainer"
    ]);
    expect(layouts.states[0].elements[1]).toMatchObject({
      selector: "#controllerPresentationButtonContainer",
      artCompositionId: "",
      defaultAnimationState: "On"
    });
    expect(layouts.states[1].elements.map((element) => element.id)).toEqual([
      "controllerpausedmessage",
      "controllerpausedbuttoncontainer"
    ]);
    expect(layouts.states[0].hiddenGlobals).toEqual([]);
  });

  it("automatically suppresses a global placement when a state owns the same id", () => {
    const layouts = runtime().normalizeControllerLayouts({
      canvas: { width: 390, height: 844 },
      global: { id: "global", name: "Global", elements: [{ id: "banner" }] },
      states: [{ id: "custom", name: "Custom", elements: [{ id: "banner" }] }]
    });

    expect(layouts.states[0].hiddenGlobals).toEqual(["banner"]);
  });

  it("migrates persistent input buttons into state-local button containers", () => {
    const layouts = runtime().normalizeControllerLayouts({
      canvas: { width: 390, height: 844 },
      global: { id: "global", name: "Global", elements: [] },
      states: [
        {
          id: "controller-text-input",
          name: "Text Input",
          elements: [{ id: "controllertextsubmitbutton", artCompositionId: "controller-primary-button", defaultAnimationState: "Off" }]
        },
        {
          id: "controller-voice-input",
          name: "Voice Input",
          elements: [{ id: "controllervoicebutton", artCompositionId: "controller-primary-button" }]
        },
        {
          id: "controller-microphone-access",
          name: "Microphone Access",
          elements: [{ id: "controllermicaccessbutton", artCompositionId: "controller-primary-button" }]
        }
      ]
    });

    expect(layouts.states.map((state) => state.elements[0])).toMatchObject([
      {
        id: "controllertextsubmitbuttoncontainer",
        selector: "#controllerTextSubmitButtonContainer",
        artCompositionId: "",
        defaultAnimationState: "On"
      },
      {
        id: "controllervoicebuttoncontainer",
        selector: "#controllerVoiceButtonContainer",
        artCompositionId: ""
      },
      {
        id: "controllermicaccessbuttoncontainer",
        selector: "#controllerMicAccessButtonContainer",
        artCompositionId: ""
      }
    ]);
  });

  it("migrates Join and Lobby buttons into local containers and drops the obsolete Intro controller state", () => {
    const layouts = runtime().normalizeControllerLayouts({
      canvas: { width: 390, height: 844 },
      global: { id: "global", name: "Global", elements: [] },
      states: [
        { id: "join", name: "Join", elements: [{ id: "joinbutton", selector: "#joinButton", artCompositionId: "controller-primary-button" }] },
        { id: "lobby", name: "Lobby", elements: [{ id: "startgamebutton", selector: "#startGameButton", artCompositionId: "controller-primary-button" }] },
        { id: "intro", name: "Present Controller State", elements: [{ id: "intropresentbutton" }] }
      ]
    });

    expect(layouts.states.map((state) => state.id)).toEqual(["join", "lobby"]);
    expect(layouts.states[0].elements[0]).toMatchObject({
      id: "controllerjoinbuttoncontainer",
      selector: "#controllerJoinButtonContainer",
      artCompositionId: ""
    });
    expect(layouts.states[1].elements[0]).toMatchObject({
      id: "controllerlobbybuttoncontainer",
      selector: "#controllerLobbyButtonContainer",
      artCompositionId: ""
    });
  });

  it("preserves per-view configuration tags supplied by layout normalization", () => {
    const customRuntime = createControllerLayoutNormalizationRuntime({
      cloneJson: (value) => JSON.parse(JSON.stringify(value)),
      defaultControllerLayouts: {
        canvas: { width: 390, height: 844 },
        global: { id: "global", name: "Global", elements: [] },
        states: []
      },
      normalizeLayoutNumber: (value, fallback) => Number(value || fallback),
      normalizeLayoutState: (state) => state ? {
        ...JSON.parse(JSON.stringify(state)),
        elements: (state.elements || []).map((element) => ({
          ...element,
          tags: ["Phase One", "Review"]
        }))
      } : null,
      semanticRoles
    });

    const layouts = customRuntime.normalizeControllerLayouts({
      canvas: { width: 390, height: 844 },
      global: { id: "global", name: "Global", elements: [] },
      states: [{ id: "voice", name: "Voice", elements: [{ id: "record" }] }]
    });

    expect(layouts.states[0].elements[0].tags).toEqual(["Phase One", "Review"]);
  });
});
