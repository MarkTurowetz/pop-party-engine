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
});
