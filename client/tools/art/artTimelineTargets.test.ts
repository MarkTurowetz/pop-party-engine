import { describe, expect, it } from "vitest";
import type { ArtComponent, ArtComposition } from "../../types/game-data";
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
    expect(findTimelineTargetComponent([tree], "player/bubble/answer-text")?.name).toBe("Answer Text");
  });

  it("can expose scoped target ids for repeated nested components", () => {
    expect(timelineTargetOptionsFor(tree, { useScopedIds: true }).map((option) => option.id)).toEqual([
      "player",
      "player/avatar",
      "player/bubble",
      "player/bubble/answer-text"
    ]);
    expect(timelineTargetOptionsFor(tree, { includeRoot: false, useScopedIds: true }).map((option) => option.id)).toEqual([
      "player/avatar",
      "player/bubble",
      "player/bubble/answer-text"
    ]);
  });

  it("can omit a synthetic root from scoped child target ids", () => {
    expect(timelineTargetOptionsFor(tree, { includeRoot: false, useScopedIds: true, scopeRootPath: false }).map((option) => option.id)).toEqual([
      "avatar",
      "bubble",
      "bubble/answer-text"
    ]);
    expect(findTimelineTargetComponent([tree], "bubble/answer-text", { scopeRootPath: false })?.name).toBe("Answer Text");
  });

  it("returns readable labels and fallback labels", () => {
    expect(timelineTargetLabel("bubble", tree)).toMatchObject({
      id: "bubble",
      label: "Answer Bubble",
      detail: "container / bubble / player/bubble"
    });
    expect(timelineTargetLabel("player/bubble", tree)).toMatchObject({
      id: "player/bubble",
      label: "Answer Bubble",
      detail: "container / bubble / player/bubble"
    });
    expect(timelineTargetLabel("missing", tree)).toEqual({
      id: "missing",
      label: "missing",
      detail: "track target"
    });
  });

  it("expands referenced composition children when a resolver is provided", () => {
    const referenceTree = {
      id: "player",
      name: "Player",
      kind: "container",
      children: [{ id: "bubble-slot", name: "Bubble Slot", kind: "reference", artCompositionId: "bubble" }]
    } as ArtComponent;
    const bubble = {
      id: "bubble",
      name: "Bubble",
      components: [{ id: "answer-text", name: "Answer Text", kind: "text" }]
    } as ArtComposition;
    const resolveReference = (component: ArtComponent) => (component.artCompositionId === "bubble" ? bubble : null);

    expect(timelineTargetOptionsFor(referenceTree, { useScopedIds: true, resolveReference }).map((option) => option.id)).toEqual([
      "player",
      "player/bubble-slot",
      "player/bubble-slot/answer-text"
    ]);
    expect(findTimelineTargetComponent([referenceTree], "player/bubble-slot/answer-text", { resolveReference })?.name).toBe("Answer Text");
    expect(timelineTargetLabel("player/bubble-slot/answer-text", referenceTree, { resolveReference })).toMatchObject({
      label: "Answer Text",
      detail: "text / answer-text / player/bubble-slot/answer-text"
    });
  });
});
