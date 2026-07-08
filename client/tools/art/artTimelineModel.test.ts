import { describe, expect, it } from "vitest";
import type { ArtComponent } from "../../types/game-data";
import {
  addTimelineCommand,
  addStopCommand,
  addTimelineLabel,
  addTransformKeyframe,
  artTimelineOrDefault,
  copyTimelineKeyframe,
  defaultArtVisibilityTimeline,
  insertTimelineFrames,
  mergeDefaultArtVisibilityTimeline,
  replaceTransformKeyframeFromComponent,
  removeTimelineFrames,
  removeTimelineKeyframe,
  removeTimelineLabel,
  updateTimelineCommandAt,
  updateTimelineKeyframe,
  updateTimelineLabel,
  updateTimelineSettings
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

  it("updates labels by name and keeps label names unique", () => {
    const timeline = {
      fps: 30,
      frameCount: 20,
      labels: [
        { name: "appear", frame: 2 },
        { name: "park", frame: 0 }
      ],
      commands: [],
      tracks: []
    };
    const renamed = updateTimelineLabel(timeline, "appear", { name: "park", frame: 7 });
    expect(renamed.labels).toEqual([{ name: "park", frame: 7 }]);
  });

  it("adds stop commands and clamps frames when settings change", () => {
    const withStop = addStopCommand({ fps: 30, frameCount: 20, labels: [], commands: [], tracks: [] }, 18);
    expect(withStop.commands[0]).toMatchObject({ frame: 18, type: "stop" });
    expect(updateTimelineSettings(withStop, { frameCount: 10 }).commands[0].frame).toBe(9);
  });

  it("adds timeline commands with targets and events", () => {
    const timeline = addTimelineCommand({ fps: 30, frameCount: 20, labels: [], commands: [], tracks: [] }, 4, {
      type: "gotoAndPlay",
      target: "appear",
      event: "ignored"
    });
    const withEmit = addTimelineCommand(timeline, 8, { type: "emit", event: "pop-name" });
    expect(withEmit.commands[0]).toMatchObject({ frame: 4, type: "gotoAndPlay", target: "appear", event: "ignored" });
    expect(withEmit.commands[1]).toMatchObject({ frame: 8, type: "emit", event: "pop-name" });
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
    expect(linear.tracks[0].keyframes[0].easing).toBeUndefined();
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
    expect(track?.keyframes.map((keyframe) => keyframe.frame)).toEqual([0, 1, 2, 17, 18, 24, 25, 40]);
    expect(track?.keyframes.find((keyframe) => keyframe.frame === 2)?.props).toEqual({
      opacity: 0.5,
      visible: true,
      scale: 1.25
    });
    expect(track?.keyframes.find((keyframe) => keyframe.frame === 17)?.props).toEqual({ opacity: 1, visible: true });
    expect(track?.keyframes.find((keyframe) => keyframe.frame === 40)?.props).toEqual({ opacity: 0, visible: false });
    expect(track?.keyframes.some((keyframe) => "x" in keyframe.props || "width" in keyframe.props)).toBe(false);
  });
});
