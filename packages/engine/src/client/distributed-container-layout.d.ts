export type DistributionDirection = "horizontal" | "vertical";
export interface DistributedContainerSize { width?: unknown; height?: unknown; }
export interface DistributedItemSize { width?: unknown; height?: unknown; scale?: unknown; }
export interface DistributedItemPosition { x: number; y: number; }
export function distributedContainerItemPositions(container: DistributedContainerSize, items: DistributedItemSize[], direction: DistributionDirection): DistributedItemPosition[];
