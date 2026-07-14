import { describe, expect, it } from "vitest";
import {
  browserCompositionSelectionAfterClick,
  browserDragKeys
} from "./ArtCompositionBrowser";

describe("ArtCompositionBrowser multi-selection", () => {
  it("uses ordinary clicks for a single primary composition", () => {
    const result = browserCompositionSelectionAfterClick(["a", "b"], "b", "c", false);
    expect([...result.ids]).toEqual(["c"]);
    expect(result.primaryId).toBe("c");
  });

  it("uses Command-click to add and remove compositions while retaining a primary", () => {
    const added = browserCompositionSelectionAfterClick(["a"], "a", "b", true);
    expect([...added.ids]).toEqual(["a", "b"]);
    expect(added.primaryId).toBe("b");

    const removed = browserCompositionSelectionAfterClick(added.ids, added.primaryId, "b", true);
    expect([...removed.ids]).toEqual(["a"]);
    expect(removed.primaryId).toBe("a");
  });

  it("keeps one composition selected because the editor requires an active document", () => {
    const result = browserCompositionSelectionAfterClick(["a"], "a", "a", true);
    expect([...result.ids]).toEqual(["a"]);
    expect(result.primaryId).toBe("a");
  });

  it("reads grouped drag payloads and legacy single-key payloads", () => {
    expect(browserDragKeys('["composition:a","composition:b","composition:a"]')).toEqual([
      "composition:a",
      "composition:b"
    ]);
    expect(browserDragKeys("composition:a")).toEqual(["composition:a"]);
  });
});
