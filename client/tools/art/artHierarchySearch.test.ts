import { describe, expect, it } from "vitest";
import type { ArtOrganizationSurface } from "../../types/game-data";
import { searchArtHierarchy, fuzzyMatchesArtHierarchyText } from "./artHierarchySearch";
import type { OrgItem } from "./organizationModel";

const items: OrgItem[] = [
  { key: "composition:player-answer-bubble", type: "composition", name: "Player Answer Bubble" },
  { key: "composition:stage-code-panel", type: "composition", name: "Stage Code Panel" },
  { key: "composition:layout-text-field", type: "composition", name: "Layout Text Field" }
];

function organization(): ArtOrganizationSurface {
  return {
    folders: [
      { id: "generics", name: "Generics" },
      { id: "prefabs", name: "Prefabs" }
    ],
    order: ["folder:generics", "composition:stage-code-panel"],
    folderItems: {
      generics: ["folder:prefabs"],
      prefabs: ["composition:player-answer-bubble"]
    }
  };
}

describe("art hierarchy search", () => {
  it("matches substrings and fuzzy abbreviations", () => {
    expect(fuzzyMatchesArtHierarchyText("Stage Code Panel", "code")).toBe(true);
    expect(fuzzyMatchesArtHierarchyText("Stage Code Panel", "scp")).toBe(true);
    expect(fuzzyMatchesArtHierarchyText("Player Answer Bubble", "pab")).toBe(true);
    expect(fuzzyMatchesArtHierarchyText("Player Answer Bubble", "stage")).toBe(false);
  });

  it("keeps ancestor folders visible for a matching nested composition", () => {
    const result = searchArtHierarchy(organization(), items, "answer bubble");

    expect(result.active).toBe(true);
    expect(result.visibleKeys.has("folder:generics")).toBe(true);
    expect(result.visibleKeys.has("folder:prefabs")).toBe(true);
    expect(result.visibleKeys.has("composition:player-answer-bubble")).toBe(true);
    expect(result.visibleKeys.has("composition:stage-code-panel")).toBe(false);
    expect(result.expandedFolderIds.has("generics")).toBe(true);
    expect(result.expandedFolderIds.has("prefabs")).toBe(true);
  });

  it("shows a matching folder subtree", () => {
    const result = searchArtHierarchy(organization(), items, "generics");

    expect(result.visibleKeys.has("folder:generics")).toBe(true);
    expect(result.visibleKeys.has("folder:prefabs")).toBe(true);
    expect(result.visibleKeys.has("composition:player-answer-bubble")).toBe(true);
  });

  it("finds unfiled assets that are not in root order", () => {
    const result = searchArtHierarchy(organization(), items, "ltf");

    expect(result.visibleKeys.has("composition:layout-text-field")).toBe(true);
    expect(result.visibleKeys.has("folder:generics")).toBe(false);
  });
});
