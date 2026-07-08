import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ArtComponent, ArtComposition } from "../../types/game-data";
import { artTimelinePlaybackDuration, playArtTimelinePreview } from "./artTimelinePreviewPlayer";

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

  it("scopes nested component preview overrides to path targets", () => {
    const child: ArtComponent = {
      id: "child",
      kind: "container",
      children: [{ id: "label", kind: "text" }],
      timeline: {
        fps: 10,
        frameCount: 2,
        labels: [{ name: "pop", frame: 0 }],
        commands: [{ frame: 1, type: "stop" }],
        tracks: [
          { targetId: "self", keyframes: [{ frame: 0, props: { scale: 0.5 } }, { frame: 1, props: { scale: 1 } }] },
          { targetId: "label", keyframes: [{ frame: 0, props: { defaultText: "A" } }, { frame: 1, props: { defaultText: "B" } }] }
        ]
      }
    };
    const root: ArtComponent = { id: "root", kind: "container", children: [child] };
    const scopedFrames: Array<Record<string, unknown>> = [];
    const playback = playArtTimelinePreview({
      component: root,
      start: "appear",
      timeline: {
        fps: 10,
        frameCount: 3,
        labels: [{ name: "appear", frame: 0 }],
        commands: [
          { frame: 1, type: "playComponent", target: "root/child", event: "pop" },
          { frame: 2, type: "stop" }
        ],
        tracks: []
      },
      onPreview: (_frame, overrides) => scopedFrames.push(overrides)
    });

    vi.advanceTimersByTime(200);
    playback.stop();

    expect(scopedFrames.some((frame) => (frame["root/child"] as { scale?: number } | undefined)?.scale === 0.5)).toBe(true);
    expect(scopedFrames.some((frame) => (frame["root/child/label"] as { defaultText?: string } | undefined)?.defaultText === "B")).toBe(true);
    expect(scopedFrames.every((frame) => frame.child === undefined && frame.label === undefined)).toBe(true);
  });

  it("previews composition timelines without requiring the synthetic root in target ids", () => {
    const root: ArtComponent = {
      id: "composition",
      kind: "container",
      children: [{ id: "child", kind: "shape" }]
    };
    const frames: Array<Record<string, unknown>> = [];
    const playback = playArtTimelinePreview({
      component: root,
      start: "appear",
      scopeRootPath: false,
      timeline: {
        fps: 10,
        frameCount: 3,
        labels: [{ name: "appear", frame: 0 }],
        commands: [{ frame: 2, type: "stop" }],
        tracks: [{ targetId: "child", keyframes: [{ frame: 0, props: { x: 0 } }, { frame: 2, props: { x: 20 } }] }]
      },
      onPreview: (_frame, overrides) => frames.push(overrides)
    });

    vi.advanceTimersByTime(200);
    playback.stop();

    expect(frames.some((frame) => (frame.child as { x?: number } | undefined)?.x === 20)).toBe(true);
    expect(frames.every((frame) => frame["composition/child"] === undefined)).toBe(true);
  });

  it("previews nested component timelines through referenced compositions", () => {
    const bubbleText: ArtComponent = {
      id: "answer-text",
      kind: "text",
      timeline: {
        fps: 10,
        frameCount: 2,
        labels: [{ name: "pulse", frame: 0 }],
        commands: [{ frame: 1, type: "stop" }],
        tracks: [{ targetId: "self", keyframes: [{ frame: 0, props: { scale: 0.5 } }, { frame: 1, props: { scale: 1 } }] }]
      }
    };
    const bubble = { id: "answer-bubble", name: "Answer Bubble", components: [bubbleText] } as ArtComposition;
    const root: ArtComponent = {
      id: "player",
      kind: "container",
      children: [{ id: "answer-bubble-slot", kind: "reference", artCompositionId: "answer-bubble" }]
    };
    const resolveReference = (component: ArtComponent) => (component.artCompositionId === "answer-bubble" ? bubble : null);
    const frames: Array<Record<string, unknown>> = [];
    const playback = playArtTimelinePreview({
      component: root,
      start: "appear",
      resolveReference,
      timeline: {
        fps: 10,
        frameCount: 3,
        labels: [{ name: "appear", frame: 0 }],
        commands: [
          { frame: 1, type: "playComponent", target: "player/answer-bubble-slot/answer-text", event: "pulse" },
          { frame: 2, type: "stop" }
        ],
        tracks: []
      },
      onPreview: (_frame, overrides) => frames.push(overrides)
    });

    vi.advanceTimersByTime(200);
    playback.stop();

    expect(frames.some((frame) => (frame["player/answer-bubble-slot/answer-text"] as { scale?: number } | undefined)?.scale === 0.5)).toBe(true);
    expect(frames.some((frame) => (frame["player/answer-bubble-slot/answer-text"] as { scale?: number } | undefined)?.scale === 1)).toBe(true);
  });

  it("resolves commands inside nested timelines relative to the nested component", () => {
    const label: ArtComponent = {
      id: "label",
      kind: "text",
      timeline: {
        fps: 10,
        frameCount: 2,
        labels: [{ name: "flash", frame: 0 }],
        commands: [{ frame: 1, type: "stop" }],
        tracks: [{ targetId: "self", keyframes: [{ frame: 0, props: { defaultText: "A" } }, { frame: 1, props: { defaultText: "B" } }] }]
      }
    };
    const child: ArtComponent = {
      id: "child",
      kind: "container",
      children: [label],
      timeline: {
        fps: 10,
        frameCount: 3,
        labels: [{ name: "pop", frame: 0 }],
        commands: [
          { frame: 1, type: "playComponent", target: "label", event: "flash" },
          { frame: 2, type: "stop" }
        ],
        tracks: []
      }
    };
    const root: ArtComponent = { id: "root", kind: "container", children: [child] };
    const frames: Array<Record<string, unknown>> = [];
    const playback = playArtTimelinePreview({
      component: root,
      start: "appear",
      timeline: {
        fps: 10,
        frameCount: 4,
        labels: [{ name: "appear", frame: 0 }],
        commands: [
          { frame: 1, type: "playComponent", target: "child", event: "pop" },
          { frame: 3, type: "stop" }
        ],
        tracks: []
      },
      onPreview: (_frame, overrides) => frames.push(overrides)
    });

    vi.advanceTimersByTime(300);
    playback.stop();

    expect(frames.some((frame) => (frame["child/label"] as { defaultText?: string } | undefined)?.defaultText === "A")).toBe(true);
    expect(frames.some((frame) => (frame["child/label"] as { defaultText?: string } | undefined)?.defaultText === "B")).toBe(true);
    expect(frames.every((frame) => frame.label === undefined && frame["root/child/label"] === undefined)).toBe(true);
  });

  it("preserves scoped parent target ids while resolving nested local commands", () => {
    const label: ArtComponent = {
      id: "label",
      kind: "text",
      timeline: {
        fps: 10,
        frameCount: 2,
        labels: [{ name: "flash", frame: 0 }],
        commands: [{ frame: 1, type: "stop" }],
        tracks: [{ targetId: "self", keyframes: [{ frame: 0, props: { defaultText: "A" } }, { frame: 1, props: { defaultText: "B" } }] }]
      }
    };
    const child: ArtComponent = {
      id: "child",
      kind: "container",
      children: [label],
      timeline: {
        fps: 10,
        frameCount: 3,
        labels: [{ name: "pop", frame: 0 }],
        commands: [
          { frame: 1, type: "playComponent", target: "label", event: "flash" },
          { frame: 2, type: "stop" }
        ],
        tracks: []
      }
    };
    const root: ArtComponent = { id: "root", kind: "container", children: [child] };
    const frames: Array<Record<string, unknown>> = [];
    const playback = playArtTimelinePreview({
      component: root,
      start: "appear",
      timeline: {
        fps: 10,
        frameCount: 4,
        labels: [{ name: "appear", frame: 0 }],
        commands: [
          { frame: 1, type: "playComponent", target: "root/child", event: "pop" },
          { frame: 3, type: "stop" }
        ],
        tracks: []
      },
      onPreview: (_frame, overrides) => frames.push(overrides)
    });

    vi.advanceTimersByTime(300);
    playback.stop();

    expect(frames.some((frame) => (frame["root/child/label"] as { defaultText?: string } | undefined)?.defaultText === "A")).toBe(true);
    expect(frames.some((frame) => (frame["root/child/label"] as { defaultText?: string } | undefined)?.defaultText === "B")).toBe(true);
    expect(frames.every((frame) => frame.label === undefined && frame["child/label"] === undefined)).toBe(true);
  });

  it("includes nested component command durations in preview playback duration", () => {
    const child: ArtComponent = {
      id: "child",
      kind: "shape",
      timeline: {
        fps: 10,
        frameCount: 7,
        labels: [{ name: "pop", frame: 1 }],
        commands: [{ frame: 6, type: "stop" }],
        tracks: []
      }
    };
    const root: ArtComponent = { id: "root", kind: "container", children: [child] };
    const timeline = {
      fps: 10,
      frameCount: 4,
      labels: [{ name: "appear", frame: 0 }],
      commands: [
        { frame: 1, type: "playComponent", target: "child", event: "pop" },
        { frame: 2, type: "stop" }
      ],
      tracks: []
    };

    expect(artTimelinePlaybackDuration(timeline, root, "appear")).toBe(600);
  });

  it("includes local commands inside nested component timelines in preview duration", () => {
    const label: ArtComponent = {
      id: "label",
      kind: "text",
      timeline: {
        fps: 10,
        frameCount: 7,
        labels: [{ name: "flash", frame: 1 }],
        commands: [{ frame: 6, type: "stop" }],
        tracks: []
      }
    };
    const child: ArtComponent = {
      id: "child",
      kind: "container",
      children: [label],
      timeline: {
        fps: 10,
        frameCount: 4,
        labels: [{ name: "pop", frame: 0 }],
        commands: [
          { frame: 1, type: "playComponent", target: "label", event: "flash" },
          { frame: 2, type: "stop" }
        ],
        tracks: []
      }
    };
    const root: ArtComponent = { id: "root", kind: "container", children: [child] };
    const timeline = {
      fps: 10,
      frameCount: 4,
      labels: [{ name: "appear", frame: 0 }],
      commands: [
        { frame: 1, type: "playComponent", target: "child", event: "pop" },
        { frame: 2, type: "stop" }
      ],
      tracks: []
    };

    expect(artTimelinePlaybackDuration(timeline, root, "appear")).toBe(700);
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
