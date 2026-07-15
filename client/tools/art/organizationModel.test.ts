import { describe, expect, it } from "vitest";
import type { ArtOrganization } from "../../types/game-data";
import { cleanOrganizationForSave } from "./organizationModel";

describe("organizationModel", () => {
  it("promotes an unreachable folder to the root when cleaning organization data", () => {
    const organization = {
      stage: {
        folders: [{ id: "text-objects", name: "Text Objects" }],
        order: [],
        folderItems: { "text-objects": ["composition:layout-text-field"] }
      },
      controller: { folders: [], order: [], folderItems: {} }
    } as ArtOrganization;

    const cleaned = cleanOrganizationForSave(organization, {
      stage: [{ key: "composition:layout-text-field", type: "composition", name: "Layout Text Field" }],
      controller: []
    });

    expect(cleaned.stage.order).toContain("folder:text-objects");
    expect(cleaned.stage.folderItems["text-objects"]).toContain("composition:layout-text-field");
  });
});
