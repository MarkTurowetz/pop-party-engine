import { describe, expect, it } from "vitest";
import {
  browserCompositionSelectionAfterClick,
  browserDragKeys
} from "./ArtCompositionBrowser";

describe("ArtCompositionBrowser multi-selection", () => {
  it("uses ordinary clicks for a single primary composition", () => {
    const result = browserCompositionSelectionAfterClick(["a", "b"], "b", "c", { additive: false, range: false });
    expect([...result.ids]).toEqual(["c"]);
    expect(result.primaryId).toBe("c");
  });

  it("uses Command-click to add and remove compositions while retaining a primary", () => {
    const added = browserCompositionSelectionAfterClick(["a"], "a", "b", { additive: true, range: false });
    expect([...added.ids]).toEqual(["a", "b"]);
    expect(added.primaryId).toBe("b");

    const removed = browserCompositionSelectionAfterClick(added.ids, added.primaryId, "b", { additive: true, range: false });
    expect([...removed.ids]).toEqual(["a"]);
    expect(removed.primaryId).toBe("a");
  });

  it("keeps one composition selected because the editor requires an active document", () => {
    const result = browserCompositionSelectionAfterClick(["a"], "a", "a", { additive: true, range: false });
    expect([...result.ids]).toEqual(["a"]);
    expect(result.primaryId).toBe("a");
  });

  it("uses Shift-click to select the visible range from the most recent selection", () => {
    const result = browserCompositionSelectionAfterClick(["b"], "b", "e", {
      additive: false,
      orderedIds: ["a", "b", "c", "d", "e", "f"],
      range: true
    });
    expect([...result.ids]).toEqual(["b", "c", "d", "e"]);
    expect(result.primaryId).toBe("e");
  });

  it("unions a Shift range with the current group when Command is also held", () => {
    const result = browserCompositionSelectionAfterClick(["a", "d"], "d", "f", {
      additive: true,
      orderedIds: ["a", "b", "c", "d", "e", "f"],
      range: true
    });
    expect([...result.ids]).toEqual(["a", "d", "e", "f"]);
    expect(result.primaryId).toBe("f");
  });

  it("reads grouped drag payloads and legacy single-key payloads", () => {
    expect(browserDragKeys('["composition:a","composition:b","composition:a"]')).toEqual([
      "composition:a",
      "composition:b"
    ]);
    expect(browserDragKeys("composition:a")).toEqual(["composition:a"]);
  });
});
