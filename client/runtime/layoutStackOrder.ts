import type { LayoutElement } from "../types/game-data";

function authoredZIndex(element: LayoutElement): number | null {
  if (!Object.prototype.hasOwnProperty.call(element, "zIndex")) return null;
  const value = Number(element.zIndex);
  return Number.isFinite(value) ? value : null;
}

/** Layout lists are authored top-first. Import legacy zIndex-only ordering. */
export function layoutElementsTopFirst(elements: readonly LayoutElement[]): LayoutElement[] {
  if (!elements.some((element) => authoredZIndex(element) !== null)) return [...elements];
  return elements
    .map((element, index) => ({ element, index, zIndex: authoredZIndex(element) ?? 0 }))
    .sort((left, right) => right.zIndex - left.zIndex || left.index - right.index)
    .map(({ element }) => element);
}

export function synchronizeLayoutElementStack(elements: readonly LayoutElement[]): LayoutElement[] {
  const available = elements
    .map((element) => authoredZIndex(element))
    .filter((value): value is number => value !== null)
    .sort((left, right) => right - left);
  let previous = Number.POSITIVE_INFINITY;
  return elements.map((element, index) => {
    const proposed = available[index] ?? elements.length - index - 1;
    const zIndex = proposed < previous ? proposed : previous - 1;
    previous = zIndex;
    return { ...element, zIndex };
  });
}

export function layoutElementStackOffset(index: number, total: number): number {
  return Math.max(0, total - index - 1);
}
