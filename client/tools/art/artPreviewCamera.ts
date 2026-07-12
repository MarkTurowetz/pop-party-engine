export const ART_PREVIEW_MIN_SCALE = 0.1;
export const ART_PREVIEW_MAX_SCALE = 8;

export interface ArtPreviewScrollPosition {
  left: number;
  top: number;
}

export interface ArtPreviewCameraLayout {
  compositionId: string;
  origin: { x: number; y: number };
  viewportCenter: { x: number; y: number };
  scale: number;
}

function finiteNumber(value: unknown, fallback: number): number {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
}

export function clampArtPreviewScale(scale: number): number {
  return Math.max(ART_PREVIEW_MIN_SCALE, Math.min(ART_PREVIEW_MAX_SCALE, finiteNumber(scale, 1)));
}

export function artPreviewScaleFromWheel(currentScale: number, deltaY: number): number {
  const scale = clampArtPreviewScale(currentScale);
  const wheelDelta = Math.max(-1000, Math.min(1000, finiteNumber(deltaY, 0)));
  return clampArtPreviewScale(scale * Math.exp(-wheelDelta * 0.0015));
}

export function artPreviewScrollForCursorZoom(
  currentScroll: ArtPreviewScrollPosition,
  pointer: { x: number; y: number },
  currentScale: number,
  nextScale: number,
  fixedInset: { x: number; y: number } = { x: 0, y: 0 }
): ArtPreviewScrollPosition {
  const oldScale = Math.max(0.001, clampArtPreviewScale(currentScale));
  const cleanNextScale = clampArtPreviewScale(nextScale);
  const pointerX = finiteNumber(pointer.x, 0);
  const pointerY = finiteNumber(pointer.y, 0);
  const insetX = finiteNumber(fixedInset.x, 0);
  const insetY = finiteNumber(fixedInset.y, 0);
  const worldX = (finiteNumber(currentScroll.left, 0) + pointerX - insetX) / oldScale;
  const worldY = (finiteNumber(currentScroll.top, 0) + pointerY - insetY) / oldScale;
  return {
    left: Math.max(0, insetX + worldX * cleanNextScale - pointerX),
    top: Math.max(0, insetY + worldY * cleanNextScale - pointerY)
  };
}

export function artPreviewScrollCenteringWorldOrigin(layout: ArtPreviewCameraLayout): ArtPreviewScrollPosition {
  return {
    left: Math.max(0, layout.origin.x - layout.viewportCenter.x),
    top: Math.max(0, layout.origin.y - layout.viewportCenter.y)
  };
}

export function artPreviewScrollPreservingWorldFocalPoint(
  currentScroll: ArtPreviewScrollPosition,
  previousLayout: ArtPreviewCameraLayout,
  nextLayout: ArtPreviewCameraLayout
): ArtPreviewScrollPosition {
  const previousScale = Math.max(0.001, clampArtPreviewScale(previousLayout.scale));
  const nextScale = clampArtPreviewScale(nextLayout.scale);
  const worldX = (currentScroll.left + previousLayout.viewportCenter.x - previousLayout.origin.x) / previousScale;
  const worldY = (currentScroll.top + previousLayout.viewportCenter.y - previousLayout.origin.y) / previousScale;
  return {
    left: Math.max(0, nextLayout.origin.x + worldX * nextScale - nextLayout.viewportCenter.x),
    top: Math.max(0, nextLayout.origin.y + worldY * nextScale - nextLayout.viewportCenter.y)
  };
}

export function artPreviewScrollForPan(
  startScroll: ArtPreviewScrollPosition,
  pointerDelta: { x: number; y: number }
): ArtPreviewScrollPosition {
  return {
    left: Math.max(0, finiteNumber(startScroll.left, 0) - finiteNumber(pointerDelta.x, 0)),
    top: Math.max(0, finiteNumber(startScroll.top, 0) - finiteNumber(pointerDelta.y, 0))
  };
}
