import { describe, expect, it } from "vitest";
import type { ArtComposition } from "../../types/game-data";
import { artCompositionReferenceCounts, artCompositionUsageLabel } from "./artCompositionUsage";

describe("Art composition usage counts", () => {
  it("counts every nested reference instance across compositions and workspaces", () => {
    const documents = [
      {
        id: "widget",
        name: "Widget",
        surface: "stage",
        canvas: { width: 100, height: 100 },
        components: [
          { id: "one", name: "One", kind: "reference", artCompositionId: "answer" },
          {
            id: "container",
            name: "Container",
            kind: "container",
            children: [
              { id: "two", name: "Two", kind: "reference", artCompositionId: "answer" },
              { id: "three", name: "Three", kind: "reference", artCompositionId: "author" }
            ]
          }
        ]
      },
      {
        id: "art-workspace-stage",
        name: "Stage",
        surface: "stage",
        canvas: { width: 560, height: 230 },
        components: [{ id: "four", name: "Four", kind: "reference", artCompositionId: "answer" }]
      }
    ] as ArtComposition[];

    const counts = artCompositionReferenceCounts(documents);

    expect(counts.get("answer")).toBe(3);
    expect(counts.get("author")).toBe(1);
    expect(counts.get("unused") || 0).toBe(0);
  });

  it("formats singular and plural usage labels", () => {
    expect(artCompositionUsageLabel(0)).toBe("0 uses");
    expect(artCompositionUsageLabel(1)).toBe("1 use");
    expect(artCompositionUsageLabel(2)).toBe("2 uses");
  });
});
