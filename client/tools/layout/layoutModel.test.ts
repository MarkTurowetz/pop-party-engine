import { describe, expect, it } from "vitest";
import type { StageLayoutCollection } from "../../types/game-data";
import { controllerInitialAnimationState, serializeLayoutsForSave } from "./layoutModel";

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

describe("controller layout initial state", () => {
  it("defaults controller elements to On and preserves explicit Off", () => {
    expect(controllerInitialAnimationState(undefined)).toBe("On");
    expect(controllerInitialAnimationState("On")).toBe("On");
    expect(controllerInitialAnimationState("Off")).toBe("Off");
    expect(controllerInitialAnimationState("Park")).toBe("Off");
  });

  it("serializes controller initial state as the On/Off contract", () => {
    expect(serializeLayoutsForSave(layouts(), "controller").states[0].elements[0].defaultAnimationState).toBe("On");
    expect(serializeLayoutsForSave(layouts("Disappear"), "controller").states[0].elements[0].defaultAnimationState).toBe("Off");
  });
});
