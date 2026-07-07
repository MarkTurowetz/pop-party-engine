import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { normalizeTimeline, timelineSegmentFor } from "../../shared/timeline-model";
import { TimelinePlayer, timelineSnapshotAt } from "./timelinePlayer";

describe("TimelinePlayer", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("normalizes labels, commands, and sparse keyframes", () => {
    const timeline = normalizeTimeline({
      fps: 30,
      frameCount: 20,
      labels: [{ name: "appear", frame: 2 }],
      commands: [{ frame: 8, type: "stop" }],
      tracks: [{ targetId: "card", keyframes: [{ frame: 2, props: { scale: 0.5 } }, { frame: 8, props: { scale: 1 } }] }]
    });

    expect(timeline?.labels).toEqual([{ name: "appear", frame: 2 }]);
    expect(timelineSegmentFor(timeline!, "appear")).toMatchObject({ startFrame: 2, endFrame: 8, durationMs: 200 });
    expect(timelineSnapshotAt(timeline!, 5).targets.card.scale).toBe(0.75);
  });

  it("plays from a label until the next stop command", () => {
    const timeline = normalizeTimeline({
      fps: 10,
      frameCount: 10,
      labels: [{ name: "pop", frame: 1 }],
      commands: [{ frame: 4, type: "stop" }],
      tracks: [{ targetId: "name", keyframes: [{ frame: 1, props: { x: 0 } }, { frame: 4, props: { x: 30 } }] }]
    });
    const frames: number[] = [];
    const complete = vi.fn();
    const player = new TimelinePlayer({
      timeline,
      onFrame: (snapshot) => frames.push(snapshot.frame)
    });

    expect(player.gotoAndPlay("pop", { complete })).toBe(300);
    expect(frames).toEqual([1]);

    vi.advanceTimersByTime(100);
    expect(frames).toEqual([1, 2]);
    vi.advanceTimersByTime(200);
    expect(frames).toEqual([1, 2, 3, 4]);
    expect(complete).toHaveBeenCalledTimes(1);
  });

  it("gotoAndStop applies the labeled frame immediately", () => {
    const timeline = normalizeTimeline({
      fps: 12,
      frameCount: 5,
      labels: [{ name: "stego", frame: 3 }],
      commands: [{ frame: 3, type: "stop" }],
      tracks: [{ targetId: "dino", keyframes: [{ frame: 3, props: { imageAssetId: "stego" } }] }]
    });
    const snapshots: Array<Record<string, unknown>> = [];
    const player = new TimelinePlayer({
      timeline,
      onFrame: (snapshot) => snapshots.push(snapshot.targets.dino)
    });

    expect(player.gotoAndStop("stego")).toBe(0);
    expect(snapshots).toEqual([{ imageAssetId: "stego" }]);
    expect(player.currentFrame).toBe(3);
  });
});
