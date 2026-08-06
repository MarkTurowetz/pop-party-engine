import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { createLayoutNormalizationRuntime } = require("./layout-normalization-runtime");

function runtime() {
  return createLayoutNormalizationRuntime({
    cleanFlowText: (value, fallback) => String(value || fallback || ""),
    cleanLayoutSelector: (value) => String(value || ""),
    cleanLayoutText: (value) => String(value || ""),
    defaultCanvas: { width: 390, height: 844 },
    inferLayoutElementKind: (kind) => String(kind || "").toLowerCase() === "collection" ? "collection" : "art",
    layoutTextArtCompositionId: "layout-text-field",
    normalizeColor: (value) => String(value || ""),
    normalizeFlowId: (value, fallback) => String(value || fallback || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""),
    normalizeLayoutNumber: (value, fallback, min, max) => Math.max(min, Math.min(max, Number.isFinite(Number(value)) ? Number(value) : fallback))
  });
}

describe("layout collection normalization", () => {
  it("preserves text and auto-fit authority for a Layout Text Field Art instance", () => {
    expect(runtime().normalizeLayoutElement({
      id: "custom-instructions",
      kind: "art",
      artCompositionId: "layout-text-field",
      defaultText: "A long authored instruction",
      fontSize: 58,
      autoFitText: true,
      fontColor: "#ffffff",
      zIndex: 9
    }, 0)).toEqual(expect.objectContaining({
      kind: "art",
      artCompositionId: "layout-text-field",
      defaultText: "A long authored instruction",
      fontSize: 58,
      autoFitText: true,
      fontColor: "#ffffff",
      zIndex: 9
    }));
  });

  it("preserves canonical collection geometry and removes selector/art ownership", () => {
    expect(runtime().normalizeLayoutElement({
      id: "Private Options",
      kind: "collection",
      selector: "#must-not-own-a-runtime-target",
      artCompositionId: "must-not-render-directly",
      collectionDirection: "horizontal",
      collectionGap: 18,
      collectionDistribution: "space-between",
      collectionAlignment: "center",
      collectionPadding: 12,
      collectionOverflow: "scroll",
      zIndex: 42
    }, 0)).toEqual(expect.objectContaining({
      id: "private-options",
      kind: "collection",
      selector: "",
      artCompositionId: "",
      collectionDirection: "horizontal",
      collectionGap: 18,
      collectionDistribution: "space-between",
      collectionAlignment: "center",
      collectionPadding: 12,
      collectionOverflow: "scroll",
      zIndex: 42
    }));
  });

  it("defaults invalid collection settings deterministically", () => {
    expect(runtime().normalizeLayoutElement({
      id: "options",
      kind: "collection",
      collectionDirection: "diagonal",
      collectionDistribution: "random",
      collectionAlignment: "baseline",
      collectionOverflow: "clip",
      collectionGap: -4,
      collectionPadding: 900,
      zIndex: 4000
    }, 0)).toEqual(expect.objectContaining({
      collectionDirection: "vertical",
      collectionGap: 0,
      collectionDistribution: "start",
      collectionAlignment: "stretch",
      collectionPadding: 500,
      collectionOverflow: "auto",
      zIndex: 1000
    }));
  });
});
