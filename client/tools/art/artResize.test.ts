import { describe, expect, it } from "vitest";
import { artResizeDimensions } from "./artResize";

describe("artResizeDimensions", () => {
  it("resizes width and height independently by default", () => {
    expect(artResizeDimensions({ originWidth: 200, originHeight: 100, deltaX: 40, deltaY: -20 })).toEqual({
      width: 240,
      height: 80
    });
  });

  it("snaps width and height to whole numbers when requested", () => {
    expect(
      artResizeDimensions({ originWidth: 200, originHeight: 100, deltaX: 10.4, deltaY: -4.6, snapToInteger: true })
    ).toEqual({
      width: 210,
      height: 95
    });
  });

  it("preserves the original aspect ratio when requested", () => {
    const resized = artResizeDimensions({
      originWidth: 200,
      originHeight: 100,
      deltaX: 40,
      deltaY: 120,
      preserveAspectRatio: true
    });
    expect(resized.width / resized.height).toBeCloseTo(2);
  });

  it("uses the pointer axis that best matches the requested drag", () => {
    expect(
      artResizeDimensions({ originWidth: 200, originHeight: 100, deltaX: 80, deltaY: 0, preserveAspectRatio: true })
    ).toEqual({ width: 280, height: 140 });
    expect(
      artResizeDimensions({ originWidth: 200, originHeight: 100, deltaX: 0, deltaY: 50, preserveAspectRatio: true })
    ).toEqual({ width: 300, height: 150 });
  });

  it("can preserve aspect ratio and snap dimensions together", () => {
    expect(
      artResizeDimensions({
        originWidth: 200,
        originHeight: 100,
        deltaX: 41.6,
        deltaY: 0,
        preserveAspectRatio: true,
        snapToInteger: true
      })
    ).toEqual({ width: 242, height: 121 });
  });

  it("keeps dimensions above the minimum size", () => {
    expect(
      artResizeDimensions({
        originWidth: 200,
        originHeight: 100,
        deltaX: -1000,
        deltaY: -1000,
        minSize: 8,
        preserveAspectRatio: true
      })
    ).toEqual({ width: 16, height: 8 });
  });
});
