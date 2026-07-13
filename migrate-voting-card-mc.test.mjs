import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { IDS, migrateVotingCardManifest } = require("./migrate-voting-card-mc.js");

function manifestFixture() {
  return {
    organization: {
      stage: {
        folders: [{ id: "crafting", name: "Crafting Assets" }],
        folderItems: { crafting: ["composition:voting-card"] }
      }
    },
    compositions: {
      "voting-card": {
        canvas: { width: 560, height: 230 },
        components: [
          { id: "current-card", kind: "shape", x: 280, y: 86, width: 520, height: 150, fillColor: "#fff8d6" },
          { id: "answer-text", kind: "text", x: 280, y: 86, width: 420, height: 78 },
          { id: "author-heading", kind: "text", x: 280, y: 32, width: 340, height: 28 },
          { id: "voter-container", kind: "container", x: 278, y: 188, width: 500, height: 48 },
          { id: "vote-count", kind: "badge", x: 30, y: 28, width: 48, height: 48 },
          { id: "vote-widget", kind: "badge", x: 280, y: 188, width: 112, height: 32 }
        ]
      },
      "prefab-vip-mc": {
        timeline: {
          fps: 30,
          frameCount: 33,
          labels: [{ name: "Off", frame: 0 }, { name: "On", frame: 1 }, { name: "Appear", frame: 2 }, { name: "Update", frame: 13 }, { name: "Disappear", frame: 17 }],
          commandFrames: [0, 1, 2, 12, 13, 16, 32],
          commands: [{ id: "stop-0", frame: 0, type: "stop" }],
          tracks: [{ targetId: "vip", keyframes: [{ frame: 0, props: { x: 0, y: 0, width: 44, height: 22, scale: 1 }, easing: "hold" }] }]
        }
      }
    }
  };
}

describe("migrateVotingCardManifest", () => {
  it("creates the parent MC with independently labeled children", () => {
    const result = migrateVotingCardManifest(manifestFixture());
    const parent = result.compositions[IDS.parent];

    expect(parent.components.map((component) => component.instanceLabel)).toEqual(["cardArt", "answer", "author", "voters", "voteCount"]);
    expect(parent.components.map((component) => component.defaultAnimationState)).toEqual(["Park", "Park", "Park", "Park", "Park"]);
  });

  it("nests a stopped correctness state inside the card art layer", () => {
    const result = migrateVotingCardManifest(manifestFixture());
    const cardArt = result.compositions[IDS.art];
    const correctness = result.compositions[IDS.correctness];

    expect(cardArt.components).toContainEqual(expect.objectContaining({ instanceLabel: "correctnessState", artCompositionId: IDS.correctness }));
    expect(correctness.timeline.labels).toEqual([{ name: "Neutral", frame: 0 }, { name: "Correct", frame: 1 }]);
    expect(correctness.timeline.commands).toEqual(expect.arrayContaining([expect.objectContaining({ frame: 0, type: "setVisible", target: "false" }), expect.objectContaining({ frame: 1, type: "setVisible", target: "true" })]));
  });

  it("places the generated voting-card prefabs with the existing Crafting assets", () => {
    const result = migrateVotingCardManifest(manifestFixture());
    const items = result.organization.stage.folderItems.crafting;

    expect(items).toContain("composition:prefab-voting-card-mc");
    expect(items).toContain("composition:prefab-voting-card-correctness-state");
  });
});
