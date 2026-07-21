import { afterEach, describe, expect, it } from "vitest";
import { layoutTextArtRenderOptions, layoutTextArtUsesNestedPrefab } from "./layoutRuntime";

const globals = globalThis as typeof globalThis & {
  artComposition?: (id: string) => Record<string, unknown> | null;
};
const previousArtComposition = globals.artComposition;

afterEach(() => {
  globals.artComposition = previousArtComposition;
});

describe("layout text art runtime targeting", () => {
  it("targets a flat Layout Text Field even when the child prefab also exists", () => {
    globals.artComposition = (id) => {
      if (id === "layout-text-field") return { id, components: [{ id: "text", kind: "text" }] };
      if (id === "prefab-layout-text-field-text") return { id, components: [{ id: "text", kind: "text" }] };
      return null;
    };

    expect(layoutTextArtUsesNestedPrefab()).toBe(false);
    expect(layoutTextArtRenderOptions({ defaultText: "Lobby" }).textOverrides).toEqual({
      "layout-text-field/text": "Lobby",
      text: "Lobby"
    });
  });

  it("targets the nested text prefab only when the active parent references it", () => {
    globals.artComposition = (id) => id === "layout-text-field"
      ? {
          id,
          components: [{
            id: "layout-text-field-text",
            kind: "reference",
            artCompositionId: "prefab-layout-text-field-text"
          }]
        }
      : null;

    expect(layoutTextArtUsesNestedPrefab()).toBe(true);
    expect(layoutTextArtRenderOptions({ defaultText: "Round Intro" }).textOverrides).toEqual({
      "prefab-layout-text-field-text/text": "Round Intro",
      "layout-text-field/text": ""
    });
  });
});
