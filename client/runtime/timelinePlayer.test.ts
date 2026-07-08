import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { normalizeTimeline, timelinePlaybackDuration, timelineSegmentFor } from "../../shared/timeline-model";
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

  it("applies keyframe easing while interpolating numeric values", () => {
    const timeline = normalizeTimeline({
      fps: 10,
      frameCount: 5,
      labels: [{ name: "ease", frame: 0 }],
      commands: [{ frame: 4, type: "stop" }],
      tracks: [{ targetId: "card", keyframes: [{ frame: 0, easing: "easeIn", props: { x: 0 } }, { frame: 4, props: { x: 100 } }] }]
    });

    expect(timelineSnapshotAt(timeline!, 2).targets.card.x).toBe(25);
  });

  it("supports hold keyframes for stepped sprite-state timelines", () => {
    const timeline = normalizeTimeline({
      fps: 10,
      frameCount: 5,
      labels: [{ name: "hold", frame: 0 }],
      commands: [{ frame: 4, type: "stop" }],
      tracks: [{ targetId: "avatar", keyframes: [{ frame: 0, easing: "hold", props: { imageAssetId: "rex" } }, { frame: 4, props: { imageAssetId: "stego" } }] }]
    });

    expect(timelineSnapshotAt(timeline!, 2).targets.avatar.imageAssetId).toBe("rex");
    expect(timelineSnapshotAt(timeline!, 4).targets.avatar.imageAssetId).toBe("stego");
  });

  it("carries completion through gotoAndPlay commands", () => {
    const timeline = normalizeTimeline({
      fps: 10,
      frameCount: 8,
      labels: [
        { name: "appear", frame: 0 },
        { name: "loop", frame: 4 }
      ],
      commands: [
        { frame: 1, type: "gotoAndPlay", target: "loop" },
        { frame: 6, type: "stop" }
      ],
      tracks: []
    });
    const frames: number[] = [];
    const complete = vi.fn();
    const player = new TimelinePlayer({
      timeline,
      onFrame: (snapshot) => frames.push(snapshot.frame)
    });

    expect(player.gotoAndPlay("appear", { complete })).toBe(300);
    vi.advanceTimersByTime(100);
    expect(frames).toEqual([0, 1, 4]);
    expect(complete).not.toHaveBeenCalled();
    vi.advanceTimersByTime(200);
    expect(frames).toEqual([0, 1, 4, 5, 6]);
    expect(complete).toHaveBeenCalledTimes(1);
  });

  it("runs non-redirect commands on the starting frame when playing", () => {
    const timeline = normalizeTimeline({
      fps: 10,
      frameCount: 4,
      labels: [{ name: "appear", frame: 0 }],
      commands: [
        { frame: 0, type: "emit", event: "started" },
        { frame: 2, type: "stop" }
      ],
      tracks: []
    });
    const frames: number[] = [];
    const commands: string[] = [];
    const complete = vi.fn();
    const player = new TimelinePlayer({
      timeline,
      onFrame: (snapshot) => frames.push(snapshot.frame),
      onCommand: (command) => commands.push(command.event || command.type)
    });

    expect(player.gotoAndPlay("appear", { complete })).toBe(200);
    expect(frames).toEqual([0]);
    expect(commands).toEqual(["started"]);
    expect(complete).not.toHaveBeenCalled();

    vi.advanceTimersByTime(200);
    expect(frames).toEqual([0, 1, 2]);
    expect(complete).toHaveBeenCalledTimes(1);
  });

  it("redirects from the starting frame when a play command sits on a label", () => {
    const timeline = normalizeTimeline({
      fps: 10,
      frameCount: 6,
      labels: [
        { name: "appear", frame: 0 },
        { name: "settle", frame: 2 }
      ],
      commands: [
        { frame: 0, type: "gotoAndPlay", target: "settle" },
        { frame: 4, type: "stop" }
      ],
      tracks: []
    });
    const frames: number[] = [];
    const complete = vi.fn();
    const player = new TimelinePlayer({
      timeline,
      onFrame: (snapshot) => frames.push(snapshot.frame)
    });

    expect(timelinePlaybackDuration(timeline!, "appear")).toBe(200);
    expect(player.gotoAndPlay("appear", { complete })).toBe(200);
    expect(frames).toEqual([0, 2]);

    vi.advanceTimersByTime(200);
    expect(frames).toEqual([0, 2, 3, 4]);
    expect(complete).toHaveBeenCalledTimes(1);
  });

  it("carries completion through gotoAndStop commands", () => {
    const timeline = normalizeTimeline({
      fps: 10,
      frameCount: 5,
      labels: [
        { name: "appear", frame: 0 },
        { name: "parked", frame: 4 }
      ],
      commands: [{ frame: 1, type: "gotoAndStop", target: "parked" }],
      tracks: []
    });
    const frames: number[] = [];
    const complete = vi.fn();
    const player = new TimelinePlayer({
      timeline,
      onFrame: (snapshot) => frames.push(snapshot.frame)
    });

    expect(player.gotoAndPlay("appear", { complete })).toBe(100);
    vi.advanceTimersByTime(100);

    expect(frames).toEqual([0, 1, 4]);
    expect(complete).toHaveBeenCalledTimes(1);
    expect(player.isPlaying).toBe(false);
  });

  it("stops runaway gotoAndPlay command loops", () => {
    const timeline = normalizeTimeline({
      fps: 10,
      frameCount: 3,
      labels: [{ name: "loop", frame: 0 }],
      commands: [
        { frame: 0, type: "gotoAndPlay", target: "loop" },
        { frame: 0, type: "stop" }
      ],
      tracks: []
    });
    const commandLimit = vi.fn();
    const complete = vi.fn();
    const player = new TimelinePlayer({
      timeline,
      maxCommandRedirects: 3,
      onCommandLimit: commandLimit
    });

    player.gotoAndPlay("loop", { instant: true, complete });

    expect(commandLimit).toHaveBeenCalledWith({ frame: 0, commandCount: 4, maxCommandRedirects: 3 });
    expect(complete).toHaveBeenCalledTimes(1);
    expect(player.isPlaying).toBe(false);
  });

  it("stops runaway gotoAndStop command loops", () => {
    const timeline = normalizeTimeline({
      fps: 10,
      frameCount: 3,
      labels: [{ name: "park", frame: 0 }],
      commands: [{ frame: 0, type: "gotoAndStop", target: "park" }],
      tracks: []
    });
    const commandLimit = vi.fn();
    const complete = vi.fn();
    const player = new TimelinePlayer({
      timeline,
      maxCommandRedirects: 2,
      onCommandLimit: commandLimit
    });

    player.gotoAndStop("park", { complete });

    expect(commandLimit).toHaveBeenCalledWith({ frame: 0, commandCount: 3, maxCommandRedirects: 2 });
    expect(complete).toHaveBeenCalledTimes(1);
    expect(player.isPlaying).toBe(false);
  });
});
