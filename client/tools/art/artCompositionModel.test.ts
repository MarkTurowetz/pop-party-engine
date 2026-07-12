import { describe, expect, it } from "vitest";
import { gameTextDefaultFontFamily, gameTextFontOptions } from "../../textFonts";
import { hydrateArtCompositionForEditing, serializeArtComponentForSave, serializeArtCompositionForSave } from "./artCompositionModel";
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

  it("keeps composition tracks in the composition and removes component-local timelines", () => {
    const hydrated = hydrateArtCompositionForEditing({
      id: "layout-text-field",
      name: "Layout Text Field",
      surface: "stage",
      canvas: { width: 1000, height: 240 },
      timeline: {
        fps: 30,
        frameCount: 45,
        labels: [{ name: "update", frame: 18 }],
        commands: [{ frame: 24, type: "stop" }],
        tracks: [{ targetId: "text", keyframes: [{ frame: 18, props: { scale: 1.2 } }] }]
      },
      components: [
        {
          id: "text",
          name: "Text",
          kind: "text",
          x: 500,
          y: 120,
          width: 1000,
          height: 240,
          scale: 1,
          rotation: 0,
          opacity: 1,
          visible: true,
          timeline: {
            fps: 30,
            frameCount: 45,
            labels: [{ name: "appear", frame: 2 }],
            commands: [{ frame: 32, type: "stop" }],
            tracks: [
              {
                targetId: "text",
                keyframes: [
                  { frame: 2, props: { scale: 0, opacity: 0 } },
                  { frame: 17, props: { scale: 1, opacity: 1 } },
                  { frame: 32, props: { scale: 1, opacity: 1 } }
                ]
              }
            ]
          }
        }
      ]
    } as ArtComposition);

    expect(hydrated.timeline?.tracks.some((track) => track.targetId === "text")).toBe(true);
    expect(hydrated.components[0].timeline).toBeUndefined();
    expect(hydrated.timeline?.tracks.find((track) => track.targetId === "text")?.keyframes[0]?.props).toMatchObject({ scale: 1.2 });
  });
});
