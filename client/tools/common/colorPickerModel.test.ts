import { describe, expect, it } from "vitest";
import {
  colorAlphaPercent,
  colorValueFromRgba,
  colorWithAlphaPercent,
  hsvToRgba,
  parseColorValue,
  rgbaToHsv
} from "./colorPickerModel";

describe("color picker model", () => {
  it("accepts short, long, alpha, transparent, and rgba color inputs", () => {
    expect(parseColorValue("#fd6")).toEqual({ r: 255, g: 221, b: 102, a: 255 });
    expect(parseColorValue("#ffdd6680")).toEqual({ r: 255, g: 221, b: 102, a: 128 });
    expect(parseColorValue("transparent")).toEqual({ r: 0, g: 0, b: 0, a: 0 });
    expect(parseColorValue("rgba(23, 19, 31, 0.5)")).toEqual({ r: 23, g: 19, b: 31, a: 128 });
    expect(parseColorValue("not-a-color")).toBeNull();
  });

  it("serializes opaque colors as six digits and translucent colors as eight", () => {
    expect(colorValueFromRgba({ r: 255, g: 221, b: 102, a: 255 })).toBe("#ffdd66");
    expect(colorValueFromRgba({ r: 255, g: 221, b: 102, a: 128 })).toBe("#ffdd6680");
  });

  it("round trips RGB through HSV without channel drift", () => {
    const source = { r: 45, g: 211, b: 208, a: 201 };
    expect(hsvToRgba(rgbaToHsv(source), source.a)).toEqual(source);
  });

  it("exposes alpha as a percentage while preserving the byte representation", () => {
    const half = colorWithAlphaPercent({ r: 1, g: 2, b: 3, a: 255 }, 50);
    expect(half.a).toBe(128);
    expect(colorAlphaPercent(half)).toBe(50);
  });
});
