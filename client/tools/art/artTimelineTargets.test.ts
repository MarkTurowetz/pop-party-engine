import { describe, expect, it } from "vitest";
import type { ArtComponent, ArtComposition } from "../../types/game-data";
import { findTimelineTargetComponent, timelineTargetLabel, timelineTargetOptionsFor, timelineTrackRowsFor } from "./artTimelineTargets";

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

  it("expands referenced composition children without synthetic root prefixes", () => {
    const referenceTree = {
      id: "composition",
      name: "Composition",
      kind: "container",
      children: [{ id: "bubble-slot", name: "Bubble Slot", kind: "reference", artCompositionId: "bubble" }]
    } as ArtComponent;
    const bubble = {
      id: "bubble",
      name: "Bubble",
      components: [{ id: "answer-text", name: "Answer Text", kind: "text" }]
    } as ArtComposition;
    const resolveReference = (component: ArtComponent) => (component.artCompositionId === "bubble" ? bubble : null);

    expect(
      timelineTargetOptionsFor(referenceTree, {
        includeRoot: false,
        useScopedIds: true,
        scopeRootPath: false,
        resolveReference
      }).map((option) => option.id)
    ).toEqual(["bubble-slot", "bubble-slot/answer-text"]);
    expect(findTimelineTargetComponent([referenceTree], "bubble-slot/answer-text", { scopeRootPath: false, resolveReference })?.name).toBe(
      "Answer Text"
    );
  });

  it("creates timeline rows for every animatable target even before keyframes exist", () => {
    const rows = timelineTrackRowsFor(
      { fps: 30, frameCount: 20, labels: [], commands: [], tracks: [] },
      tree,
      { includeRoot: false, useScopedIds: true, scopeRootPath: false }
    );

    expect(rows.map((row) => row.target.id)).toEqual(["avatar", "bubble", "bubble/answer-text"]);
    expect(rows.map((row) => row.track)).toEqual([null, null, null]);
  });

  it("keeps legacy timeline tracks visible even when their target is no longer in the art tree", () => {
    const rows = timelineTrackRowsFor(
      {
        fps: 30,
        frameCount: 20,
        labels: [],
        commands: [],
        tracks: [{ targetId: "legacy-target", keyframes: [{ frame: 5, props: { scale: 2 } }] }]
      },
      tree,
      { includeRoot: false, useScopedIds: true, scopeRootPath: false }
    );

    expect(rows.map((row) => row.target.id)).toEqual(["avatar", "bubble", "bubble/answer-text", "legacy-target"]);
    expect(rows[3].target).toMatchObject({ label: "legacy-target", detail: "track target" });
    expect(rows[3].track?.keyframes[0].props).toEqual({ scale: 2 });
  });
});
