import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { IDS, migrateVotingCardVotersWidget } = require("./migrate-voting-card-voters-widget.js");

function lifecycleTimeline() {
  return {
    fps: 30,
    frameCount: 33,
    labels: [{ name: "Off", frame: 0 }, { name: "On", frame: 1 }, { name: "Appear", frame: 2 }, { name: "Disappear", frame: 17 }],
    commandFrames: [0, 1, 2, 32],
    commands: [{ id: "stop-0", frame: 0, type: "stop" }],
    tracks: [{ id: "source-track", targetId: "source", keyframes: [{ id: "source-key", frame: 2, props: { x: 24, y: 24, width: 48, height: 48, scale: 0 }, easing: "easeOut" }] }]
  };
}

function fixture() {
  return {
    organization: {
      stage: {
        folders: [{ id: "crafting", name: "Crafting Assets" }, { id: "voting", name: "Voting Card" }],
        folderItems: {
          crafting: [`composition:${IDS.group}`],
          voting: ["composition:answer", `composition:${IDS.widget}`]
        }
      }
    },
    compositions: {
      answer: { name: "Answer", components: [] },
      [IDS.lifecycleTemplate]: { name: "Vote Count MC", components: [], timeline: lifecycleTimeline() },
      [IDS.group]: {
        name: "Voting Card Voters MC",
        components: [{
          id: IDS.container,
          kind: "container",
          children: [{
            id: "old-badge",
            kind: "badge",
            defaultText: "PLAYER",
            fontSize: 15,
            fontColor: "#17131f",
            fillColor: "#fff8d6",
            borderColor: "#17131f",
            borderWidth: 2,
            borderRadius: 999
          }]
        }],
        timeline: lifecycleTimeline()
      },
      [IDS.widget]: {
        name: "Voting Card Widget MC",
        components: [
          { id: "count", instanceLabel: "voteCount", kind: "reference", artCompositionId: IDS.lifecycleTemplate },
          { id: "author", instanceLabel: "author", kind: "reference", artCompositionId: "answer" },
          { id: "answer", instanceLabel: "answer", kind: "reference", artCompositionId: "answer" }
        ],
        timeline: { tracks: [{ targetId: "author", keyframes: [{ frame: 0, props: { y: 43 } }] }] }
      }
    }
  };
}

describe("migrateVotingCardVotersWidget", () => {
  it("creates a foreground-text/background base prefab with a stopped Default state", () => {
    const result = migrateVotingCardVotersWidget(fixture(), "2026-07-14T00:00:00.000Z");
    const base = result.compositions[IDS.voter];

    expect(base.components.map((component) => component.kind)).toEqual(["text", "shape"]);
    expect(base.components[0]).toEqual(expect.objectContaining({ instanceLabel: "playerName", defaultText: "PLAYER" }));
    expect(base.components[1]).toEqual(expect.objectContaining({ instanceLabel: "background", fillColor: "#fff8d6" }));
    expect(base.timeline.labels).toContainEqual({ name: "Default", frame: 0 });
    expect(base.timeline.commands).toEqual([{ id: "stop-0", frame: 0, type: "stop" }]);
  });

  it("wraps one voter base in a full lifecycle MC", () => {
    const result = migrateVotingCardVotersWidget(fixture(), "2026-07-14T00:00:00.000Z");
    const wrapper = result.compositions[IDS.voterMc];

    expect(wrapper.components).toEqual([
      expect.objectContaining({ kind: "reference", instanceLabel: "votingCardVoter", artCompositionId: IDS.voter })
    ]);
    expect(wrapper.timeline.labels).toEqual(lifecycleTimeline().labels);
    expect(wrapper.timeline.tracks[0]).toEqual(expect.objectContaining({ targetId: IDS.voterReference }));
    expect(wrapper.timeline.tracks[0].keyframes[0].props).toEqual(expect.objectContaining({ width: 112, height: 32 }));
  });

  it("turns Voters MC into an Off/On collection whose spawned template owns lifecycle", () => {
    const result = migrateVotingCardVotersWidget(fixture(), "2026-07-14T00:00:00.000Z");
    const group = result.compositions[IDS.group];
    const container = group.components[0];

    expect(group.timeline.labels).toEqual([{ name: "Off", frame: 0 }, { name: "Park", frame: 0 }, { name: "On", frame: 1 }]);
    expect(group.timeline.tracks).toEqual([]);
    expect(container.children).toEqual([
      expect.objectContaining({ kind: "reference", instanceLabel: "voter", artCompositionId: IDS.voterMc, defaultAnimationState: "Off" })
    ]);
  });

  it("adds voters above the background-bearing answer without changing authored siblings or tracks", () => {
    const source = fixture();
    const originalTrack = structuredClone(source.compositions[IDS.widget].timeline.tracks);
    const result = migrateVotingCardVotersWidget(source, "2026-07-14T00:00:00.000Z");
    const widget = result.compositions[IDS.widget];

    expect(widget.components.map((component) => component.instanceLabel)).toEqual(["voteCount", "author", "voters", "answer"]);
    expect(widget.components[2]).toEqual(expect.objectContaining({ artCompositionId: IDS.group, defaultAnimationState: "Off" }));
    expect(widget.timeline.tracks).toEqual(originalTrack);
    expect(result.organization.stage.folderItems.voting).toEqual([
      "composition:answer",
      `composition:${IDS.voter}`,
      `composition:${IDS.voterMc}`,
      `composition:${IDS.group}`,
      `composition:${IDS.widget}`
    ]);
    expect(result.organization.stage.folderItems.crafting).toEqual([]);
  });
});
