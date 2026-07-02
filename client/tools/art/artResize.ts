export interface ArtResizeInput {
  originWidth: number;
  originHeight: number;
  deltaX: number;
  deltaY: number;
  minSize?: number;
  preserveAspectRatio?: boolean;
  snapToInteger?: boolean;
}

export interface ArtResizeDimensions {
  width: number;
  height: number;
}

function safeDimension(value: number, minSize: number): number {
  return Math.max(minSize, Number.isFinite(value) ? value : minSize);
}

export function artResizeDimensions(input: ArtResizeInput): ArtResizeDimensions {
  const minSize = safeDimension(Number(input.minSize ?? 4), 1);
  const originWidth = safeDimension(Number(input.originWidth), minSize);
  const originHeight = safeDimension(Number(input.originHeight), minSize);
  const deltaX = Number(input.deltaX || 0);
  const deltaY = Number(input.deltaY || 0);
  const target = {
    width: safeDimension(originWidth + deltaX, minSize),
    height: safeDimension(originHeight + deltaY, minSize)
  };

  const snap = (dimensions: ArtResizeDimensions): ArtResizeDimensions =>
    input.snapToInteger
      ? {
          width: safeDimension(Math.round(dimensions.width), minSize),
          height: safeDimension(Math.round(dimensions.height), minSize)
        }
      : dimensions;

  if (!input.preserveAspectRatio) return snap(target);

  const widthScale = (originWidth + deltaX) / originWidth;
  const heightScale = (originHeight + deltaY) / originHeight;
  const dominantScale = Math.abs(deltaX) >= Math.abs(deltaY) ? widthScale : heightScale;
  const minScale = Math.max(minSize / originWidth, minSize / originHeight);
  const scale = Math.max(minScale, Number.isFinite(dominantScale) ? dominantScale : 1);
  return snap({
    width: originWidth * scale,
    height: originHeight * scale
  });
}
