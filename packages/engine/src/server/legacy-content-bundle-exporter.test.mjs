import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { withDefaultArtCompositions, withDefaultBackgroundLayer } = require("./legacy-content-bundle-exporter");

describe("legacy content bundle portability", () => {
  it("copies default-only art into the portable manifest without replacing authored overrides", () => {
    const result = withDefaultArtCompositions(
      { compositions: { existing: { name: "Authored" } } },
      [{ id: "existing", name: "Default" }, { id: "default-only", name: "Default Only" }]
    );
    expect(result.compositions).toEqual({
      existing: { name: "Authored" },
      "default-only": { name: "Default Only" }
    });
    expect(result.compositions["default-only"]).not.toHaveProperty("id");
  });

  it("materializes the default background once instead of relying on runtime injection", () => {
    const background = { id: "background", artCompositionId: "stage-background", layoutLayer: "background" };
    const defaults = { global: { elements: [background] } };
    const first = withDefaultBackgroundLayer({ global: { elements: [{ id: "content" }] } }, defaults);
    const second = withDefaultBackgroundLayer(first, defaults);
    expect(second.global.elements.filter((element) => element.layoutLayer === "background")).toEqual([background]);
  });
});
