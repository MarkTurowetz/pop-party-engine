import { describe, expect, it } from "vitest";
import type { LayoutElement } from "../../types/game-data";
import {
  canonicalLayoutTag,
  fuzzyLayoutTags,
  layoutElementHasTag,
  layoutViewTags,
  normalizeLayoutTags
} from "./layoutTags";

describe("controller layout configuration tags", () => {
  it("normalizes whitespace and deduplicates without changing the first display spelling", () => {
    expect(normalizeLayoutTags([" Phase One ", "phase   one", "Recording", ""])).toEqual([
      "Phase One",
      "Recording"
    ]);
  });

  it("derives tags only from the elements in the current view", () => {
    const elements = [
      { id: "one", tags: ["Phase One", "Recording"] },
      { id: "two", tags: ["phase one", "Review"] }
    ] as LayoutElement[];

    expect(layoutViewTags(elements)).toEqual(["Phase One", "Recording", "Review"]);
    expect(layoutElementHasTag(elements[1], "Phase One")).toBe(true);
    expect(canonicalLayoutTag(layoutViewTags(elements), "phase one")).toBe("Phase One");
  });

  it("supports contains and subsequence fuzzy search", () => {
    const tags = ["Phase One", "Recording", "Review Answers"];
    expect(fuzzyLayoutTags(tags, "one")).toEqual(["Phase One"]);
    expect(fuzzyLayoutTags(tags, "rvw")).toEqual(["Review Answers"]);
  });
});
