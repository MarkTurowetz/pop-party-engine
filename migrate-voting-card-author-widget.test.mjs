import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { IDS, migrateVotingCardAuthorWidget } = require("./migrate-voting-card-author-widget.js");

function lifecycleTimeline() {
  return {
    fps: 30,
    frameCount: 33,
    labels: [
      { name: "Off", frame: 0 },
      { name: "On", frame: 1 },
      { name: "Appear", frame: 2 },
      { name: "Update", frame: 13 },
      { name: "Disappear", frame: 17 }
    ],
    commandFrames: [0, 1, 2, 12, 13, 16, 32],
    commands: [
      { id: "stop-0", frame: 0, type: "stop" },
      { id: "hide-0", frame: 0, type: "setVisible", target: "false" },
      { id: "stop-1", frame: 1, type: "stop" }
    ],
    tracks: [{
      id: "track-voting-card-author-text",
      targetId: "voting-card-author-text",
      keyframes: [
        { id: "key-old-0", frame: 0, props: { x: 170, y: 14, width: 340, height: 28, scale: 1 }, easing: "hold" },
        { id: "key-old-2", frame: 2, props: { x: 170, y: 14, width: 340, height: 28, scale: 0 }, easing: "easeOut" }
      ]
    }]
  };
}

function fixture() {
  return {
    organization: {
      stage: {
        folders: [{ id: "crafting", name: "Crafting Assets" }],
        folderItems: {
          crafting: [
            "composition:prefab-voting-card-mc",
            "composition:prefab-voting-card-author-mc",
            "composition:unrelated"
          ]
        }
      }
    },
    compositions: {
      [IDS.wrapper]: {
        name: "Voting Card Author MC",
        surface: "stage",
        canvas: { width: 340, height: 28 },
        components: [{
          id: "voting-card-author-text",
          name: "Voting Card Author Text",
          instanceLabel: "authorText",
          kind: "text",
          x: 170,
          y: 14,
          width: 340,
          height: 28,
          defaultText: "AUTHOR NAME",
          fontSize: 15,
          fontColor: "#6b5a80"
        }],
        timeline: lifecycleTimeline()
      },
      [IDS.container]: {
        name: "Voting Card MC",
        components: [
          { id: "answer", artCompositionId: "answer" },
          { id: IDS.containerReference, instanceLabel: "author", artCompositionId: IDS.wrapper, x: 999 },
          { id: "card-art", artCompositionId: "card-art" }
        ]
      },
      unrelated: { name: "Unrelated", components: [] }
    }
  };
}

describe("migrateVotingCardAuthorWidget", () => {
  it("creates a stopped base visual prefab without lifecycle visibility commands", () => {
    const result = migrateVotingCardAuthorWidget(fixture(), "2026-07-13T00:00:00.000Z");
    const base = result.compositions[IDS.base];

    expect(base.name).toBe("Voting Card Author Text");
    expect(base.canvas).toEqual({ width: 340, height: 28 });
    expect(base.components).toEqual([
      expect.objectContaining({ kind: "text", instanceLabel: "authorText", defaultText: "AUTHOR NAME" })
    ]);
    expect(base.timeline.labels).toContainEqual({ name: "Default", frame: 0 });
    expect(base.timeline.commands).toEqual([{ id: "stop-0", frame: 0, type: "stop" }]);
    expect(base.timeline.commands.some((command) => command.type === "setVisible")).toBe(false);
  });

  it("makes the Author MC animate one labeled reference while preserving lifecycle timing", () => {
    const result = migrateVotingCardAuthorWidget(fixture(), "2026-07-13T00:00:00.000Z");
    const wrapper = result.compositions[IDS.wrapper];
    const reference = wrapper.components[0];

    expect(wrapper.components).toHaveLength(1);
    expect(reference).toEqual(expect.objectContaining({
      id: IDS.wrapperReference,
      kind: "reference",
      instanceLabel: "votingCardAuthorText",
      artCompositionId: IDS.base
    }));
    expect(wrapper.timeline.labels).toEqual(lifecycleTimeline().labels);
    expect(wrapper.timeline.commands).toEqual(lifecycleTimeline().commands);
    expect(wrapper.timeline.tracks[0]).toEqual(expect.objectContaining({
      id: `track-${IDS.wrapperReference}`,
      targetId: IDS.wrapperReference
    }));
    expect(wrapper.timeline.tracks[0].keyframes.map((keyframe) => keyframe.frame)).toEqual([0, 2]);
  });

  it("keeps one author layer in its existing container position and initializes it Off", () => {
    const result = migrateVotingCardAuthorWidget(fixture(), "2026-07-13T00:00:00.000Z");
    const components = result.compositions[IDS.container].components;

    expect(components.map((component) => component.id)).toEqual(["answer", IDS.containerReference, "card-art"]);
    expect(components[1]).toEqual(expect.objectContaining({
      instanceLabel: "author",
      x: 280,
      y: 32,
      width: 340,
      height: 28,
      defaultAnimationState: "Off",
      artCompositionId: IDS.wrapper
    }));
  });

  it("files the base prefab beside its wrapper and leaves unrelated compositions unchanged", () => {
    const source = fixture();
    const unrelated = structuredClone(source.compositions.unrelated);
    const result = migrateVotingCardAuthorWidget(source, "2026-07-13T00:00:00.000Z");

    expect(result.organization.stage.folderItems.crafting).toEqual([
      "composition:prefab-voting-card-mc",
      `composition:${IDS.base}`,
      `composition:${IDS.wrapper}`,
      "composition:unrelated"
    ]);
    expect(result.compositions.unrelated).toEqual(unrelated);
  });
});
