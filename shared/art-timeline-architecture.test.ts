import { describe, expect, it } from "vitest";
import {
  ART_TIMELINE_ARCHITECTURE_VERSION,
  collectArtArchitectureIssues,
  migrateArtTimelineArchitecture,
  suggestedArtInstanceLabel,
  validArtInstanceLabel
} from "./art-timeline-architecture";

describe("Art timeline architecture", () => {
  it("performs the one-time destructive track reset while preserving labels and commands", () => {
    const source = [{
      id: "host",
      timeline: {
        fps: 24,
        frameCount: 20,
        labels: [{ name: "appear", frame: 2 }, { name: "Custom", frame: 8 }],
        commands: [
          { frame: 2, type: "gotoAndStop", target: "appear" },
          { frame: 3, type: "playComponent", target: "Child", event: "appear" }
        ],
        tracks: [{ targetId: "child-id", keyframes: [{ frame: 2, props: { x: 10 } }] }]
      },
      components: [{
        id: "child-id",
        name: "Child",
        kind: "reference",
        artCompositionId: "child-definition",
        timeline: { fps: 30, frameCount: 2, labels: [], commands: [], tracks: [] }
      }]
    }, {
      id: "child-definition",
      timelineArchitectureVersion: ART_TIMELINE_ARCHITECTURE_VERSION,
      timeline: { fps: 24, frameCount: 3, labels: [{ name: "Appear", frame: 0 }], commands: [], tracks: [] },
      components: []
    }];

    const result = migrateArtTimelineArchitecture(source);
    const migrated = result.compositions[0];
    expect(result.issues).toEqual([]);
    expect(result.removedTrackCount).toBe(1);
    expect(result.removedKeyframeCount).toBe(1);
    expect(result.removedComponentTimelineCount).toBe(1);
    expect(migrated.timelineArchitectureVersion).toBe(ART_TIMELINE_ARCHITECTURE_VERSION);
    expect((migrated.timeline as { fps: number; frameCount: number }).fps).toBe(24);
    expect((migrated.timeline as { fps: number; frameCount: number }).frameCount).toBe(20);
    expect((migrated.timeline as { labels: Array<{ name: string }> }).labels.map((label) => label.name)).toEqual(["Appear", "Custom"]);
    expect((migrated.timeline as { tracks: unknown[] }).tracks).toEqual([]);
    expect((migrated.timeline as { commands: Array<{ target?: string; event?: string }> }).commands).toEqual([
      expect.objectContaining({ target: "Appear" }),
      expect.objectContaining({ target: "child-id", event: "Appear" })
    ]);
    expect(migrated.components?.[0].instanceLabel).toBe("child");
    expect(migrated.components?.[0].timeline).toBeUndefined();

    const rerun = migrateArtTimelineArchitecture(result.compositions);
    expect(rerun.migratedCompositionIds).toEqual([]);
  });

  it("quarantines lifecycle collisions and reference cycles", () => {
    const result = migrateArtTimelineArchitecture([
      {
        id: "a",
        timeline: { fps: 30, frameCount: 2, labels: [{ name: "appear", frame: 0 }, { name: "Appear", frame: 1 }], commands: [], tracks: [] },
        components: [{ id: "to-b", kind: "reference", artCompositionId: "b" }]
      },
      { id: "b", components: [{ id: "to-a", kind: "reference", artCompositionId: "a" }] }
    ]);
    expect(result.migratedCompositionIds).toEqual([]);
    expect(result.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining(["lifecycle-label-collision", "reference-cycle"]));
  });

  it("uses lower-camel, non-reserved instance labels", () => {
    expect(suggestedArtInstanceLabel("Answer Bubble")).toBe("answerBubble");
    expect(validArtInstanceLabel("answerBubble2")).toBe(true);
    expect(validArtInstanceLabel("AnswerBubble")).toBe(false);
    expect(validArtInstanceLabel("constructor")).toBe(false);
  });

  it("rejects versioned commands that cross a prefab boundary or store labels instead of ids", () => {
    const issues = collectArtArchitectureIssues([
      {
        id: "host",
        timelineArchitectureVersion: ART_TIMELINE_ARCHITECTURE_VERSION,
        timeline: {
          fps: 30,
          frameCount: 2,
          labels: [{ name: "Appear", frame: 0 }],
          commands: [{ frame: 0, type: "playComponent", target: "child", event: "Appear" }],
          tracks: []
        },
        components: [{ id: "child-id", instanceLabel: "child", kind: "reference", artCompositionId: "definition" }]
      },
      {
        id: "definition",
        timelineArchitectureVersion: ART_TIMELINE_ARCHITECTURE_VERSION,
        timeline: { fps: 30, frameCount: 2, labels: [{ name: "Appear", frame: 0 }], commands: [], tracks: [] },
        components: [{ id: "grandchild", instanceLabel: "grandchild", kind: "shape" }]
      }
    ]);
    expect(issues.map((issue) => issue.code)).toContain("noncanonical-command-target");
  });
});
