import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { createLayoutNormalizationRuntime } = require("./layout-normalization-runtime");

function runtime() {
  return createLayoutNormalizationRuntime({
    cleanFlowText: (value, fallback = "") => String(value || fallback),
    cleanLayoutSelector: (value) => String(value || ""),
    cleanLayoutText: (value) => String(value || ""),
    defaultCanvas: { width: 390, height: 844 },
    normalizeColor: (value) => String(value || ""),
    normalizeFlowId: (value, fallback = "") => String(value || fallback),
    normalizeLayoutNumber: (value, fallback) => Number(value ?? fallback)
  });
}

describe("layout normalization", () => {
  it("keeps reference-game widget policy in the adapter", () => {
    expect(runtime().normalizeLayoutElement({ id: "startpopup" }, 0)).toMatchObject({
      artCompositionId: "countdown-popup",
      defaultAnimationState: "Park",
      kind: "art"
    });
  });

  it("normalizes and preserves configuration tags on saved elements", () => {
    const element = runtime().normalizeLayoutElement({
      id: "voicePrompt",
      tags: [" Phase One ", "phase   one", "Review", ""]
    }, 0);

    expect(element.tags).toEqual(["Phase One", "Review"]);
  });

  it("normalizes the explicit background/content layer contract", () => {
    expect(runtime().normalizeLayoutElement({ id: "background", layoutLayer: "BACKGROUND" }, 0).layoutLayer).toBe("background");
    expect(runtime().normalizeLayoutElement({ id: "content", layoutLayer: "unexpected" }, 1).layoutLayer).toBe("content");
  });
});
