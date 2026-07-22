import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { normalizeArtOrganization, removeDeletedCompositionOrganizationKeys } = require("./art-organization-runtime");

describe("Art Manager organization graph", () => {
  it("normalizes folders, prevents cycles, and assigns each item only once", () => {
    const organization = normalizeArtOrganization({
      stage: {
        folders: [
          { id: "Featured", name: " Featured " },
          { id: "archive", name: "" },
          { id: "featured", name: "Duplicate" },
          { id: "not valid", name: "Ignored" }
        ],
        order: ["asset:logo", "asset:logo", "composition:answer", "folder:featured", "folder:missing", "invalid"],
        folderItems: {
          featured: ["asset:logo", "asset:logo", "folder:archive", "folder:featured"],
          archive: ["asset:logo", "composition:answer", "folder:featured"]
        }
      }
    });

    expect(organization.stage).toEqual({
      folders: [
        { id: "featured", name: "Featured" },
        { id: "archive", name: "Folder" }
      ],
      order: ["folder:archive"],
      folderItems: {
        featured: ["asset:logo"],
        archive: ["composition:answer", "folder:featured"]
      }
    });
    expect(organization.controller).toEqual({ folders: [], order: [], folderItems: {} });
  });

  it("removes deleted compositions from top-level and nested collections", () => {
    const organization = removeDeletedCompositionOrganizationKeys({
      stage: {
        folders: [{ id: "answers", name: "Answers" }],
        order: ["composition:deleted", "asset:logo", "folder:answers"],
        folderItems: { answers: ["composition:deleted", "composition:kept"] }
      },
      controller: {
        folders: [],
        order: ["composition:deleted"],
        folderItems: {}
      }
    }, new Set(["deleted"]));

    expect(organization.stage).toEqual({
      folders: [{ id: "answers", name: "Answers" }],
      order: ["asset:logo", "folder:answers"],
      folderItems: { answers: ["composition:kept"] }
    });
    expect(organization.controller).toEqual({ folders: [], order: [], folderItems: {} });
  });
});
