import { describe, expect, it } from "vitest";
import { applyDragModifiers, createDragModifierState } from "./dragModifiers";

describe("drag modifiers", () => {
  it("locks y when shift-drag starts horizontally", () => {
    const state = createDragModifierState();

    expect(
      applyDragModifiers({ originX: 10, originY: 20, deltaX: 25, deltaY: 5, shiftKey: true }, state)
    ).toEqual({ x: 35, y: 20, movementAxis: "x" });

    expect(
      applyDragModifiers({ originX: 10, originY: 20, deltaX: 25, deltaY: 90, shiftKey: true }, state)
    ).toEqual({ x: 35, y: 20, movementAxis: "x" });
  });

  it("locks x when shift-drag starts vertically", () => {
    const state = createDragModifierState();

    expect(
      applyDragModifiers({ originX: 10, originY: 20, deltaX: 2, deltaY: -30, shiftKey: true }, state)
    ).toEqual({ x: 10, y: -10, movementAxis: "y" });
  });

  it("does not lock an axis when shift is not held", () => {
    expect(
      applyDragModifiers({ originX: 10, originY: 20, deltaX: 2.3, deltaY: 4.8 }, createDragModifierState())
    ).toEqual({ x: 12.3, y: 24.8, movementAxis: null });
  });

  it("snaps coordinates to whole numbers while command or control is held", () => {
    expect(
      applyDragModifiers({ originX: 10, originY: 20, deltaX: 2.3, deltaY: 4.8, metaKey: true }, createDragModifierState())
    ).toEqual({ x: 12, y: 25, movementAxis: null });
    expect(
      applyDragModifiers({ originX: 10, originY: 20, deltaX: 2.3, deltaY: 4.8, ctrlKey: true }, createDragModifierState())
    ).toEqual({ x: 12, y: 25, movementAxis: null });
  });
});
