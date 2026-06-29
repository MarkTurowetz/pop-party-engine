import { describe, expect, it } from "vitest";
import { PartyGameTextFit } from "./textFit";

describe("PartyGameTextFit (ported text-fit)", () => {
  it("normalizeTextFieldElement applies surface-aware fallbacks", () => {
    const stage = PartyGameTextFit.normalizeTextFieldElement({}, {});
    expect(stage.fontSize).toBe(58);
    expect(stage.fontColor).toBe("#ffffff");
    const controller = PartyGameTextFit.normalizeTextFieldElement({ surface: "controller" }, {});
    expect(controller.fontSize).toBe(42);
    expect(controller.fontColor).toBe("#17131f");
  });

  it("fixedTextLayout returns the legacy metric shape", () => {
    const layout = PartyGameTextFit.fixedTextLayout({ width: 200, height: 100 }, "Hi\nthere", 40, {});
    expect(layout.fontSize).toBe(40);
    expect(layout.lines).toEqual(["Hi", "there"]);
    expect(layout.boxWidth).toBe(200);
    expect(layout.lineBoxHeight).toBe(40);
    expect(layout.ascent).toBe(30);
  });

  it("layout text fields auto-fit unless autoFitText is explicitly false (regression guard)", () => {
    const implicit = PartyGameTextFit.normalizeTextFieldElement({ kind: "text", width: 400, height: 80 });
    const manual = PartyGameTextFit.normalizeTextFieldElement({ kind: "text", width: 400, height: 80, autoFitText: false, fontSize: 48 });
    expect(implicit.autoFitText).toBe(true);
    expect(manual.autoFitText).toBe(false);
  });

  it("measureGameText uses the manual font size and ignores auto-fit shrinking (regression guard)", () => {
    const small = PartyGameTextFit.measureGameText({ text: "STAGE", element: { width: 400, height: 80, fontSize: 12, autoFitText: true }, fallbackSize: 12 });
    const large = PartyGameTextFit.measureGameText({ text: "STAGE", element: { width: 400, height: 80, fontSize: 48, autoFitText: true }, fallbackSize: 48 });
    const multiline = PartyGameTextFit.measureGameText({ text: "ONE\nTWO\nTHREE", element: { width: 80, height: 24, fontSize: 36, autoFitText: true }, fallbackSize: 36 });
    expect(Number(small.fontSize)).toBe(12);
    expect(Number(large.fontSize)).toBe(48);
    expect(Number(multiline.fontSize)).toBe(36);
  });

  it("fittedLayoutTextSize prefers the fallback then the element size", () => {
    expect(PartyGameTextFit.fittedLayoutTextSize({ fontSize: 22 }, "x")).toBe(22);
    expect(PartyGameTextFit.fittedLayoutTextSize({ fontSize: 22 }, "x", 80)).toBe(80);
    expect(PartyGameTextFit.fittedLayoutTextSize({}, "x")).toBe(6);
  });

  it("installs the global bridge on import", () => {
    const host = globalThis as typeof globalThis & { PartyGameTextFit?: { fixedTextLayout?: unknown }; fittedLayoutTextSize?: unknown };
    expect(host.PartyGameTextFit?.fixedTextLayout).toBeTypeOf("function");
    expect(host.fittedLayoutTextSize).toBeTypeOf("function");
  });
});
