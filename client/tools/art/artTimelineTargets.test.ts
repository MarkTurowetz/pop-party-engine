import { describe, expect, it } from "vitest";
import type { ArtComponent } from "../../types/game-data";
import { findTimelineTargetComponent, timelineTargetLabel, timelineTargetOptionsFor } from "./artTimelineTargets";

const tree = {
  id: "player",
  name: "Player Object",
  kind: "container",
  children: [
    { id: "avatar", name: "Avatar", kind: "shape" },
    {
      id: "bubble",
      name: "Answer Bubble",
      kind: "container",
      children: [{ id: "answer-text", name: "Answer Text", kind: "text" }]
    }
  ]
} as ArtComponent;

describe("artTimelineTargets", () => {
  it("walks nested timeline keyframe targets in component order", () => {
    expect(timelineTargetOptionsFor(tree).map((option) => option.id)).toEqual(["player", "avatar", "bubble", "answer-text"]);
  });

  it("can expose only real children when a synthetic root is used", () => {
    expect(timelineTargetOptionsFor(tree, { includeRoot: false }).map((option) => option.id)).toEqual(["avatar", "bubble", "answer-text"]);
    expect(timelineTargetOptionsFor(tree, { includeRoot: false }).map((option) => option.label)).toEqual(["Avatar", "Answer Bubble", "  Answer Text"]);
  });

  it("finds nested timeline targets", () => {
    expect(findTimelineTargetComponent([tree], "answer-text")?.name).toBe("Answer Text");
  });

  it("returns readable labels and fallback labels", () => {
    expect(timelineTargetLabel("bubble", tree)).toMatchObject({
      id: "bubble",
      label: "Answer Bubble",
      detail: "container / bubble"
    });
    expect(timelineTargetLabel("missing", tree)).toEqual({
      id: "missing",
      label: "missing",
      detail: "track target"
    });
  });
});
