import { describe, expect, it } from "vitest";
import { defaultPlayerPointPopupTimeline, migratePlayerPointPopupTimeline } from "./player-point-popup-timeline";

describe("defaultPlayerPointPopupTimeline", () => {
  it("defines a 1.5 second fire-and-forget Popup animation", () => {
    const timeline = defaultPlayerPointPopupTimeline();

    expect(timeline.labels.map((label) => label.name)).toEqual(["Park", "Off", "On", "Appear", "Update", "Disappear", "Popup"]);
    expect(timeline.labels).toContainEqual({ name: "Popup", frame: 33 });
    expect(timeline.commands).toContainEqual({ frame: 0, type: "setVisible", target: "false" });
    expect(timeline.commands).toContainEqual({ frame: 33, type: "setVisible", target: "true" });
    expect(timeline.commands).toContainEqual({ frame: 78, type: "setVisible", target: "false" });
    expect(timeline.commands).toContainEqual({ frame: 78, type: "stop" });
    expect((78 - 33) / timeline.fps).toBe(1.5);
    expect(timeline.tracks.map((track) => track.targetId)).toEqual(["point-text", "point-shadow"]);
    expect(timeline.tracks[0].keyframes.find((keyframe) => keyframe.frame === 33)).toMatchObject({
      frame: 33,
      props: { opacity: 1, scale: 1, y: 30 }
    });
    expect(timeline.tracks[0].keyframes[timeline.tracks[0].keyframes.length - 1]).toMatchObject({
      frame: 78,
      props: { opacity: 0, scale: 1, y: -2 }
    });
  });

  it("upgrades a saved legacy popup timeline once and preserves current authored Popup edits", () => {
    const legacy = { fps: 30, frameCount: 2, labels: [{ name: "Appear", frame: 1 }], commands: [], tracks: [] };
    const migrated = migratePlayerPointPopupTimeline("player-point-popup", legacy);
    expect(migrated).not.toBe(legacy);
    expect(migrated?.labels.map((label) => label.name)).toContain("Popup");
    expect(migratePlayerPointPopupTimeline("player-point-popup", migrated)).toBe(migrated);
  });
});
