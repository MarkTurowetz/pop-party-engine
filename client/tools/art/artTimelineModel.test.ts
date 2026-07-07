import { describe, expect, it } from "vitest";
import type { ArtComponent } from "../../types/game-data";
import {
  addTimelineCommand,
  addStopCommand,
  addTimelineLabel,
  addTransformKeyframe,
  artTimelineOrDefault,
  defaultArtVisibilityTimeline,
  insertTimelineFrames,
  removeTimelineFrames,
  removeTimelineKeyframe,
  removeTimelineLabel,
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

  it("creates a default visibility timeline with known animation labels", () => {
    const timeline = defaultArtVisibilityTimeline();
    expect(timeline.labels.map((label) => label.name)).toContain("appear");
    expect(timeline.labels.map((label) => label.name)).toContain("disappear");
    expect(timeline.commands.some((command) => command.type === "stop")).toBe(true);
  });
});
