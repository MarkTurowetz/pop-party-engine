import { describe, expect, it } from "vitest";
import type { ArtComponent } from "../../types/game-data";
import {
  addTimelineCommand,
  addStopCommand,
  addTimelineLabel,
  addTimelinePropertyKeyframe,
  addTransformKeyframe,
  artTimelineOrDefault,
  copyTimelineFrameRange,
  copyTimelineKeyframe,
  createTimelineSegment,
  cutTimelineFrameRange,
  defaultArtVisibilityTimeline,
  duplicateTimelineSegment,
  effectiveArtVisibilityTimeline,
  insertTimelineFrames,
  mergeDefaultArtVisibilityTimeline,
  moveTimelineCommandAt,
  pasteTimelineFrameRange,
  replaceTransformKeyframeFromComponent,
  removeTimelineFrames,
  removeTimelineKeyframe,
  removeTimelineLabel,
  removeTimelineSegment,
  timelineFrameRangeFromAnchor,
  timelineSegmentsForArt,
  updateTimelineCommandAt,
  updateTimelineKeyframe,
  updateTimelineLabel,
  updateTimelineSettings,
  upsertTimelineKeyframeProps
} from "./artTimelineModel";

describe("artTimelineModel", () => {
  it("creates an empty timeline when none exists", () => {
    expect(artTimelineOrDefault(null)).toEqual({
      fps: 30,
      frameCount: 1,
      labels: [],
      commands: [],
      tracks: []
    });
  });

  it("adds and replaces labels by name", () => {
    const first = addTimelineLabel(null, 4, "appear");
    const second = addTimelineLabel({ ...first, frameCount: 20 }, 9, "appear");
    expect(second.labels).toEqual([{ name: "appear", frame: 9 }]);
    expect(removeTimelineLabel(second, "appear").labels).toEqual([]);
  });

  it("builds normalized timeline frame ranges from an anchor and focus", () => {
    expect(timelineFrameRangeFromAnchor(20, 5, 8)).toEqual({ startFrame: 5, endFrame: 8, frameCount: 4 });
    expect(timelineFrameRangeFromAnchor(20, 8, 5)).toEqual({ startFrame: 5, endFrame: 8, frameCount: 4 });
    expect(timelineFrameRangeFromAnchor(20, -10, 99)).toEqual({ startFrame: 0, endFrame: 19, frameCount: 20 });
  });

  it("updates labels by name and keeps label names unique", () => {
    const timeline = {
      fps: 30,
      frameCount: 20,
      labels: [
        { name: "appear", frame: 2 },
        { name: "park", frame: 0 }
      ],
      commands: [{ frame: 4, type: "gotoAndPlay", target: "appear" }],
      tracks: []
    };
    const renamed = updateTimelineLabel(timeline, "appear", { name: "park", frame: 7 });
    expect(renamed.labels).toEqual([{ name: "park", frame: 7 }]);
    expect(renamed.commands).toEqual([{ frame: 4, type: "gotoAndPlay", target: "park" }]);
  });

  it("adds stop commands and clamps frames when settings change", () => {
    const withStop = addStopCommand({ fps: 30, frameCount: 20, labels: [], commands: [], tracks: [] }, 18);
    expect(withStop.commands[0]).toMatchObject({ frame: 18, type: "stop" });
    expect(updateTimelineSettings(withStop, { frameCount: 10 }).commands[0].frame).toBe(9);
  });

  it("creates named timeline animation segments with stop commands", () => {
    const timeline = createTimelineSegment({ fps: 30, frameCount: 10, labels: [], commands: [], tracks: [] }, 4, "pop", 6);
    expect(timeline.frameCount).toBe(11);
    expect(timeline.labels).toEqual([{ name: "pop", frame: 4 }]);
    expect(timeline.commands).toEqual([{ id: "stop-pop-10", frame: 10, type: "stop" }]);
    expect(timelineSegmentsForArt(timeline)).toEqual([{ label: "pop", startFrame: 4, endFrame: 10, durationMs: 200 }]);
  });

  it("duplicates animation segments with relative markers, commands, and keyframes", () => {
    const timeline = {
      fps: 10,
      frameCount: 8,
      labels: [
        { name: "appear", frame: 1 },
        { name: "settle", frame: 3 }
      ],
      commands: [
        { id: "emit-start", frame: 1, type: "emit", target: "card", event: "started" },
        { id: "jump-settle", frame: 2, type: "gotoAndPlay", target: "settle" },
        { id: "stop", frame: 5, type: "stop" }
      ],
      tracks: [{ targetId: "card", keyframes: [{ id: "one", frame: 1, props: { scale: 0.5 } }, { id: "two", frame: 5, props: { scale: 1 } }] }]
    };
    const duplicated = duplicateTimelineSegment(timeline, "appear", "bounce");

    expect(duplicated.frameCount).toBe(13);
    expect(duplicated.labels).toEqual([
      { name: "appear", frame: 1 },
      { name: "settle", frame: 3 },
      { name: "bounce", frame: 8 },
      { name: "bounce settle", frame: 10 }
    ]);
    expect(duplicated.commands.slice(3)).toEqual([
      expect.objectContaining({ id: "emit-8-card-started", frame: 8, type: "emit", target: "card", event: "started" }),
      expect.objectContaining({ id: "gotoandplay-9-bounce-settle", frame: 9, type: "gotoAndPlay", target: "bounce settle" }),
      expect.objectContaining({ id: "stop-12", frame: 12, type: "stop" })
    ]);
    expect(duplicated.tracks[0].keyframes.map((keyframe) => ({ frame: keyframe.frame, props: keyframe.props }))).toEqual([
      { frame: 1, props: { scale: 0.5 } },
      { frame: 5, props: { scale: 1 } },
      { frame: 8, props: { scale: 0.5 } },
      { frame: 12, props: { scale: 1 } }
    ]);
  });

  it("removes a whole animation segment and shifts later timeline data back", () => {
    const timeline = {
      fps: 10,
      frameCount: 12,
      labels: [
        { name: "appear", frame: 1 },
        { name: "later", frame: 9 }
      ],
      commands: [
        { frame: 4, type: "stop" },
        { frame: 10, type: "stop" }
      ],
      tracks: [{ targetId: "card", keyframes: [{ frame: 1, props: { scale: 0.5 } }, { frame: 10, props: { scale: 1 } }] }]
    };
    const removed = removeTimelineSegment(timeline, "appear");

    expect(removed.frameCount).toBe(8);
    expect(removed.labels).toEqual([{ name: "later", frame: 5 }]);
    expect(removed.commands).toEqual([{ frame: 6, type: "stop" }]);
    expect(removed.tracks).toEqual([{ targetId: "card", keyframes: [{ frame: 6, props: { scale: 1 } }] }]);
  });

  it("adds timeline commands with targets and events", () => {
    const timeline = addTimelineCommand({ fps: 30, frameCount: 20, labels: [], commands: [], tracks: [] }, 4, {
      type: "gotoAndPlay",
      target: "appear",
      event: "ignored"
    });
    const withEmit = addTimelineCommand(timeline, 8, { type: "emit", target: "name-card", event: "pop-name" });
    expect(withEmit.commands[0]).toMatchObject({
      id: "gotoandplay-4-appear",
      frame: 4,
      type: "gotoAndPlay",
      target: "appear"
    });
    expect(withEmit.commands[0].event).toBeUndefined();
    expect(withEmit.commands[1]).toMatchObject({ id: "emit-8-name-card-pop-name", frame: 8, type: "emit", target: "name-card", event: "pop-name" });
  });

  it("drops stale target and event fields for command types that do not use them", () => {
    const timeline = addTimelineCommand({ fps: 30, frameCount: 20, labels: [], commands: [], tracks: [] }, 4, {
      type: "stop",
      target: "appear",
      event: "ignored"
    });

    expect(timeline.commands[0]).toEqual({ id: "stop-4", frame: 4, type: "stop" });

    const updated = updateTimelineCommandAt(timeline, 0, {
      type: "gotoAndStop",
      target: "park",
      event: "ignored"
    });

    expect(updated.commands[0]).toEqual({ id: "stop-4", frame: 4, type: "gotoAndStop", target: "park" });
  });

  it("generates unique deterministic command ids for repeated timeline commands", () => {
    const timeline = addTimelineCommand({ fps: 30, frameCount: 20, labels: [], commands: [], tracks: [] }, 4, {
      type: "stop"
    });
    const withDuplicate = addTimelineCommand(timeline, 4, { type: "stop" });

    expect(withDuplicate.commands.map((command) => command.id)).toEqual(["stop-4", "stop-4-2"]);
  });

  it("preserves authored command order within a frame", () => {
    const first = addTimelineCommand({ fps: 30, frameCount: 20, labels: [], commands: [], tracks: [] }, 4, {
      type: "gotoAndPlay",
      target: "settle"
    });
    const second = addTimelineCommand(first, 4, { type: "emit", event: "started" });
    const third = addTimelineCommand(second, 2, { type: "stop" });

    expect(third.commands.map((command) => command.type)).toEqual(["stop", "gotoAndPlay", "emit"]);
  });

  it("updates timeline commands by normalized list index", () => {
    const timeline = {
      fps: 30,
      frameCount: 20,
      labels: [],
      commands: [
        { id: "a", frame: 2, type: "stop" },
        { id: "b", frame: 8, type: "emit", event: "old" }
      ],
      tracks: []
    };
    const result = updateTimelineCommandAt(timeline, 1, { frame: 4, type: "gotoAndStop", target: "appear", event: "" });
    expect(result.commands).toEqual([
      { id: "a", frame: 2, type: "stop" },
      { id: "b", frame: 4, type: "gotoAndStop", target: "appear" }
    ]);
  });

  it("moves commands only within their authored frame", () => {
    const timeline = {
      fps: 30,
      frameCount: 20,
      labels: [],
      commands: [
        { id: "before", frame: 2, type: "stop" },
        { id: "play", frame: 4, type: "gotoAndPlay", target: "settle" },
        { id: "emit", frame: 4, type: "emit", event: "started" },
        { id: "after", frame: 8, type: "stop" }
      ],
      tracks: []
    };
    const movedEarlier = moveTimelineCommandAt(timeline, 2, -1);
    expect(movedEarlier.commands.map((command) => command.id)).toEqual(["before", "emit", "play", "after"]);

    const blockedAcrossFrame = moveTimelineCommandAt(movedEarlier, 1, -1);
    expect(blockedAcrossFrame.commands.map((command) => command.id)).toEqual(["before", "emit", "play", "after"]);

    const movedLater = moveTimelineCommandAt(movedEarlier, 1, 1);
    expect(movedLater.commands.map((command) => command.id)).toEqual(["before", "play", "emit", "after"]);
  });

  it("inserts frames and shifts timeline data at or after the insertion point", () => {
    const timeline = {
      fps: 30,
      frameCount: 10,
      labels: [{ name: "appear", frame: 3 }],
      commands: [{ frame: 3, type: "stop" }],
      tracks: [{ targetId: "card", keyframes: [{ frame: 4, props: { x: 10 } }] }]
    };
    const result = insertTimelineFrames(timeline, 3, 2);
    expect(result.frameCount).toBe(12);
    expect(result.labels[0]).toMatchObject({ name: "appear", frame: 5 });
    expect(result.commands[0]).toMatchObject({ frame: 5, type: "stop" });
    expect(result.tracks[0].keyframes[0]).toMatchObject({ frame: 6, props: { x: 10 } });
  });

  it("removes frames, drops timeline data inside the range, and shifts later data back", () => {
    const timeline = {
      fps: 30,
      frameCount: 12,
      labels: [
        { name: "drop", frame: 3 },
        { name: "keep", frame: 8 }
      ],
      commands: [
        { frame: 4, type: "stop" },
        { frame: 9, type: "emit", event: "done" }
      ],
      tracks: [{ targetId: "card", keyframes: [{ frame: 5, props: { x: 10 } }, { frame: 10, props: { x: 20 } }] }]
    };
    const result = removeTimelineFrames(timeline, 3, 3);
    expect(result.frameCount).toBe(9);
    expect(result.labels).toEqual([{ name: "keep", frame: 5 }]);
    expect(result.commands).toEqual([{ frame: 6, type: "emit", event: "done" }]);
    expect(result.tracks[0].keyframes).toEqual([{ frame: 7, props: { x: 20 } }]);
  });

  it("copies and pastes frame ranges without overwriting later timeline data", () => {
    const timeline = {
      fps: 30,
      frameCount: 12,
      labels: [
        { name: "pop", frame: 2 },
        { name: "settle", frame: 4 },
        { name: "later", frame: 9 }
      ],
      commands: [
        { id: "jump", frame: 3, type: "gotoAndPlay", target: "settle" },
        { id: "stop", frame: 5, type: "stop" },
        { id: "later-stop", frame: 10, type: "stop" }
      ],
      tracks: [{ targetId: "card", keyframes: [{ id: "start", frame: 2, props: { scale: 0.4 } }, { id: "end", frame: 5, props: { scale: 1 } }] }]
    };

    const clipboard = copyTimelineFrameRange(timeline, 2, 4);
    expect(clipboard).toMatchObject({
      frameCount: 4,
      labels: [
        { name: "pop", frame: 0 },
        { name: "settle", frame: 2 }
      ],
      commands: [
        { frame: 1, type: "gotoAndPlay", target: "settle" },
        { frame: 3, type: "stop" }
      ],
      tracks: [{ targetId: "card", keyframes: [{ frame: 0, props: { scale: 0.4 } }, { frame: 3, props: { scale: 1 } }] }]
    });

    const pasted = pasteTimelineFrameRange(timeline, clipboard, 8);
    expect(pasted.frameCount).toBe(16);
    expect(pasted.labels).toEqual([
      { name: "pop", frame: 2 },
      { name: "settle", frame: 4 },
      { name: "pop 2", frame: 8 },
      { name: "settle 2", frame: 10 },
      { name: "later", frame: 13 }
    ]);
    expect(pasted.commands.map((command) => ({ id: command.id, frame: command.frame, type: command.type, target: command.target }))).toEqual([
      { id: "jump", frame: 3, type: "gotoAndPlay", target: "settle" },
      { id: "stop", frame: 5, type: "stop", target: undefined },
      { id: "gotoandplay-9-settle-2", frame: 9, type: "gotoAndPlay", target: "settle 2" },
      { id: "stop-11", frame: 11, type: "stop", target: undefined },
      { id: "later-stop", frame: 14, type: "stop", target: undefined }
    ]);
    expect(pasted.tracks[0].keyframes.map((keyframe) => ({ frame: keyframe.frame, props: keyframe.props }))).toEqual([
      { frame: 2, props: { scale: 0.4 } },
      { frame: 5, props: { scale: 1 } },
      { frame: 8, props: { scale: 0.4 } },
      { frame: 11, props: { scale: 1 } }
    ]);
  });

  it("does not remap component command targets that match copied label names", () => {
    const timeline = {
      fps: 30,
      frameCount: 8,
      labels: [{ name: "child", frame: 2 }, { name: "settle", frame: 4 }],
      commands: [
        { id: "play-child", frame: 3, type: "playComponent", target: "child", event: "pop" },
        { id: "jump-settle", frame: 3, type: "gotoAndPlay", target: "settle" },
        { id: "stop", frame: 5, type: "stop" }
      ],
      tracks: []
    };

    const pasted = pasteTimelineFrameRange(timeline, copyTimelineFrameRange(timeline, 2, 4), 6);
    expect(pasted.commands.map((command) => ({ frame: command.frame, type: command.type, target: command.target, event: command.event }))).toEqual([
      { frame: 3, type: "playComponent", target: "child", event: "pop" },
      { frame: 3, type: "gotoAndPlay", target: "settle", event: undefined },
      { frame: 5, type: "stop", target: undefined, event: undefined },
      { frame: 7, type: "playComponent", target: "child", event: "pop" },
      { frame: 7, type: "gotoAndPlay", target: "settle 2", event: undefined },
      { frame: 9, type: "stop", target: undefined, event: undefined }
    ]);

    const duplicated = duplicateTimelineSegment(timeline, "child", "bounce");
    expect(duplicated.commands.slice(3).map((command) => ({ frame: command.frame, type: command.type, target: command.target, event: command.event }))).toEqual([
      { frame: 9, type: "playComponent", target: "child", event: "pop" },
      { frame: 9, type: "gotoAndPlay", target: "bounce settle", event: undefined },
      { frame: 11, type: "stop", target: undefined, event: undefined }
    ]);
  });

  it("cuts frame ranges by returning clipboard data and a shifted timeline", () => {
    const timeline = {
      fps: 30,
      frameCount: 8,
      labels: [{ name: "remove", frame: 2 }, { name: "keep", frame: 6 }],
      commands: [{ frame: 3, type: "emit", event: "inside" }, { frame: 7, type: "stop" }],
      tracks: [{ targetId: "card", keyframes: [{ frame: 2, props: { x: 1 } }, { frame: 6, props: { x: 2 } }] }]
    };

    const result = cutTimelineFrameRange(timeline, 2, 3);

    expect(result.clipboard).toMatchObject({
      frameCount: 3,
      labels: [{ name: "remove", frame: 0 }],
      commands: [{ frame: 1, type: "emit", event: "inside" }],
      tracks: [{ targetId: "card", keyframes: [{ frame: 0, props: { x: 1 } }] }]
    });
    expect(result.timeline).toEqual({
      fps: 30,
      frameCount: 5,
      labels: [{ name: "keep", frame: 3 }],
      commands: [{ frame: 4, type: "stop" }],
      tracks: [{ targetId: "card", keyframes: [{ frame: 3, props: { x: 2 } }] }]
    });
  });

  it("adds transform keyframes to a target track", () => {
    const component = {
      id: "card",
      kind: "shape",
      x: 10,
      y: 20,
      width: 100,
      height: 50,
      scale: 1.2,
      rotation: 8,
      fillColor: "#ffe156",
      borderColor: "#17131f",
      borderWidth: 4,
      borderRadius: 12,
      imageAssetId: "rex",
      imageObjectFit: "contain"
    } as ArtComponent;
    const timeline = addTransformKeyframe({ fps: 30, frameCount: 20, labels: [], commands: [], tracks: [] }, component, 5);
    expect(timeline.tracks).toHaveLength(1);
    expect(timeline.tracks[0]).toMatchObject({
      targetId: "card",
      keyframes: [
        {
          frame: 5,
          easing: "hold",
          props: {
            x: 10,
            y: 20,
            width: 100,
            height: 50,
            scale: 1.2,
            rotation: 8,
            opacity: 1,
            visible: true,
            fillColor: "#ffe156",
            borderColor: "#17131f",
            borderWidth: 4,
            borderRadius: 12,
            imageAssetId: "rex",
            imageObjectFit: "contain"
          }
        }
      ]
    });
    expect(removeTimelineKeyframe(timeline, "card", 5).tracks).toEqual([]);
  });

  it("adds property-specific keyframes without capturing unrelated component state", () => {
    const component = {
      id: "card",
      kind: "shape",
      x: 10,
      y: 20,
      width: 100,
      height: 50,
      scale: 1.2,
      rotation: 8,
      fillColor: "#ffe156",
      borderColor: "#17131f"
    } as ArtComponent;

    const timeline = addTimelinePropertyKeyframe({ fps: 30, frameCount: 20, labels: [], commands: [], tracks: [] }, component, 5, [
      "scale",
      "opacity",
      "fillColor"
    ]);

    expect(timeline.tracks).toEqual([
      {
        id: "track-card",
        targetId: "card",
        keyframes: [
          {
            id: "key-card-5",
            frame: 5,
            easing: "hold",
            props: { scale: 1.2, opacity: 1, fillColor: "#ffe156" }
          }
        ]
      }
    ]);
  });

  it("merges property-specific keyframes into an existing keyframe and preserves easing", () => {
    const initial = addTransformKeyframe(
      { fps: 30, frameCount: 20, labels: [], commands: [], tracks: [] },
      { id: "title", kind: "text", defaultText: "One", width: 100, height: 40, fontSize: 24 } as ArtComponent,
      2
    );
    const eased = updateTimelineKeyframe(initial, "title", 2, { easing: "easeOut", props: { scale: 0.5 } });
    const result = addTimelinePropertyKeyframe(
      eased,
      { id: "title", kind: "text", defaultText: "Two", width: 240, height: 80, fontSize: 36 } as ArtComponent,
      2,
      ["defaultText", "fontSize"]
    );

    expect(result.tracks[0].keyframes[0]).toEqual({
      id: "key-title-2",
      frame: 2,
      easing: "easeOut",
      props: { scale: 0.5, defaultText: "Two", fontSize: 36 }
    });
  });

  it("upserts inspector-authored keyframe properties with hold defaults", () => {
    const timeline = upsertTimelineKeyframeProps(
      { fps: 30, frameCount: 20, labels: [], commands: [], tracks: [] },
      "title",
      4,
      { scale: 1, x: 100 },
      { defaultEasing: "hold" }
    );

    expect(timeline.tracks[0].keyframes[0]).toEqual({
      id: "key-title-4",
      frame: 4,
      easing: "hold",
      props: { scale: 1, x: 100 }
    });

    const merged = upsertTimelineKeyframeProps(timeline, "title", 4, { scale: 0.8, y: 120 }, { defaultEasing: "linear" });
    expect(merged.tracks[0].keyframes[0]).toEqual({
      id: "key-title-4",
      frame: 4,
      easing: "hold",
      props: { scale: 0.8, x: 100, y: 120 }
    });

    const tweened = updateTimelineKeyframe(merged, "title", 4, { easing: "easeInOut" });
    expect(tweened.tracks[0].keyframes[0].easing).toBe("easeInOut");
  });

  it("captures text state when adding keyframes", () => {
    const component = {
      id: "title",
      kind: "text",
      width: 300,
      height: 80,
      defaultText: "Round One",
      fontFamily: "Game UI",
      fontSize: 42,
      fontColor: "#ffffff",
      autoFitText: true
    } as ArtComponent;
    const timeline = addTransformKeyframe({ fps: 30, frameCount: 20, labels: [], commands: [], tracks: [] }, component, 2);
    expect(timeline.tracks[0].keyframes[0].props).toMatchObject({
      defaultText: "Round One",
      fontFamily: "Game UI",
      fontSize: 42,
      fontColor: "#ffffff",
      autoFitText: true,
      opacity: 1,
      visible: true
    });
    expect(timeline.tracks[0].keyframes[0].easing).toBe("hold");
  });

  it("updates keyframe frames, properties, and easing", () => {
    const timeline = addTransformKeyframe(
      { fps: 30, frameCount: 20, labels: [], commands: [], tracks: [] },
      { id: "title", kind: "text", defaultText: "One", width: 100, height: 40 } as ArtComponent,
      2
    );
    const result = updateTimelineKeyframe(timeline, "title", 2, {
      frame: 6,
      easing: "easeOut",
      props: { defaultText: "Two", visible: false, fontSize: 28, nested: { ignored: true } as never }
    });
    expect(result.tracks[0].keyframes).toEqual([
      {
        id: "key-title-2",
        frame: 6,
        easing: "easeOut",
        props: { defaultText: "Two", visible: false, fontSize: 28 }
      }
    ]);
    const linear = updateTimelineKeyframe(result, "title", 6, { easing: "linear" });
    expect(linear.tracks[0].keyframes[0].easing).toBe("linear");
  });

  it("copies keyframe properties and easing to another frame", () => {
    const timeline = addTransformKeyframe(
      { fps: 30, frameCount: 20, labels: [], commands: [], tracks: [] },
      { id: "title", kind: "text", defaultText: "One", width: 100, height: 40, fontSize: 24 } as ArtComponent,
      2
    );
    const eased = updateTimelineKeyframe(timeline, "title", 2, { easing: "hold" });
    const result = copyTimelineKeyframe(eased, "title", 2, "title", 8);
    expect(result.tracks[0].keyframes.map((keyframe) => ({ frame: keyframe.frame, easing: keyframe.easing, props: keyframe.props }))).toEqual([
      {
        frame: 2,
        easing: "hold",
        props: timeline.tracks[0].keyframes[0].props
      },
      {
        frame: 8,
        easing: "hold",
        props: timeline.tracks[0].keyframes[0].props
      }
    ]);
  });

  it("recaptures an existing keyframe from component state while preserving easing", () => {
    const timeline = addTransformKeyframe(
      { fps: 30, frameCount: 20, labels: [], commands: [], tracks: [] },
      { id: "title", kind: "text", defaultText: "One", width: 100, height: 40, fontSize: 24 } as ArtComponent,
      2
    );
    const eased = updateTimelineKeyframe(timeline, "title", 2, { easing: "easeInOut" });
    const result = replaceTransformKeyframeFromComponent(
      eased,
      { id: "title", kind: "text", defaultText: "Two", width: 240, height: 80, fontSize: 36, autoFitText: true } as ArtComponent,
      2
    );
    expect(result.tracks[0].keyframes[0]).toMatchObject({
      frame: 2,
      easing: "easeInOut",
      props: {
        defaultText: "Two",
        width: 240,
        height: 80,
        fontSize: 36,
        autoFitText: true
      }
    });
  });

  it("creates a default visibility timeline with known animation labels", () => {
    const timeline = defaultArtVisibilityTimeline();
    expect(timeline.labels.map((label) => label.name)).toContain("appear");
    expect(timeline.labels.map((label) => label.name)).toContain("disappear");
    expect(timeline.commands.some((command) => command.type === "stop")).toBe(true);
  });

  it("merges visibility defaults without replacing authored timeline data", () => {
    const timeline = mergeDefaultArtVisibilityTimeline({
      fps: 12,
      frameCount: 3,
      labels: [
        { name: "appear", frame: 1 },
        { name: "custom-pop", frame: 2 }
      ],
      commands: [
        { frame: 2, type: "emit", target: "title", event: "pop" },
        { frame: 0, type: "stop" }
      ],
      tracks: [{ targetId: "title", keyframes: [{ frame: 2, props: { scale: 1.25 } }] }]
    });
    expect(timeline.frameCount).toBeGreaterThan(3);
    expect(timeline.labels).toEqual(expect.arrayContaining([{ name: "appear", frame: 1 }, { name: "custom-pop", frame: 2 }]));
    expect(timeline.labels.map((label) => label.name)).toEqual(expect.arrayContaining(["park", "on", "update", "disappear"]));
    expect(timeline.commands).toEqual(expect.arrayContaining([{ frame: 2, type: "emit", target: "title", event: "pop" }]));
    expect(timeline.commands.filter((command) => command.frame === 0 && command.type === "stop")).toHaveLength(1);
    expect(timeline.tracks).toEqual([{ targetId: "title", keyframes: [{ frame: 2, props: { scale: 1.25 } }] }]);
  });

  it("adds default visibility keyframes for a selected target without locking layout props", () => {
    const timeline = mergeDefaultArtVisibilityTimeline(
      {
        fps: 30,
        frameCount: 3,
        labels: [],
        commands: [],
        tracks: [{ targetId: "title", keyframes: [{ frame: 2, props: { scale: 1.25, opacity: 0.5 } }] }]
      },
      { id: "title" } as ArtComponent
    );
    const track = timeline.tracks.find((item) => item.targetId === "title");
    expect(track?.keyframes.map((keyframe) => keyframe.frame)).toEqual([2, 3, 4, 5, 20, 21, 27, 28, 43]);
    expect(track?.keyframes.find((keyframe) => keyframe.frame === 2)?.props).toEqual({
      opacity: 0.5,
      scale: 1.25
    });
    expect(track?.keyframes.find((keyframe) => keyframe.frame === 20)?.props).toEqual({ opacity: 1, visible: true });
    expect(track?.keyframes.find((keyframe) => keyframe.frame === 43)?.props).toEqual({ opacity: 0, visible: false });
    expect(track?.keyframes.some((keyframe) => "x" in keyframe.props || "width" in keyframe.props)).toBe(false);
  });

  it("uses default visibility timelines while preserving authored timeline data", () => {
    const missing = effectiveArtVisibilityTimeline(null, { id: "title" } as ArtComponent);
    expect(missing.labels.map((label) => label.name)).toEqual(expect.arrayContaining(["park", "on", "appear", "update", "disappear"]));
    expect(missing.tracks.find((track) => track.targetId === "title")?.keyframes.some((keyframe) => keyframe.props.visible === false)).toBe(true);

    const authored = effectiveArtVisibilityTimeline({
      fps: 12,
      frameCount: 2,
      labels: [{ name: "custom", frame: 0 }],
      commands: [{ frame: 0, type: "stop" }],
      tracks: []
    });
    expect(authored.labels).toEqual(expect.arrayContaining([{ name: "custom", frame: 0 }, { name: "appear", frame: 4 }]));
    expect(authored.commands).toEqual(expect.arrayContaining([{ frame: 0, type: "stop" }]));
  });
});
