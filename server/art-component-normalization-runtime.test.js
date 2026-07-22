import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { createArtComponentNormalizationRuntime } = require("./art-component-normalization-runtime");

function createRuntime() {
  return createArtComponentNormalizationRuntime({
    acceptedArtTypes: { "image/png": ".png" },
    artAssets: [{ id: "avatar" }]
  });
}

describe("Art component normalization", () => {
  it("normalizes intrinsic references without copying child canvas dimensions", () => {
    const component = createRuntime().normalizeComponent({
      id: "answer-ref",
      name: "Answer",
      kind: "reference",
      artCompositionId: "answer-bubble",
      referenceSizeMode: "intrinsic",
      width: 999,
      height: 999,
      defaultAnimationState: "appear"
    });

    expect(component).toEqual(expect.objectContaining({
      id: "answer-ref",
      artCompositionId: "answer-bubble",
      referenceSizeMode: "intrinsic",
      defaultAnimationState: "Appear"
    }));
    expect(component).not.toHaveProperty("width");
    expect(component).not.toHaveProperty("height");
  });

  it("keeps only recognized sprite sources and normalizes nested component ids once", () => {
    const runtime = createRuntime();
    const component = runtime.normalizeComponent({
      id: "avatar-frame",
      kind: "sprite",
      imageAssetId: "avatar",
      children: [
        { id: "Label", kind: "text", defaultText: " Player " },
        { id: "label", kind: "text", defaultText: "Duplicate" }
      ]
    });

    expect(component).toEqual(expect.objectContaining({ imageAssetId: "avatar", imageName: "avatar" }));
    expect(component.children).toHaveLength(1);
    expect(component.children[0]).toEqual(expect.objectContaining({ id: "label", defaultText: "Player" }));

    const unknown = runtime.normalizeComponent({ id: "unknown", kind: "sprite", imageAssetId: "missing" });
    expect(unknown).not.toHaveProperty("imageAssetId");
  });

  it("clamps authored geometry and text presentation to engine limits", () => {
    const component = createRuntime().normalizeComponent({
      id: "score",
      kind: "text",
      width: -10,
      height: 0,
      scale: 99,
      opacity: -2,
      brightness: 10,
      fontSize: 999,
      fontColor: "not-a-color"
    });

    expect(component).toEqual(expect.objectContaining({
      width: 1,
      height: 1,
      scale: 8,
      opacity: 0,
      brightness: 4,
      fontSize: 240,
      fontColor: "#17131f"
    }));
  });
});
