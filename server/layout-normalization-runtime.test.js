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
  it("normalizes and preserves configuration tags on saved elements", () => {
    const element = runtime().normalizeLayoutElement({
      id: "voicePrompt",
      tags: [" Phase One ", "phase   one", "Review", ""]
    }, 0);

    expect(element.tags).toEqual(["Phase One", "Review"]);
  });
});
