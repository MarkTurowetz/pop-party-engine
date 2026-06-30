import { describe, expect, it } from "vitest";
import { fuzzyFilterActionTypes, type ActionTypeOption } from "./ActionTypeSelect";

const options: ActionTypeOption[] = [
  { id: "presentText", label: "Present Text" },
  { id: "displayText", label: "Display Text" },
  { id: "setTimerShown", label: "Set Timer Shown" },
  { id: "startCraftingTimer", label: "Start Crafting Timer" },
  { id: "showPoints", label: "Show Points" }
];

describe("fuzzyFilterActionTypes", () => {
  it("returns all options for an empty query", () => {
    expect(fuzzyFilterActionTypes("", options)).toHaveLength(options.length);
    expect(fuzzyFilterActionTypes("   ", options)).toHaveLength(options.length);
  });

  it("matches by substring across labels", () => {
    const ids = fuzzyFilterActionTypes("timer", options).map((option) => option.id);
    expect(ids).toEqual(expect.arrayContaining(["setTimerShown", "startCraftingTimer"]));
    expect(ids).not.toContain("showPoints");
  });

  it("matches a non-contiguous subsequence", () => {
    const ids = fuzzyFilterActionTypes("stxt", options).map((option) => option.id);
    // "s..t..xt" hits "Set ... Text"-style labels via subsequence
    expect(ids.length).toBeGreaterThan(0);
    expect(ids).not.toContain("showPoints");
  });

  it("ranks a leading-substring match above a scattered one", () => {
    const ids = fuzzyFilterActionTypes("show", options).map((option) => option.id);
    // "Show Points" / "Set Timer Shown" both contain "show"; the word-leading one ranks first
    expect(ids[0]).toBe("showPoints");
  });

  it("excludes options with no match", () => {
    expect(fuzzyFilterActionTypes("zzzz", options)).toHaveLength(0);
  });
});
