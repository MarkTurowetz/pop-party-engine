import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { createStageLayoutNormalizationRuntime } = require("./stage-layout-normalization-runtime");
const { createStageLayoutNormalizationRuntime: createEngineStageLayoutNormalizationRuntime } = require("@pop-party/engine/server");

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function runtime() {
  const defaultStageLayouts = {
    canvas: { width: 1920, height: 1080 },
    global: {
      id: "global",
      name: "Global",
      elements: [
        { id: "room-code", layoutLayer: "content" },
        { id: "stage-background", kind: "art", artCompositionId: "stage-background", layoutLayer: "background" }
      ]
    },
    states: [{ id: "lobby", name: "Lobby", elements: [], hiddenGlobals: [] }]
  };
  return createStageLayoutNormalizationRuntime({
    cloneJson,
    defaultStageLayouts,
    normalizeLayoutNumber: (value, fallback) => Number(value ?? fallback),
    normalizeLayoutState: (state) => state ? cloneJson(state) : null
  });
}

describe("stage background layout migration", () => {
  it("keeps default-state resurrection out of the neutral engine policy", () => {
    const defaultStageLayouts = {
      canvas: { width: 1920, height: 1080 },
      global: { id: "global", name: "Global", elements: [] },
      states: [{ id: "lobby", name: "Lobby", elements: [] }]
    };
    const engine = createEngineStageLayoutNormalizationRuntime({
      cloneJson,
      defaultStageLayouts,
      normalizeLayoutNumber: (value, fallback) => Number(value ?? fallback),
      normalizeLayoutState: (state) => state ? cloneJson(state) : null
    });

    expect(engine.normalizeStageLayouts({ global: defaultStageLayouts.global, states: [] }).states).toEqual([]);
  });

  it("adds the authored background layer to an older saved global layout exactly once", () => {
    const layouts = runtime().normalizeStageLayouts({
      canvas: { width: 1920, height: 1080 },
      global: { id: "global", name: "Saved Global", elements: [{ id: "room-code", layoutLayer: "content" }] },
      states: [{ id: "lobby", name: "Lobby", elements: [], hiddenGlobals: [] }]
    });

    expect(layouts.global.elements.filter((element) => element.layoutLayer === "background")).toEqual([
      expect.objectContaining({ id: "stage-background", artCompositionId: "stage-background" })
    ]);
    expect(runtime().normalizeStageLayouts(layouts).global.elements.filter((element) => element.layoutLayer === "background")).toHaveLength(1);
  });

  it("preserves an authored background already present in the saved layout", () => {
    const authored = { id: "custom-background", kind: "art", artCompositionId: "custom", layoutLayer: "background", x: 444 };
    const layouts = runtime().normalizeStageLayouts({
      global: { id: "global", name: "Saved Global", elements: [authored] },
      states: []
    });

    expect(layouts.global.elements.filter((element) => element.layoutLayer === "background")).toEqual([authored]);
  });
});
