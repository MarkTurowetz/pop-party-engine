import { describe, expect, it } from "vitest";
import { defaultPlayerPointPopupTimeline } from "./player-point-popup-timeline";

describe("defaultPlayerPointPopupTimeline", () => {
  it("defines a complete point popup appear timeline for editable prefab art", () => {
    const timeline = defaultPlayerPointPopupTimeline();

    expect(timeline.labels.map((label) => label.name)).toEqual(["park", "off", "on", "appear", "update", "disappear"]);
    expect(timeline.commands).toContainEqual({ frame: 45, type: "stop" });
    expect(timeline.tracks.map((track) => track.targetId)).toEqual(["point-text", "point-shadow"]);
    expect(timeline.tracks[0].keyframes[0]).toMatchObject({ frame: 0, props: { opacity: 0, scale: 0 } });
    expect(timeline.tracks[0].keyframes[timeline.tracks[0].keyframes.length - 1]).toMatchObject({
      frame: 45,
      props: { opacity: 0, scale: 0 }
    });
  });
});
