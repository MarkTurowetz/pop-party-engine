import { describe, expect, it } from "vitest";
import {
  parentFlowNodeLocation,
  shouldNavigateUpFromCanvasDoubleClick
} from "./flowNodeNavigation";

describe("Flow Node View hierarchy navigation", () => {
  it("climbs only one level from a nested subroutine", () => {
    expect(parentFlowNodeLocation(["lobby-loop", "nested-routine"])).toEqual({
      depth: "subroutine",
      subroutinePath: ["lobby-loop"]
    });
  });

  it("returns from a game-state subroutine to the root subroutine layer", () => {
    expect(parentFlowNodeLocation([])).toEqual({
      depth: "subroutines",
      subroutinePath: []
    });
  });

  it("accepts only subroutine-canvas background double-clicks", () => {
    expect(shouldNavigateUpFromCanvasDoubleClick("subroutine", false)).toBe(true);
    expect(shouldNavigateUpFromCanvasDoubleClick("subroutine", true)).toBe(false);
    expect(shouldNavigateUpFromCanvasDoubleClick("subroutines", false)).toBe(false);
  });
});
