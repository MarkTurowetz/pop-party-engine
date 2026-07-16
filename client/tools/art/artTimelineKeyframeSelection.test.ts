import { describe, expect, it } from "vitest";
import type { TimelineDocument } from "../../../shared/timeline-model";
import {
  addTransformKeyframesForSelections,
  selectedTimelineKeyframes,
  sharedTimelineKeyframeProperties,
  updateSelectedTimelineKeyframeProperty,
  updateTimelineKeyframeCellSelection
} from "./artTimelineKeyframeSelection";

function timeline(): TimelineDocument {
  return {
    fps: 30,
    frameCount: 20,
    labels: [],
    commands: [],
    tracks: [{
      targetId: "card",
      keyframes: [
        { frame: 2, props: { x: 10, y: 5, scale: 1, opacity: 0.5 } },
        { frame: 8, props: { x: 30, y: 5, scale: 1, rotation: 15 } }
      ]
    }]
  };
}

describe("timeline keyframe multi-selection", () => {
  it("replaces on a normal click and toggles cells on additive clicks", () => {
    const first = { targetId: "card", frame: 2 };
    const second = { targetId: "card", frame: 8 };

    expect(updateTimelineKeyframeCellSelection([], first, false)).toEqual([first]);
    expect(updateTimelineKeyframeCellSelection([first], second, true)).toEqual([first, second]);
    expect(updateTimelineKeyframeCellSelection([first, second], first, true)).toEqual([second]);
    expect(updateTimelineKeyframeCellSelection([first, second], first, false)).toEqual([first]);
  });

  it("reports only properties shared by every selected keyframe", () => {
    const entries = selectedTimelineKeyframes(timeline(), [
      { targetId: "card", frame: 2 },
      { targetId: "card", frame: 8 },
      { targetId: "card", frame: 12 }
    ]);
    const properties = sharedTimelineKeyframeProperties(entries);

    expect(properties.map((property) => property.key)).toEqual(["x", "y", "scale"]);
    expect(properties.find((property) => property.key === "x")).toMatchObject({ value: "", mixed: true, numeric: true });
    expect(properties.find((property) => property.key === "scale")).toMatchObject({ value: 1, mixed: false, numeric: true });
  });

  it("applies absolute and relative numeric edits to every selected keyframe", () => {
    const selections = [{ targetId: "card", frame: 2 }, { targetId: "card", frame: 8 }];

    const absolute = updateSelectedTimelineKeyframeProperty(timeline(), selections, "x", "40");
    expect(absolute.tracks[0].keyframes.map((keyframe) => keyframe.props.x)).toEqual([40, 40]);

    const added = updateSelectedTimelineKeyframeProperty(timeline(), selections, "x", "+5");
    expect(added.tracks[0].keyframes.map((keyframe) => keyframe.props.x)).toEqual([15, 35]);

    const subtracted = updateSelectedTimelineKeyframeProperty(timeline(), selections, "x", "-5");
    expect(subtracted.tracks[0].keyframes.map((keyframe) => keyframe.props.x)).toEqual([5, 25]);

    const negativeAbsolute = updateSelectedTimelineKeyframeProperty(timeline(), selections, "x", "=-10");
    expect(negativeAbsolute.tracks[0].keyframes.map((keyframe) => keyframe.props.x)).toEqual([-10, -10]);
  });

  it("converts every selected empty frame while preserving existing keyframes", () => {
    const current = timeline();
    const selections = [
      { targetId: "card", frame: 2 },
      { targetId: "card", frame: 4 },
      { targetId: "card", frame: 6 }
    ];
    const next = addTransformKeyframesForSelections(current, selections, (selection, displayedProps) => ({
      id: selection.targetId,
      name: "Card",
      kind: "container",
      x: Number(displayedProps.x || 0),
      y: Number(displayedProps.y || 0),
      width: 100,
      height: 100,
      scale: Number(displayedProps.scale || 1)
    }));

    expect(next.tracks[0].keyframes.map((keyframe) => keyframe.frame)).toEqual([2, 4, 6, 8]);
    expect(next.tracks[0].keyframes.find((keyframe) => keyframe.frame === 2)?.props.x).toBe(10);
    expect(next.tracks[0].keyframes.find((keyframe) => keyframe.frame === 4)?.props.x).toBe(10);
  });
});
