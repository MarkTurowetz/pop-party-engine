import { describe, expect, it } from "vitest";
import type { ArtComponent } from "../../types/game-data";
import {
  addTimelineCommand,
  addStopCommand,
  addTimelineLabel,
  addTransformKeyframe,
  artTimelineOrDefault,
  defaultArtVisibilityTimeline,
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

  it("adds transform keyframes to a target track", () => {
    const component = {
      id: "card",
      kind: "shape",
      x: 10,
      y: 20,
      width: 100,
      height: 50,
      scale: 1.2,
      rotation: 8
    } as ArtComponent;
    const timeline = addTransformKeyframe({ fps: 30, frameCount: 20, labels: [], commands: [], tracks: [] }, component, 5);
    expect(timeline.tracks).toHaveLength(1);
    expect(timeline.tracks[0]).toMatchObject({
      targetId: "card",
      keyframes: [{ frame: 5, props: { x: 10, y: 20, width: 100, height: 50, scale: 1.2, rotation: 8 } }]
    });
    expect(removeTimelineKeyframe(timeline, "card", 5).tracks).toEqual([]);
  });

  it("creates a default visibility timeline with known animation labels", () => {
    const timeline = defaultArtVisibilityTimeline();
    expect(timeline.labels.map((label) => label.name)).toContain("appear");
    expect(timeline.labels.map((label) => label.name)).toContain("disappear");
    expect(timeline.commands.some((command) => command.type === "stop")).toBe(true);
  });
});
