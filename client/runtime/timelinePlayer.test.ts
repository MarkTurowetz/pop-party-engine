import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { normalizeTimeline, timelinePlaybackDuration, timelineSegmentFor } from "../../shared/timeline-model";
import { TimelinePlayer, timelineSnapshotAt, timelineSnapshotAtPosition } from "./timelinePlayer";

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
      tracks: [{ targetId: "card", keyframes: [{ frame: 2, easing: "linear", props: { scale: 0.5 } }, { frame: 8, props: { scale: 1 } }] }]
    });

    expect(timeline?.labels).toEqual([{ name: "appear", frame: 2 }]);
    expect(timelineSegmentFor(timeline!, "appear")).toMatchObject({ startFrame: 2, endFrame: 8, durationMs: 200 });
    expect(timelineSnapshotAt(timeline!, 5).targets.card.scale).toBe(0.75);
  });

  it("seeks a normalized authored progress range without executing timeline commands", () => {
    const frames: Array<{ frame: number; scale: unknown }> = [];
    const command = vi.fn();
    const timeline = normalizeTimeline({
      fps: 10,
      frameCount: 12,
      labels: [
        { name: "Off", frame: 0 },
        { name: "HoldStart", frame: 1 },
        { name: "HoldComplete", frame: 11 }
      ],
      commands: [
        { frame: 6, type: "emit", event: "halfway" },
        { frame: 11, type: "stop" }
      ],
      tracks: [{ targetId: "meter", keyframes: [
        { frame: 1, easing: "linear", props: { scale: 0 } },
        { frame: 11, props: { scale: 1 } }
      ] }]
    });
    const player = new TimelinePlayer({
      timeline,
      onFrame: (snapshot) => frames.push({ frame: snapshot.frame, scale: snapshot.targets.meter.scale }),
      onCommand: command
    });

    expect(player.seekProgress("HoldStart", "HoldComplete", 0.5)).toBe(true);
    expect(frames.at(-1)).toEqual({ frame: 6, scale: 0.5 });
    expect(command).not.toHaveBeenCalled();
    expect(player.seekProgress("missing", "HoldComplete", 1)).toBe(false);
  });

  it("normalizes and applies explicit clockwise and counterclockwise full rotations", () => {
    const clockwise = normalizeTimeline({
      fps: 30,
      frameCount: 11,
      labels: [],
      commands: [],
      tracks: [{ targetId: "fan", keyframes: [
        { frame: 0, easing: "linear", props: { rotation: 0 }, rotationDirection: "clockwise", rotationTurns: 2 },
        { frame: 10, props: { rotation: 0 } }
      ] }]
    })!;
    const counterclockwise = normalizeTimeline({
      ...clockwise,
      tracks: [{ targetId: "fan", keyframes: [
        { frame: 0, easing: "linear", props: { rotation: 0 }, rotationDirection: "counterclockwise", rotationTurns: 2 },
        { frame: 10, props: { rotation: 0 } }
      ] }]
    })!;

    expect(clockwise.tracks[0].keyframes[0]).toMatchObject({ rotationDirection: "clockwise", rotationTurns: 2 });
    expect(timelineSnapshotAtPosition(clockwise, 5).targets.fan.rotation).toBe(360);
    expect(timelineSnapshotAtPosition(counterclockwise, 5).targets.fan.rotation).toBe(-360);
    expect(timelineSnapshotAt(clockwise, 10).targets.fan.rotation).toBe(0);
  });

  it("restarts an authored loop without exhausting redirect protection", () => {
    const frames: number[] = [];
    const timeline = normalizeTimeline({
      fps: 10,
      frameCount: 2,
      labels: [{ name: "Idle", frame: 0 }],
      commands: [{ frame: 1, type: "loop", target: "Idle" }],
      tracks: [{ targetId: "fan", keyframes: [
        { frame: 0, easing: "linear", props: { rotation: 0 }, rotationDirection: "clockwise", rotationTurns: 1 },
        { frame: 1, props: { rotation: 0 } }
      ] }]
    });
    const player = new TimelinePlayer({ timeline, onFrame: (snapshot) => frames.push(snapshot.frame), maxCommandRedirects: 1 });

    player.gotoAndPlay("Idle");
    vi.advanceTimersByTime(350);
    player.stop();
    expect(frames.filter((frame) => frame === 0).length).toBeGreaterThanOrEqual(3);
    expect(frames.filter((frame) => frame === 1).length).toBeGreaterThanOrEqual(3);
  });

  it("normalizes command target and event fields by command type", () => {
    const timeline = normalizeTimeline({
      fps: 30,
      frameCount: 20,
      labels: [],
      commands: [
        { frame: 1, type: "stop", target: "stale", event: "ignored" },
        { frame: 2, type: "gotoAndPlay", target: "appear", event: "ignored" },
        { frame: 3, type: "playComponent", target: "child", event: "pop" }
      ],
      tracks: []
    });

    expect(timeline?.commands).toEqual([
      { frame: 1, type: "stop" },
      { frame: 2, type: "gotoAndPlay", target: "appear" },
      { frame: 3, type: "playComponent", target: "child", event: "pop" }
    ]);
  });

  it("preserves scoped component targets through normalization", () => {
    const timeline = normalizeTimeline({
      fps: 30,
      frameCount: 20,
      labels: [],
      commands: [{ frame: 3, type: "playComponent", target: "player/bubble/text", event: "pop" }],
      tracks: [{ targetId: "player/bubble/text", keyframes: [{ frame: 3, props: { defaultText: "Scoped" } }] }]
    });

    expect(timeline?.commands[0]).toMatchObject({ target: "player/bubble/text" });
    expect(timeline?.tracks[0].targetId).toBe("player/bubble/text");
    expect(timelineSnapshotAt(timeline!, 3).targets["player/bubble/text"].defaultText).toBe("Scoped");
  });

  it("preserves authored command order within the same frame", () => {
    const timeline = normalizeTimeline({
      fps: 30,
      frameCount: 5,
      labels: [],
      commands: [
        { frame: 2, type: "gotoAndPlay", target: "settle" },
        { frame: 2, type: "emit", event: "started" },
        { frame: 1, type: "stop" }
      ],
      tracks: []
    });

    expect(timeline?.commands.map((command) => command.type)).toEqual(["stop", "gotoAndPlay", "emit"]);
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

  it("plays editor preview from the current frame to the next future stop", () => {
    const timeline = normalizeTimeline({
      fps: 10,
      frameCount: 8,
      labels: [{ name: "park", frame: 0 }],
      commands: [
        { frame: 0, type: "stop" },
        { frame: 4, type: "stop" }
      ],
      tracks: [{ targetId: "card", keyframes: [{ frame: 0, props: { x: 0 } }, { frame: 4, props: { x: 40 } }] }]
    });
    const frames: number[] = [];
    const complete = vi.fn();
    const player = new TimelinePlayer({
      timeline,
      onFrame: (snapshot) => frames.push(snapshot.frame)
    });

    expect(player.playFromFrame(0, { complete })).toBe(400);
    expect(frames).toEqual([0]);

    vi.advanceTimersByTime(400);
    expect(frames).toEqual([0, 1, 2, 3, 4]);
    expect(complete).toHaveBeenCalledTimes(1);
  });

  it("clears scheduled frame handles as timeline playback advances", () => {
    const timeline = normalizeTimeline({
      fps: 10,
      frameCount: 4,
      labels: [{ name: "appear", frame: 0 }],
      commands: [{ frame: 3, type: "stop" }],
      tracks: []
    });
    const player = new TimelinePlayer({ timeline });

    player.gotoAndPlay("appear");
    expect(player.timerIds.size).toBe(3);

    vi.advanceTimersByTime(100);
    expect(player.timerIds.size).toBe(2);
    vi.advanceTimersByTime(200);
    expect(player.timerIds.size).toBe(0);
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
    expect(timelineSnapshotAtPosition(timeline!, 2.5).targets.card.x).toBe(39.063);
  });

  it("interpolates browser playback from elapsed paint time", () => {
    const timeline = normalizeTimeline({
      fps: 10,
      frameCount: 3,
      labels: [{ name: "appear", frame: 0 }],
      commands: [{ frame: 2, type: "stop" }],
      tracks: [{ targetId: "card", keyframes: [{ frame: 0, easing: "linear", props: { x: 0 } }, { frame: 2, props: { x: 100 } }] }]
    });
    let now = 0;
    let nextFrameId = 1;
    const callbacks = new Map<number, (timestamp: number) => void>();
    const snapshots: Array<{ frame: number; x: unknown }> = [];
    const complete = vi.fn();
    const player = new TimelinePlayer({
      timeline,
      now: () => now,
      requestAnimationFrame: (callback) => {
        const id = nextFrameId++;
        callbacks.set(id, callback);
        return id;
      },
      cancelAnimationFrame: (id) => callbacks.delete(id),
      onFrame: (snapshot) => snapshots.push({ frame: snapshot.frame, x: snapshot.targets.card.x })
    });
    const paintAt = (timestamp: number) => {
      now = timestamp;
      const pending = Array.from(callbacks.values());
      callbacks.clear();
      for (const callback of pending) callback(timestamp);
    };

    expect(player.gotoAndPlay("appear", { complete })).toBe(200);
    paintAt(50);
    paintAt(100);
    paintAt(200);

    expect(snapshots).toEqual([
      { frame: 0, x: 0 },
      { frame: 0, x: 25 },
      { frame: 1, x: 50 },
      { frame: 2, x: 100 }
    ]);
    expect(complete).toHaveBeenCalledTimes(1);
    expect(player.isPlaying).toBe(false);
  });

  it("fires every crossed command once when a browser paint skips authored frames", () => {
    const timeline = normalizeTimeline({
      fps: 10,
      frameCount: 4,
      labels: [{ name: "appear", frame: 0 }],
      commands: [
        { frame: 1, type: "emit", event: "one" },
        { frame: 2, type: "emit", event: "two" },
        { frame: 3, type: "stop" }
      ],
      tracks: []
    });
    let now = 0;
    let callback: ((timestamp: number) => void) | null = null;
    const commands: Array<{ event: string; elapsedMs: number }> = [];
    const complete = vi.fn();
    const player = new TimelinePlayer({
      timeline,
      now: () => now,
      requestAnimationFrame: (next) => {
        callback = next;
        return 1;
      },
      cancelAnimationFrame: () => {
        callback = null;
      },
      onCommand: (command, context) => commands.push({ event: command.event || command.type, elapsedMs: context.elapsedMs })
    });

    player.gotoAndPlay("appear", { complete });
    now = 300;
    const paint = callback as ((timestamp: number) => void) | null;
    paint?.(now);

    expect(commands).toEqual([
      { event: "one", elapsedMs: 100 },
      { event: "two", elapsedMs: 200 },
      { event: "stop", elapsedMs: 300 }
    ]);
    expect(complete).toHaveBeenCalledTimes(1);
  });

  it("holds values from the previous keyframe unless easing is explicitly tweened", () => {
    const held = normalizeTimeline({
      fps: 30,
      frameCount: 20,
      labels: [],
      commands: [],
      tracks: [{ targetId: "text", keyframes: [{ frame: 2, props: { scale: 1 } }, { frame: 17, props: { scale: 2 } }] }]
    });
    const tweened = normalizeTimeline({
      fps: 30,
      frameCount: 20,
      labels: [],
      commands: [],
      tracks: [{ targetId: "text", keyframes: [{ frame: 2, easing: "linear", props: { scale: 1 } }, { frame: 17, props: { scale: 2 } }] }]
    });

    expect(timelineSnapshotAt(held!, 4).targets.text.scale).toBe(1);
    expect(timelineSnapshotAt(held!, 16).targets.text.scale).toBe(1);
    expect(timelineSnapshotAt(held!, 17).targets.text.scale).toBe(2);
    expect(timelineSnapshotAt(tweened!, 4).targets.text.scale).toBe(1.133);
  });

  it("does not apply future keyframes before a track starts", () => {
    const timeline = normalizeTimeline({
      fps: 10,
      frameCount: 8,
      labels: [],
      commands: [],
      tracks: [{ targetId: "card", keyframes: [{ frame: 3, easing: "linear", props: { x: 30 } }, { frame: 6, props: { x: 60 } }] }]
    });

    expect(timelineSnapshotAt(timeline!, 2).targets.card).toEqual({});
    expect(timelineSnapshotAt(timeline!, 3).targets.card.x).toBe(30);
    expect(timelineSnapshotAt(timeline!, 5).targets.card.x).toBe(50);
    expect(timelineSnapshotAt(timeline!, 7).targets.card.x).toBe(60);
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

  it("plays any copied label as an ordinary animation segment", () => {
    const timeline = normalizeTimeline({
      fps: 10,
      frameCount: 8,
      labels: [
        { name: "appear", frame: 0 },
        { name: "bounce", frame: 4 }
      ],
      commands: [
        { frame: 2, type: "stop" },
        { frame: 7, type: "stop" }
      ],
      tracks: [
        {
          targetId: "card",
          keyframes: [
            { frame: 4, easing: "linear", props: { scale: 1.4 } },
            { frame: 7, props: { scale: 1 } }
          ]
        }
      ]
    });
    const frames: number[] = [];
    const scales: unknown[] = [];
    const complete = vi.fn();
    const player = new TimelinePlayer({
      timeline,
      onFrame: (snapshot) => {
        frames.push(snapshot.frame);
        scales.push(snapshot.targets.card?.scale);
      }
    });

    expect(player.gotoAndPlay("bounce", { complete })).toBe(300);
    vi.advanceTimersByTime(300);

    expect(frames).toEqual([4, 5, 6, 7]);
    expect(scales).toEqual([1.4, 1.267, 1.133, 1]);
    expect(complete).toHaveBeenCalledTimes(1);
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

  it("passes frame timing context to timeline command handlers", () => {
    const timeline = normalizeTimeline({
      fps: 10,
      frameCount: 5,
      labels: [{ name: "appear", frame: 0 }],
      commands: [
        { frame: 0, type: "emit", event: "start" },
        { frame: 2, type: "playComponent", target: "child", event: "pop" },
        { frame: 4, type: "stop" }
      ],
      tracks: []
    });
    const contexts: Array<{ event: string; frame: number; elapsedMs: number }> = [];
    const player = new TimelinePlayer({
      timeline,
      onCommand: (command, context) =>
        contexts.push({
          event: command.event || command.type,
          frame: context.frame,
          elapsedMs: context.elapsedMs
        })
    });

    player.gotoAndPlay("appear");
    expect(contexts).toEqual([{ event: "start", frame: 0, elapsedMs: 0 }]);

    vi.advanceTimersByTime(200);
    expect(contexts).toEqual([
      { event: "start", frame: 0, elapsedMs: 0 },
      { event: "pop", frame: 2, elapsedMs: 200 }
    ]);
  });

  it("passes end-frame timing context to instant timeline commands", () => {
    const timeline = normalizeTimeline({
      fps: 10,
      frameCount: 5,
      labels: [{ name: "appear", frame: 0 }],
      commands: [
        { frame: 4, type: "playComponent", target: "child", event: "settle" },
        { frame: 4, type: "stop" }
      ],
      tracks: []
    });
    const contexts: Array<{ event: string; frame: number; elapsedMs: number }> = [];
    const player = new TimelinePlayer({
      timeline,
      onCommand: (command, context) =>
        contexts.push({
          event: command.event || command.type,
          frame: context.frame,
          elapsedMs: context.elapsedMs
        })
    });

    player.gotoAndPlay("appear", { instant: true });

    expect(contexts).toEqual([
      { event: "settle", frame: 4, elapsedMs: 400 },
      { event: "stop", frame: 4, elapsedMs: 400 }
    ]);
  });

  it("passes normalized command ids through runtime command callbacks", () => {
    const timeline = normalizeTimeline({
      fps: 10,
      frameCount: 4,
      labels: [{ name: "appear", frame: 0 }],
      commands: [
        { id: "play-child-pop", frame: 1, type: "playComponent", target: "child", event: "pop" },
        { frame: 2, type: "stop" }
      ],
      tracks: []
    });
    const commandIds: Array<string | undefined> = [];
    const durationCommandIds: Array<string | undefined> = [];
    const player = new TimelinePlayer({
      timeline,
      onCommand: (command) => commandIds.push(command.id),
      commandDuration: (command) => {
        durationCommandIds.push(command.id);
        return 0;
      }
    });

    expect(player.gotoAndPlay("appear")).toBe(200);
    vi.advanceTimersByTime(100);

    expect(commandIds).toEqual(["play-child-pop"]);
    expect(durationCommandIds).toContain("play-child-pop");
  });

  it("includes non-redirect command durations in timeline playback duration", () => {
    const timeline = normalizeTimeline({
      fps: 10,
      frameCount: 4,
      labels: [{ name: "appear", frame: 0 }],
      commands: [
        { frame: 1, type: "playComponent", target: "child", event: "pop" },
        { frame: 2, type: "stop" }
      ],
      tracks: []
    });

    expect(
      timelinePlaybackDuration(timeline!, "appear", {
        commandDuration: (command) => (command.type === "playComponent" ? 500 : 0)
      })
    ).toBe(600);
  });

  it("completes playback at its own terminal frame without waiting for child command durations", () => {
    const timeline = normalizeTimeline({
      fps: 10,
      frameCount: 4,
      labels: [{ name: "appear", frame: 0 }],
      commands: [
        { frame: 1, type: "playComponent", target: "child", event: "pop" },
        { frame: 2, type: "stop" }
      ],
      tracks: []
    });
    const commands: string[] = [];
    const complete = vi.fn();
    const player = new TimelinePlayer({
      timeline,
      onCommand: (command) => commands.push(command.event || command.type),
      commandDuration: (command) => (command.type === "playComponent" ? 500 : 0)
    });

    expect(player.gotoAndPlay("appear", { complete })).toBe(600);
    vi.advanceTimersByTime(100);
    expect(commands).toEqual(["pop"]);
    expect(complete).not.toHaveBeenCalled();

    vi.advanceTimersByTime(100);
    expect(complete).toHaveBeenCalledTimes(1);
    expect(player.isPlaying).toBe(false);
  });

  it("completes gotoAndStop at its own selected frame without waiting for child commands", () => {
    const timeline = normalizeTimeline({
      fps: 10,
      frameCount: 4,
      labels: [{ name: "parked", frame: 2 }],
      commands: [{ frame: 2, type: "playComponent", target: "child", event: "park-pop" }],
      tracks: []
    });
    const commands: string[] = [];
    const complete = vi.fn();
    const player = new TimelinePlayer({
      timeline,
      onCommand: (command) => commands.push(command.event || command.type),
      commandDuration: (command) => (command.type === "playComponent" ? 300 : 0)
    });

    expect(player.gotoAndStop("parked", { complete })).toBe(300);
    expect(commands).toEqual(["park-pop"]);
    expect(complete).toHaveBeenCalledTimes(1);
  });

  it("ignores invalid stopped-frame command durations", () => {
    const timeline = normalizeTimeline({
      fps: 10,
      frameCount: 3,
      labels: [{ name: "parked", frame: 1 }],
      commands: [{ frame: 1, type: "playComponent", target: "child", event: "bad-duration" }],
      tracks: []
    });
    const complete = vi.fn();
    const player = new TimelinePlayer({
      timeline,
      commandDuration: () => Number.NaN
    });

    expect(player.gotoAndStop("parked", { complete })).toBe(0);
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
