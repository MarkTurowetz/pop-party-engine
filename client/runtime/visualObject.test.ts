import { describe, expect, it } from "vitest";
import { PartyGameVisualObject } from "./visualObject";

describe("PartyGameVisualObject (ported visual-object)", () => {
  it("animationForVisibility maps the visibility transitions", () => {
    const { animationForVisibility } = PartyGameVisualObject;
    expect(animationForVisibility(false, false)).toBe("park");
    expect(animationForVisibility(false, true)).toBe("disappear");
    expect(animationForVisibility(true, false)).toBe("appear");
    expect(animationForVisibility(true, true)).toBe("update");
  });

  it("instantAnimation collapses motion to instant variants", () => {
    const { instantAnimation } = PartyGameVisualObject;
    expect(instantAnimation("appear", false)).toBe("appear");
    expect(instantAnimation("appear", true)).toBe("on");
    expect(instantAnimation("update", true)).toBe("on");
    expect(instantAnimation("disappear", true)).toBe("off");
    expect(instantAnimation("park", true)).toBe("off");
  });

  it("createCssVisualObject merges default durations", () => {
    const visual = PartyGameVisualObject.createCssVisualObject({ durations: { appear: 1234 } });
    expect(visual.durations.appear).toBe(1234);
    expect(visual.durations.disappear).toBe(500);
    expect(visual.durations.update).toBe(200);
  });

  it("play is a no-op returning 0 without an element", () => {
    const visual = PartyGameVisualObject.createCssVisualObject({});
    expect(visual.play("appear")).toBe(0);
  });
});
