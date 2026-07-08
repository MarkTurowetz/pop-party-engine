import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ArtComponent } from "../../types/game-data";
import { playArtTimelinePreview } from "./artTimelinePreviewPlayer";

describe("playArtTimelinePreview", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("merges nested emitted timeline snapshots into parent preview frames", () => {
    const child: ArtComponent = {
      id: "child",
      kind: "shape",
      timeline: {
        fps: 10,
        frameCount: 3,
        labels: [{ name: "pop", frame: 0 }],
        commands: [{ frame: 2, type: "stop" }],
        tracks: [{ targetId: "child", keyframes: [{ frame: 0, props: { x: 10 } }, { frame: 2, props: { x: 30 } }] }]
      }
    };
    const root: ArtComponent = { id: "root", kind: "container", children: [child] };
    const previews: Array<{ frame: number; rootOpacity?: number; childX?: number }> = [];
    const playback = playArtTimelinePreview({
      component: root,
      start: "appear",
      timeline: {
        fps: 10,
        frameCount: 4,
        labels: [{ name: "appear", frame: 0 }],
        commands: [
          { frame: 1, type: "emit", target: "child", event: "pop" },
          { frame: 3, type: "stop" }
        ],
        tracks: [{ targetId: "root", keyframes: [{ frame: 0, props: { opacity: 0 } }, { frame: 3, props: { opacity: 1 } }] }]
      },
      onPreview: (frame, overrides) => {
        previews.push({
          frame,
          rootOpacity: overrides.root?.opacity as number | undefined,
          childX: overrides.child?.x as number | undefined
        });
      }
    });

    vi.advanceTimersByTime(300);
    playback.stop();

    expect(previews).toEqual([
      { frame: 0, rootOpacity: 0, childX: undefined },
      { frame: 1, rootOpacity: 0.333, childX: undefined },
      { frame: 1, rootOpacity: 0.333, childX: 10 },
      { frame: 2, rootOpacity: 0.667, childX: 10 },
      { frame: 2, rootOpacity: 0.667, childX: 20 },
      { frame: 3, rootOpacity: 1, childX: 20 },
      { frame: 3, rootOpacity: 1, childX: 30 }
    ]);
  });

  it("plays nested component timelines from playComponent commands", () => {
    const child: ArtComponent = {
      id: "child",
      kind: "shape",
      timeline: {
        fps: 10,
        frameCount: 2,
        labels: [{ name: "pop", frame: 0 }],
        commands: [{ frame: 1, type: "stop" }],
        tracks: [{ targetId: "child", keyframes: [{ frame: 0, props: { scale: 0.5 } }, { frame: 1, props: { scale: 1 } }] }]
      }
    };
    const root: ArtComponent = { id: "root", kind: "container", children: [child] };
    const scales: unknown[] = [];
    const playback = playArtTimelinePreview({
      component: root,
      start: "appear",
      timeline: {
        fps: 10,
        frameCount: 3,
        labels: [{ name: "appear", frame: 0 }],
        commands: [
          { frame: 1, type: "playComponent", target: "child", event: "pop" },
          { frame: 2, type: "stop" }
        ],
        tracks: []
      },
      onPreview: (_frame, overrides) => {
        if (overrides.child?.scale !== undefined) scales.push(overrides.child.scale);
      }
    });

    vi.advanceTimersByTime(200);
    playback.stop();

    expect(scales).toEqual([0.5, 0.5, 1]);
  });

  it("plays nested component timelines from commands on the starting frame", () => {
    const child: ArtComponent = {
      id: "child",
      kind: "shape",
      timeline: {
        fps: 10,
        frameCount: 2,
        labels: [{ name: "pop", frame: 0 }],
        commands: [{ frame: 1, type: "stop" }],
        tracks: [{ targetId: "child", keyframes: [{ frame: 0, props: { scale: 0.5 } }, { frame: 1, props: { scale: 1 } }] }]
      }
    };
    const root: ArtComponent = { id: "root", kind: "container", children: [child] };
    const scales: unknown[] = [];
    const playback = playArtTimelinePreview({
      component: root,
      start: "appear",
      timeline: {
        fps: 10,
        frameCount: 3,
        labels: [{ name: "appear", frame: 0 }],
        commands: [
          { frame: 0, type: "playComponent", target: "child", event: "pop" },
          { frame: 2, type: "stop" }
        ],
        tracks: []
      },
      onPreview: (_frame, overrides) => {
        if (overrides.child?.scale !== undefined) scales.push(overrides.child.scale);
      }
    });

    vi.advanceTimersByTime(200);
    playback.stop();

    expect(scales).toEqual([0.5, 1, 1, 1]);
  });

  it("stops nested component timelines at labels from stopComponent commands", () => {
    const child: ArtComponent = {
      id: "child",
      kind: "shape",
      timeline: {
        fps: 10,
        frameCount: 5,
        labels: [
          { name: "rex", frame: 1 },
          { name: "stego", frame: 3 }
        ],
        commands: [],
        tracks: [{ targetId: "child", keyframes: [{ frame: 1, props: { imageAssetId: "rex" } }, { frame: 3, props: { imageAssetId: "stego" } }] }]
      }
    };
    const root: ArtComponent = { id: "root", kind: "container", children: [child] };
    const images: unknown[] = [];
    const playback = playArtTimelinePreview({
      component: root,
      start: "appear",
      timeline: {
        fps: 10,
        frameCount: 3,
        labels: [{ name: "appear", frame: 0 }],
        commands: [
          { frame: 1, type: "stopComponent", target: "child", event: "stego" },
          { frame: 2, type: "stop" }
        ],
        tracks: []
      },
      onPreview: (_frame, overrides) => {
        if (overrides.child?.imageAssetId !== undefined) images.push(overrides.child.imageAssetId);
      }
    });

    vi.advanceTimersByTime(200);
    playback.stop();

    expect(images).toEqual(["stego", "stego"]);
  });
});
