import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { createControllerLayoutNormalizationRuntime } = require("./controller-layout-normalization-runtime");

function runtime() {
  return createControllerLayoutNormalizationRuntime({
    cloneJson: (value) => JSON.parse(JSON.stringify(value)),
    defaultControllerLayouts: {
      canvas: { width: 390, height: 844 },
      global: { id: "global", name: "Global", elements: [] },
      states: [{ id: "play", name: "Play", elements: [] }]
    },
    normalizeLayoutNumber: (value, fallback, min, max) => Math.max(min, Math.min(max, Number.isFinite(Number(value)) ? Number(value) : fallback)),
    normalizeLayoutState: (state) => state && ({
      ...JSON.parse(JSON.stringify(state)),
      id: String(state.id || state.name || "layout").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""),
      elements: Array.isArray(state.elements) ? JSON.parse(JSON.stringify(state.elements)) : [],
      hiddenLayers: Array.isArray(state.hiddenLayers) ? [...state.hiddenLayers] : []
    })
  });
}

describe("controller layout persistent-layer normalization", () => {
  it("normalizes stable layer ids, deterministic z-order, and per-state visibility", () => {
    const layouts = runtime().normalizeControllerLayouts({
      canvas: { width: 390, height: 844 },
      global: { id: "global", name: "Global", elements: [] },
      layers: [{
        id: "Round Bet Context",
        name: "Round Bet Context",
        zIndex: 150,
        elements: [{ id: "bet-summary", kind: "art", artCompositionId: "bet-summary" }]
      }],
      states: [{
        id: "play",
        name: "Play",
        hiddenLayers: ["round-bet-context", "missing"],
        elements: []
      }]
    });

    expect(layouts.layers).toEqual([expect.objectContaining({
      id: "round-bet-context",
      zIndex: 150,
      elements: [expect.objectContaining({ id: "bet-summary" })]
    })]);
    expect(layouts.states[0].hiddenLayers).toEqual(["round-bet-context"]);
  });
});
