"use strict";

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function dimension(value, fallback = 1) {
  return Math.max(1, num(value, fallback));
}

function itemExtent(item, direction) {
  const size = direction === "horizontal" ? dimension(item.width, 1) : dimension(item.height, 1);
  return size * Math.max(0.001, Math.abs(num(item.scale, 1)));
}

function distributedContainerItemPositions(container, items, direction) {
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

module.exports = Object.freeze({ distributedContainerItemPositions });
