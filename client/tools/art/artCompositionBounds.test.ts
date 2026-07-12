import { describe, expect, it } from "vitest";
import type { ArtComposition } from "../../types/game-data";
import { artCompositionContentBounds, artCompositionVisualBounds } from "./artCompositionBounds";

function composition(id: string, overrides: Partial<ArtComposition> = {}): ArtComposition {
  return {
    id,
    name: id,
    surface: "stage",
    canvas: { width: 100, height: 100 },
    components: [],
    ...overrides
  } as ArtComposition;
}

describe("artCompositionVisualBounds", () => {
  it("includes children that extend past the authored canvas", () => {
    const art = composition("root", {
      components: [
        {
          id: "wide",
          name: "Wide",
          kind: "shape",
          x: 130,
          y: 50,
          width: 80,
          height: 20,
          scale: 1,
          rotation: 0,
          children: []
        }
      ]
    });

    const result = artCompositionVisualBounds(art, new Map([["root", art]]));

    expect(result.minX).toBe(0);
    expect(result.maxX).toBe(170);
    expect(result.width).toBe(170);
  });

  it("includes referenced composition overflow scaled into the reference slot", () => {
    const bubble = composition("bubble", {
      canvas: { width: 100, height: 100 },
      components: [
        {
          id: "bubble-card",
          name: "Bubble Card",
          kind: "shape",
          x: 120,
          y: 50,
          width: 80,
          height: 40,
          scale: 1,
          rotation: 0,
          children: []
        }
      ]
    });
    const player = composition("player", {
      canvas: { width: 100, height: 100 },
      components: [
        {
          id: "answer-slot",
          name: "Answer Slot",
          kind: "reference",
          artCompositionId: "bubble",
          x: 50,
          y: 50,
          width: 200,
          height: 100,
          scale: 1,
          rotation: 0,
          children: []
        }
      ]
    });

    const result = artCompositionVisualBounds(player, new Map([["player", player], ["bubble", bubble]]));

    expect(result.minX).toBe(-50);
    expect(result.maxX).toBe(270);
  });
});

describe("artCompositionContentBounds", () => {
  it("uses the actual child artwork instead of the authored canvas", () => {
    const vip = composition("vip", {
      canvas: { width: 52, height: 28 },
      components: [
        { id: "label", name: "VIP", kind: "text", x: 22, y: 11, width: 34, height: 12 },
        { id: "card", name: "Card", kind: "shape", x: 22, y: 11, width: 44, height: 22 }
      ]
    });

    const result = artCompositionContentBounds(vip, new Map([[vip.id, vip]]));

    expect(result).toEqual({ minX: 0, minY: 0, maxX: 44, maxY: 22, width: 44, height: 22 });
  });

  it("treats a tight reference box as the intrinsic size through another nesting level", () => {
    const vip = composition("vip", {
      canvas: { width: 52, height: 28 },
      components: [{ id: "card", name: "Card", kind: "shape", x: 22, y: 11, width: 44, height: 22 }]
    });
    const vipMc = composition("vip-mc", {
      canvas: { width: 560, height: 230 },
      components: [{ id: "vip-ref", name: "VIP", kind: "reference", artCompositionId: "vip", x: 0, y: 0, width: 44, height: 22 }]
    });
    const map = new Map([[vip.id, vip], [vipMc.id, vipMc]]);

    const result = artCompositionContentBounds(vipMc, map);

    expect(result.width).toBe(44);
    expect(result.height).toBe(22);
  });
});
