import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { IDS, repairVotingCardWidget } = require("./repair-voting-card-widget.js");

function lifecycleTimeline(targetId) {
  return {
    fps: 30,
    frameCount: 33,
    labels: [{ name: "Off", frame: 0 }, { name: "On", frame: 1 }],
    commandFrames: [0, 1],
    commands: [{ id: "stop-0", frame: 0, type: "stop" }],
    tracks: [{
      id: `track-${targetId}`,
      targetId,
      keyframes: [{ id: `key-${targetId}-0`, frame: 0, props: { x: 24, y: 24, width: 48, height: 48 }, easing: "hold" }]
    }]
  };
}

function fixture() {
  return {
    organization: {
      stage: {
        folders: [
          { id: "crafting", name: "Crafting Assets" },
          { id: "voting", name: "Voting Card" }
        ],
        folderItems: {
          crafting: [`composition:${IDS.container}`, `composition:${IDS.authorBase}`, `composition:${IDS.author}`],
          voting: [
            `composition:${IDS.background}`,
            "composition:empty-untitled",
            `composition:${IDS.answerBase}`,
            `composition:${IDS.answer}`,
            `composition:${IDS.voteBase}`,
            `composition:${IDS.voteWrapper}`
          ]
        }
      }
    },
    compositions: {
      [IDS.background]: { name: "Voting Card Bg", components: [{ id: "bg", kind: "shape" }] },
      [IDS.answerBase]: { name: "Voting Card Answer Text", components: [{ id: "answer-text", kind: "text" }] },
      [IDS.answer]: { name: "Voting Card Answer", components: [{ id: "answer-ref", kind: "reference", artCompositionId: IDS.answerBase }] },
      [IDS.authorBase]: { name: "Voting Card Author Text", components: [{ id: "author-text", kind: "text" }] },
      [IDS.author]: { name: "Voting Card Author MC", components: [{ id: "author-ref", kind: "reference", artCompositionId: IDS.authorBase }] },
      [IDS.voteWrapper]: {
        name: "Voting Card Vote Count MC",
        components: [{ id: "broken-ref", kind: "reference", artCompositionId: IDS.voteBase }],
        timeline: lifecycleTimeline("broken-ref")
      },
      [IDS.container]: {
        name: "Voting Card MC",
        components: [{ id: "legacy", kind: "reference", artCompositionId: IDS.author }],
        timeline: lifecycleTimeline("legacy")
      },
      "empty-untitled": { name: "Untitled Prefab", components: [] }
    }
  };
}

describe("repairVotingCardWidget", () => {
  it("restores a two-layer circular vote base with a stopped Default state", () => {
    const result = repairVotingCardWidget(fixture(), "2026-07-14T00:00:00.000Z");
    const base = result.compositions[IDS.voteBase];

    expect(base.components.map((component) => component.kind)).toEqual(["text", "shape"]);
    expect(base.components[0]).toEqual(expect.objectContaining({ instanceLabel: "voteCountText", defaultText: "1" }));
    expect(base.components[1]).toEqual(expect.objectContaining({ instanceLabel: "background", shapeStyle: "circle" }));
    expect(base.timeline.labels).toContainEqual({ name: "Default", frame: 0 });
    expect(base.timeline.commands).toEqual([{ id: "stop-0", frame: 0, type: "stop" }]);
    expect(base.timeline.commands.some((command) => command.type === "setVisible")).toBe(false);
  });

  it("repairs the Vote Count wrapper reference without replacing its lifecycle timing", () => {
    const source = fixture();
    const result = repairVotingCardWidget(source, "2026-07-14T00:00:00.000Z");
    const wrapper = result.compositions[IDS.voteWrapper];

    expect(wrapper.components).toEqual([
      expect.objectContaining({
        kind: "reference",
        instanceLabel: "votingCardVote",
        artCompositionId: IDS.voteBase,
        defaultAnimationState: "Default"
      })
    ]);
    expect(wrapper.timeline.labels).toEqual(source.compositions[IDS.voteWrapper].timeline.labels);
    expect(wrapper.timeline.tracks[0]).toEqual(expect.objectContaining({
      targetId: "reference-voting-card-vote"
    }));
  });

  it("restores Voting Card Widget MC with the three authored animated children initially Off", () => {
    const result = repairVotingCardWidget(fixture(), "2026-07-14T00:00:00.000Z");
    const widget = result.compositions[IDS.container];

    expect(widget.name).toBe("Voting Card Widget MC");
    expect(widget.components.map((component) => component.instanceLabel)).toEqual(["answer", "author", "voteCount"]);
    expect(widget.components.map((component) => component.artCompositionId)).toEqual([IDS.answer, IDS.author, IDS.voteWrapper]);
    expect(widget.components.every((component) => component.defaultAnimationState === "Off")).toBe(true);
    expect(widget.timeline.labels).toEqual([
      { name: "Off", frame: 0 },
      { name: "Park", frame: 0 },
      { name: "On", frame: 1 }
    ]);
    expect(widget.timeline.tracks).toEqual([]);
  });

  it("files the repaired hierarchy in Voting Card and removes the empty placeholder from that folder", () => {
    const result = repairVotingCardWidget(fixture(), "2026-07-14T00:00:00.000Z");
    const items = result.organization.stage.folderItems.voting;

    expect(items).toEqual([
      `composition:${IDS.background}`,
      `composition:${IDS.answerBase}`,
      `composition:${IDS.answer}`,
      `composition:${IDS.voteBase}`,
      `composition:${IDS.voteWrapper}`,
      `composition:${IDS.authorBase}`,
      `composition:${IDS.author}`,
      `composition:${IDS.container}`
    ]);
    expect(result.organization.stage.folderItems.crafting).toEqual([]);
  });
});
