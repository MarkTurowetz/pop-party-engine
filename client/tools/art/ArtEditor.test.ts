import { describe, expect, it } from "vitest";
import { isArtCompositionDuplicateShortcut } from "./ArtEditor";

describe("ArtEditor composition shortcuts", () => {
  it("uses Option+Command+D for reliable composition duplication", () => {
    expect(isArtCompositionDuplicateShortcut({
      altKey: true,
      ctrlKey: false,
      key: "d",
      metaKey: true,
      repeat: false,
      shiftKey: false
    })).toBe(true);
    expect(isArtCompositionDuplicateShortcut({
      altKey: false,
      ctrlKey: false,
      key: "d",
      metaKey: true,
      repeat: false,
      shiftKey: false
    })).toBe(false);
  });
});
