import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { defaultArtCompositions, defaultStageLayouts } = require("./game-data");

function composition(id: string): Record<string, any> {
  return defaultArtCompositions.find((item: { id: string }) => item.id === id);
}

describe("default authored stage background", () => {
  it("is one global background-layer GameObject beneath every stage state", () => {
    const backgrounds = defaultStageLayouts.global.elements.filter((element: { layoutLayer?: string }) => element.layoutLayer === "background");
    expect(backgrounds).toEqual([
      expect.objectContaining({ artCompositionId: "stage-background", defaultAnimationState: "On" })
    ]);
    expect(defaultStageLayouts.states.flatMap((state: { elements: unknown[] }) => state.elements)
      .some((element: any) => element.layoutLayer === "background")).toBe(false);
  });

  it("selects a nested compound scene containing the gradient, three orbs, and two independent fan MCs", () => {
    expect(composition("stage-background")).toMatchObject({
      compositionKind: "gameObject",
      components: [{ kind: "reference", artCompositionId: "stage-background-default", referenceSizeMode: "intrinsic" }]
    });
    expect(composition("stage-background").timeline.labels).toEqual([
      { name: "Off", frame: 0 },
      { name: "On", frame: 1 },
      { name: "Default", frame: 2 }
    ]);
    expect(composition("stage-background-default").components.map((component: any) => component.artCompositionId)).toEqual([
      "stage-background-fan-left-mc",
      "stage-background-fan-right-mc",
      "stage-background-orb-yellow",
      "stage-background-orb-cyan",
      "stage-background-orb-pink",
      "stage-background-gradient-plane"
    ]);
  });

  it("authors clockwise and counterclockwise looping fan rotations around their centers", () => {
    const left = composition("stage-background-fan-left-mc");
    const right = composition("stage-background-fan-right-mc");
    expect(left.components[0]).toMatchObject({ transformOrigin: "center", referenceSizeMode: "intrinsic" });
    expect(right.components[0]).toMatchObject({ transformOrigin: "center", referenceSizeMode: "intrinsic" });
    expect(left.timeline.tracks[0].keyframes[0]).toMatchObject({
      props: { rotation: 0 }, rotationDirection: "clockwise", rotationTurns: 1
    });
    expect(right.timeline.tracks[0].keyframes[0]).toMatchObject({
      props: { rotation: 0 }, rotationDirection: "counterclockwise", rotationTurns: 1
    });
    expect(left.timeline.commands).toContainEqual(expect.objectContaining({ type: "loop", target: "Idle" }));
    expect(right.timeline.commands).toContainEqual(expect.objectContaining({ type: "loop", target: "Idle" }));
  });
});
