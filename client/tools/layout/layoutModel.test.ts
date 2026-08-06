import { describe, expect, it } from "vitest";
import type { ArtComposition, StageLayoutCollection } from "../../types/game-data";
import {
  controllerInitialAnimationState,
  layoutGameObjectCompositions,
  normalizeLayoutAuthoringId,
  serializeLayoutsForSave,
  uniqueLayoutAuthoringId
} from "./layoutModel";

function layouts(defaultAnimationState?: string): StageLayoutCollection {
  return {
    canvas: { width: 390, height: 844 },
    global: { id: "global", name: "Global", elements: [] },
    states: [
      {
        id: "controller-text-input",
        name: "Text Input",
        elements: [
          {
            id: "warning",
            name: "Warning",
            kind: "art",
            defaultAnimationState,
            tags: [" Phase One ", "phase one", "Review"],
            x: 1,
            y: 2,
            width: 3,
            height: 4
          }
        ]
      }
    ]
  } as StageLayoutCollection;
}

function stageLayouts(layoutLayer?: string): StageLayoutCollection {
  return {
    canvas: { width: 1920, height: 1080 },
    global: {
      id: "global",
      name: "Global",
      elements: [
        {
          id: "background",
          name: "Background",
          kind: "art",
          layoutLayer,
          x: 960,
          y: 540,
          width: 1920,
          height: 1080
        }
      ]
    },
    states: []
  } as StageLayoutCollection;
}

describe("controller layout initial state", () => {
  it("normalizes and uniquifies generated authoring ids using server-compatible rules", () => {
    expect(normalizeLayoutAuthoringId(" Flip 7 / Wager ")).toBe("flip-7-wager");
    expect(uniqueLayoutAuthoringId("Score Card", ["score-card", "score-card-2"], "object")).toBe(
      "score-card-3"
    );
    const longId = "a".repeat(48);
    expect(uniqueLayoutAuthoringId(longId, [longId], "object")).toBe(`${"a".repeat(46)}-2`);
  });

  it("offers only same-surface Art Manager Game Objects to a layout", () => {
    const composition = (id: string, surface: string, compositionKind: string): ArtComposition => ({
      id,
      name: id,
      surface,
      compositionKind,
      canvas: { width: 100, height: 50 },
      components: []
    });
    const compositions = [
      composition("stage-object", "stage", "gameObject"),
      composition("stage-prefab", "stage", "prefab"),
      composition("controller-object", "controller", "gameObject")
    ];

    expect(layoutGameObjectCompositions(compositions, "stage").map((item) => item.id)).toEqual([
      "stage-object"
    ]);
    expect(layoutGameObjectCompositions(compositions, "controller").map((item) => item.id)).toEqual(
      ["controller-object"]
    );
  });

  it("defaults controller elements to On and preserves explicit Off", () => {
    expect(controllerInitialAnimationState(undefined)).toBe("On");
    expect(controllerInitialAnimationState("On")).toBe("On");
    expect(controllerInitialAnimationState("Off")).toBe("Off");
    expect(controllerInitialAnimationState("Park")).toBe("Off");
  });

  it("serializes controller initial state as the On/Off contract", () => {
    expect(
      serializeLayoutsForSave(layouts(), "controller").states[0].elements[0].defaultAnimationState
    ).toBe("On");
    expect(
      serializeLayoutsForSave(layouts("Disappear"), "controller").states[0].elements[0]
        .defaultAnimationState
    ).toBe("Off");
  });

  it("serializes normalized controller configuration tags", () => {
    expect(serializeLayoutsForSave(layouts(), "controller").states[0].elements[0].tags).toEqual([
      "Phase One",
      "Review"
    ]);
  });

  it("serializes persistent controller layers and state visibility", () => {
    const source = layouts() as StageLayoutCollection;
    source.layers = [{ id: "round-context", name: "Round Context", zIndex: 150, elements: [] }];
    source.states[0].hiddenLayers = ["round-context"];
    const saved = serializeLayoutsForSave(source, "controller");
    expect(saved.layers).toEqual([expect.objectContaining({ id: "round-context", zIndex: 150 })]);
    expect(saved.states[0].hiddenLayers).toEqual(["round-context"]);
  });

  it("serializes authored dynamic choice collection geometry", () => {
    const source = layouts();
    source.states[0].elements.push({
      id: "targets",
      kind: "collection",
      x: 195,
      y: 420,
      width: 330,
      height: 500,
      collectionDirection: "horizontal",
      collectionGap: 12,
      collectionDistribution: "space-evenly",
      collectionAlignment: "center",
      collectionPadding: 8,
      collectionOverflow: "scroll",
      zIndex: 7
    });
    expect(
      serializeLayoutsForSave(source, "controller").states[0].elements.find(
        (element) => element.id === "targets"
      )
    ).toMatchObject({
      kind: "collection",
      collectionDirection: "horizontal",
      collectionGap: 12,
      collectionDistribution: "space-evenly",
      collectionAlignment: "center",
      collectionPadding: 8,
      collectionOverflow: "scroll",
      zIndex: 7
    });
  });

  it("serializes Stage renderer collection geometry", () => {
    const source = stageLayouts();
    source.global.elements.push({
      id: "cards",
      kind: "collection",
      x: 960,
      y: 540,
      width: 900,
      height: 420,
      collectionDirection: "horizontal",
      collectionGap: 20,
      collectionDistribution: "center",
      collectionAlignment: "center",
      collectionPadding: 10,
      collectionOverflow: "hidden",
      zIndex: 4
    });
    expect(
      serializeLayoutsForSave(source, "stage").global.elements.find(
        (element) => element.id === "cards"
      )
    ).toMatchObject({
      kind: "collection",
      collectionDirection: "horizontal",
      collectionGap: 20,
      collectionDistribution: "center",
      collectionAlignment: "center",
      collectionPadding: 10,
      collectionOverflow: "hidden",
      zIndex: 4
    });
  });

  it("serializes the stage background layer separately from normal content", () => {
    expect(
      serializeLayoutsForSave(stageLayouts("BACKGROUND"), "stage").global.elements[0].layoutLayer
    ).toBe("background");
    expect(serializeLayoutsForSave(stageLayouts(), "stage").global.elements[0].layoutLayer).toBe(
      "content"
    );
  });
});
