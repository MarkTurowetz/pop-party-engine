import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const {
  EXPECTED,
  buildRecoveredArt,
  buildRecoveredFlow
} = require("./recover-reference-content-after-legacy-migration");

function flow(title, extraAction = null) {
  return {
    states: [{
      id: "lobby",
      actions: [
        {
          id: EXPECTED.preservedActionId,
          type: "displayText",
          text: title,
          subActions: []
        },
        ...(extraAction ? [extraAction] : [])
      ]
    }],
    routeNodes: []
  };
}

describe("reference migration recovery", () => {
  it("restores the legacy Flow while preserving the reviewed post-migration title edit", () => {
    const migrated = flow("Party Game Template");
    const active = flow("Party Game Template Test");
    const legacy = flow("Party Game Template", { id: "end", type: "endMoment" });

    const recovered = buildRecoveredFlow({
      migratedFlow: migrated,
      activeFlow: active,
      legacyFlow: legacy
    });

    expect(recovered.states[0].actions).toEqual([
      expect.objectContaining({ id: EXPECTED.preservedActionId, text: "Party Game Template Test" }),
      { id: "end", type: "endMoment" }
    ]);
  });

  it("fails closed when unaudited post-migration Flow changes are present", () => {
    const migrated = flow("Party Game Template");
    const active = flow("Party Game Template Test", { id: "unknown-newer-change", type: "codeNode" });

    expect(() => buildRecoveredFlow({
      migratedFlow: migrated,
      activeFlow: active,
      legacyFlow: migrated
    })).toThrow(/newer changes beyond the reviewed lobby title/i);
  });

  it("keeps the migrated Art definitions while preserving active deletions and organization entries", () => {
    const recovered = buildRecoveredArt({
      trackedArt: {
        compositions: { widget: { version: "migrated" } },
        assets: [{ id: "asset" }],
        deletedCompositionIds: ["old-avatar"],
        organization: {
          stage: {
            folders: [{ id: "tracked", name: "Tracked" }],
            order: ["folder:tracked"],
            folderItems: { tracked: ["composition:widget"] }
          }
        }
      },
      activeArt: {
        compositions: { widget: { version: "legacy" } },
        assets: [{ id: "asset" }],
        deletedCompositionIds: ["old-avatar", "deleted-widget"],
        organization: {
          stage: {
            folders: [{ id: "active", name: "Active" }],
            order: ["folder:active"],
            folderItems: { active: ["composition:widget"] }
          }
        }
      }
    });

    expect(recovered.compositions.widget.version).toBe("migrated");
    expect(recovered.deletedCompositionIds).toEqual(["old-avatar", "deleted-widget"]);
    expect(recovered.organization.stage.order)
      .toEqual(["folder:tracked", "folder:active"]);
  });
});
