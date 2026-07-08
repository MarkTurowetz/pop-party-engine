import { describe, expect, it } from "vitest";
import { fuzzyFilterFlowOptions } from "./FlowFreeformFuzzyInput";

describe("FlowFreeformFuzzyInput helpers", () => {
  const options = [
    { id: "appear", label: "appear" },
    { id: "text-pop", label: "Text Pop" },
    { id: "player-name-bounce", label: "Player Name Bounce" }
  ];

  it("returns all options for an empty query", () => {
    expect(fuzzyFilterFlowOptions("", options)).toEqual(options);
  });

  it("matches substrings and fuzzy abbreviations against labels and ids", () => {
    expect(fuzzyFilterFlowOptions("pop", options).map((option) => option.id)).toEqual(["text-pop"]);
    expect(fuzzyFilterFlowOptions("pnb", options).map((option) => option.id)).toEqual(["player-name-bounce"]);
    expect(fuzzyFilterFlowOptions("txt", options).map((option) => option.id)).toEqual(["text-pop"]);
  });

  it("returns no suggestions when nothing matches so callers can keep freeform text", () => {
    expect(fuzzyFilterFlowOptions("future-label", options)).toEqual([]);
  });
});
