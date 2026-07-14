import { describe, expect, it } from "vitest";
import type { ArtComposition } from "../../types/game-data";
import { artCompositionCleanupSummary, artCompositionDependencyLabel, artCompositionReferenceCounts, artCompositionUsageLabel } from "./artCompositionUsage";

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

  it("merges workspace references with external dependencies and ignores references from assets trashed together", () => {
    const documents = [
      {
        id: "parent",
        name: "Parent",
        surface: "stage",
        canvas: { width: 10, height: 10 },
        components: [{ id: "slot", name: "Slot", kind: "reference", artCompositionId: "child" }]
      },
      {
        id: "art-workspace-stage",
        name: "Stage",
        surface: "stage",
        canvas: { width: 10, height: 10 },
        components: [{ id: "workspace-slot", name: "Workspace Slot", kind: "reference", artCompositionId: "child" }]
      }
    ] as ArtComposition[];
    const serverSummary = {
      compositionId: "child",
      total: 2,
      artReferences: 1,
      stageLayoutReferences: 1,
      controllerLayoutReferences: 0,
      flowReferences: 0,
      runtimeReferences: 0,
      details: [
        { kind: "art", sourceCompositionId: "parent" },
        { kind: "stageLayout", sourceId: "lobby" }
      ]
    } as never;

    const summary = artCompositionCleanupSummary("child", documents, serverSummary, new Set(["parent"]));

    expect(summary).toMatchObject({ total: 2, artReferences: 1, stageLayoutReferences: 1 });
    expect(artCompositionDependencyLabel(summary)).toBe("2 references");
    expect(artCompositionDependencyLabel({ ...summary, total: 0, details: [] })).toBe("Unused");
  });
});
