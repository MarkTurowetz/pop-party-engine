import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { createControllerLayoutNormalizationRuntime } = require("./controller-layout-normalization-runtime");

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
    normalizeLayoutState: (state) => state ? JSON.parse(JSON.stringify(state)) : null
  });
}

describe("controller layout normalization", () => {
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
      } : null
    });

    const layouts = customRuntime.normalizeControllerLayouts({
      canvas: { width: 390, height: 844 },
      global: { id: "global", name: "Global", elements: [] },
      states: [{ id: "voice", name: "Voice", elements: [{ id: "record" }] }]
    });

    expect(layouts.states[0].elements[0].tags).toEqual(["Phase One", "Review"]);
  });
});
