import { describe, expect, it } from "vitest";
import type { LayoutElement } from "../types/game-data";
import {
  layoutElementsTopFirst,
  layoutElementStackOffset,
  synchronizeLayoutElementStack
} from "./layoutStackOrder";

describe("layout stack order", () => {
  it("keeps array order when legacy z-order is absent", () => {
    const elements = [{ id: "front" }, { id: "back" }] as LayoutElement[];
    expect(layoutElementsTopFirst(elements).map((element) => element.id)).toEqual([
      "front",
      "back"
    ]);
  });

  it("imports legacy zIndex order and synchronizes top-first ranks", () => {
    const elements = [
      { id: "panel", zIndex: 0 },
      { id: "avatar", zIndex: 6 },
      { id: "done", zIndex: 20 }
    ] as LayoutElement[];
    expect(synchronizeLayoutElementStack(elements)).toEqual([
      expect.objectContaining({ id: "panel", zIndex: 20 }),
      expect.objectContaining({ id: "avatar", zIndex: 6 }),
      expect.objectContaining({ id: "done", zIndex: 0 })
    ]);
    expect(synchronizeLayoutElementStack(layoutElementsTopFirst(elements))).toEqual([
      expect.objectContaining({ id: "done", zIndex: 20 }),
      expect.objectContaining({ id: "avatar", zIndex: 6 }),
      expect.objectContaining({ id: "panel", zIndex: 0 })
    ]);
    expect(layoutElementStackOffset(0, 3)).toBe(2);
    expect(layoutElementStackOffset(2, 3)).toBe(0);
  });
});
