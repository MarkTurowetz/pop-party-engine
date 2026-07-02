export type DistributionDirection = "horizontal" | "vertical";

export interface DistributedContainerSize {
  width?: unknown;
  height?: unknown;
}

export interface DistributedItemSize {
  width?: unknown;
  height?: unknown;
  scale?: unknown;
}

export interface DistributedItemPosition {
  x: number;
  y: number;
}

function num(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function dimension(value: unknown, fallback = 1): number {
  return Math.max(1, num(value, fallback));
}

function itemScale(value: unknown): number {
  return Math.max(0.001, Math.abs(num(value, 1)));
}

function itemExtent(item: DistributedItemSize, direction: DistributionDirection): number {
  const size = direction === "horizontal" ? dimension(item.width, 1) : dimension(item.height, 1);
  return size * itemScale(item.scale);
}

/**
 * Returns center-point positions for children inside a distributed container.
 *
 * Children are placed by their own origin/center. Distribution spacing is based
 * on the child extents in the active direction, so differently sized prefab
 * references still remain centered as a group inside their parent container.
 */
export function distributedContainerItemPositions(
  container: DistributedContainerSize,
  items: DistributedItemSize[],
  direction: DistributionDirection
): DistributedItemPosition[] {
  const itemList = Array.isArray(items) ? items : [];
  if (!itemList.length) return [];

  const width = dimension(container.width, 1);
  const height = dimension(container.height, 1);
  const primarySize = direction === "horizontal" ? width : height;
  const crossCenter = (direction === "horizontal" ? height : width) / 2;
  const extents = itemList.map((item) => itemExtent(item, direction));
  const totalExtent = extents.reduce((sum, extent) => sum + extent, 0);
  const gap = Math.max(0, (primarySize - totalExtent) / (itemList.length + 1));
  const distributedExtent = totalExtent + gap * Math.max(0, itemList.length - 1);
  let cursor = (primarySize - distributedExtent) / 2;

  return itemList.map((_, index) => {
    const extent = extents[index];
    const center = cursor + extent / 2;
    cursor += extent + gap;
    return direction === "horizontal" ? { x: center, y: crossCenter } : { x: crossCenter, y: center };
  });
}
