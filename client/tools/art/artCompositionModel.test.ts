import { describe, expect, it } from "vitest";
import { gameTextDefaultFontFamily, gameTextFontOptions } from "../../textFonts";
import { serializeArtComponentForSave, serializeArtCompositionForSave } from "./artCompositionModel";
import { componentKindLabel, normalizeShapeStyle } from "./artComponentSchema";
import type { ArtComponent, ArtComposition } from "../../types/game-data";

describe("artComponentSchema", () => {
  it("labels and normalizes kinds/styles", () => {
    expect(componentKindLabel("text")).toBe("Text");
    expect(componentKindLabel("bogus")).toBe("Shape");
    expect(normalizeShapeStyle("circle", "shape")).toBe("circle");
    expect(normalizeShapeStyle("bogus", "container")).toBe("rectangle");
  });
});

describe("artCompositionModel serialization", () => {
  it("serializes a component with defaults and rounding", () => {
    const component = { id: "c1", kind: "shape", x: 1.23456, width: 10 } as unknown as ArtComponent;
    const serialized = serializeArtComponentForSave(component) as Record<string, unknown>;
    expect(serialized.id).toBe("c1");
    expect(serialized.name).toBe("Shape");
    expect(serialized.x).toBe(1.235);
    expect(serialized.width).toBe(10);
    expect(serialized.opacity).toBe(1);
    expect(serialized.visible).toBe(true);
    expect(serialized.locked).toBe(false);
    expect(serialized.shapeStyle).toBe("rounded");
    expect(serialized.children).toEqual([]);
    // non-shape image fields are blanked
    expect(serialized.imageDataUrl).toBe("");
  });

  it("normalizes surface and nested components", () => {
    const composition = {
      id: "comp",
      name: "My Comp",
      surface: "weird",
      canvas: { width: 100, height: 50 },
      components: [{ id: "p", kind: "container", children: [{ id: "child", kind: "text", defaultText: "Hi" }] }]
    } as unknown as ArtComposition;
    const serialized = serializeArtCompositionForSave(composition) as Record<string, unknown>;
    expect(serialized.surface).toBe("stage");
    const components = serialized.components as Record<string, unknown>[];
    expect((components[0].children as Record<string, unknown>[])[0].defaultText).toBe("Hi");
    expect((components[0].children as Record<string, unknown>[])[0].fontFamily).toBe(gameTextDefaultFontFamily);
    expect(components[0].childDistribution).toBe("none");
  });

  it("serializes supported text font families", () => {
    const fontFamily = gameTextFontOptions.find((option) => option.label === "Georgia")?.value || "";
    const component = { id: "text", kind: "text", fontFamily } as unknown as ArtComponent;
    const serialized = serializeArtComponentForSave(component) as Record<string, unknown>;
    expect(serialized.fontFamily).toBe(fontFamily);
    expect(serializeArtComponentForSave({ id: "text", kind: "text", fontFamily: "Papyrus" } as unknown as ArtComponent).fontFamily).toBe(
      gameTextDefaultFontFamily
    );
  });

  it("keeps layer lock state in serialized components", () => {
    const serialized = serializeArtComponentForSave({ id: "locked", kind: "shape", locked: true } as unknown as ArtComponent);
    expect(serialized.locked).toBe(true);
  });
});
