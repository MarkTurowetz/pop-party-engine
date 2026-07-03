import { describe, expect, it } from "vitest";
import { gameTextDefaultFontFamily, gameTextFontOptions } from "../textFonts";
import { PartyGameTextFit } from "./textFit";

describe("PartyGameTextFit (ported text-fit)", () => {
  it("normalizeTextFieldElement applies surface-aware fallbacks", () => {
    const stage = PartyGameTextFit.normalizeTextFieldElement({}, {});
    expect(stage.fontSize).toBe(58);
    expect(stage.fontColor).toBe("#ffffff");
    expect(stage.fontFamily).toBe(gameTextDefaultFontFamily);
    const controller = PartyGameTextFit.normalizeTextFieldElement({ surface: "controller" }, {});
    expect(controller.fontSize).toBe(42);
    expect(controller.fontColor).toBe("#17131f");
  });

  it("normalizes text font families to the shared dropdown options", () => {
    const fontFamily = gameTextFontOptions.find((option) => option.label === "Impact")?.value || "";
    const layout = PartyGameTextFit.normalizeTextFieldElement({ fontFamily }, {});
    expect(layout.fontFamily).toBe(fontFamily);
    const unknown = PartyGameTextFit.normalizeTextFieldElement({ fontFamily: "Papyrus" }, {});
    expect(unknown.fontFamily).toBe(gameTextDefaultFontFamily);
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

  it("measureGameText auto-fits when enabled and preserves manual size when disabled", () => {
    const manual = PartyGameTextFit.measureGameText({ text: "STAGE", element: { width: 400, height: 80, fontSize: 48, autoFitText: false }, fallbackSize: 48 });
    const singleLine = PartyGameTextFit.measureGameText({ text: "STAGE", element: { width: 400, height: 80, fontSize: 12, autoFitText: true }, fallbackSize: 12 });
    const multiline = PartyGameTextFit.measureGameText({ text: "ONE\nTWO\nTHREE", element: { width: 80, height: 24, fontSize: 36, autoFitText: true }, fallbackSize: 36 });
    const constrained = PartyGameTextFit.measureGameText({ text: "SUPERLONGANSWER", element: { width: 80, height: 20, fontSize: 48, autoFitText: true }, fallbackSize: 48 });
    const widthLimited = PartyGameTextFit.measureGameText({ text: "Starting Game", element: { width: 200, height: 200, fontSize: 40, autoFitText: true }, fallbackSize: 40, options: { textTransform: "uppercase" } });
    expect(Number(manual.fontSize)).toBe(48);
    expect(Number(singleLine.fontSize)).toBeGreaterThan(12);
    expect(Number(multiline.fontSize)).toBeLessThanOrEqual(8.2);
    expect(Number(constrained.fontSize)).toBeLessThan(16);
    expect(Number(widthLimited.fontSize)).toBeLessThan(45);
    expect(Number(widthLimited.measuredWidth)).toBeLessThanOrEqual(200.5);
  });

  it("fittedLayoutTextSize returns fitted or manual sizes through the same path", () => {
    expect(PartyGameTextFit.fittedLayoutTextSize({ fontSize: 22, autoFitText: false }, "x")).toBe(22);
    expect(PartyGameTextFit.fittedLayoutTextSize({ fontSize: 22, autoFitText: false }, "x", 80)).toBe(80);
    expect(PartyGameTextFit.fittedLayoutTextSize({ width: 400, height: 80, fontSize: 22, autoFitText: true }, "x", 22)).toBeGreaterThan(22);
    expect(PartyGameTextFit.fittedLayoutTextSize({}, "x")).toBe(6);
  });

  it("installs the global bridge on import", () => {
    const host = globalThis as typeof globalThis & { PartyGameTextFit?: { fixedTextLayout?: unknown }; fittedLayoutTextSize?: unknown };
    expect(host.PartyGameTextFit?.fixedTextLayout).toBeTypeOf("function");
    expect(host.fittedLayoutTextSize).toBeTypeOf("function");
  });
});
