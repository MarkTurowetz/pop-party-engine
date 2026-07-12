import { describe, expect, it } from "vitest";
import { artInspectorNumberExpressionValue } from "./artInspectorNumberExpression";

describe("art inspector number expressions", () => {
  it("treats a lone negative number as an absolute replacement", () => {
    expect(artInspectorNumberExpressionValue("-75", -50)).toBe(-75);
    expect(artInspectorNumberExpressionValue("-10", 25)).toBe(-10);
  });

  it("evaluates arithmetic appended to the existing visible value", () => {
    expect(artInspectorNumberExpressionValue("-50-10", -50)).toBe(-60);
    expect(artInspectorNumberExpressionValue("-50+10", -50)).toBe(-40);
    expect(artInspectorNumberExpressionValue("20/2+5", 20)).toBe(15);
  });

  it("preserves leading plus, multiply, and divide as relative shortcuts", () => {
    expect(artInspectorNumberExpressionValue("+10", -50)).toBe(-40);
    expect(artInspectorNumberExpressionValue("*2", -50)).toBe(-100);
    expect(artInspectorNumberExpressionValue("/2", -50)).toBe(-25);
  });

  it("rejects incomplete expressions and division by zero", () => {
    expect(artInspectorNumberExpressionValue("-50-", -50)).toBeNull();
    expect(artInspectorNumberExpressionValue("/0", -50)).toBeNull();
    expect(artInspectorNumberExpressionValue("nope", -50)).toBeNull();
  });
});
