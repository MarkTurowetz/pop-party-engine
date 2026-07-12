import { describe, expect, it } from "vitest";
import {
  ART_PREVIEW_MAX_SCALE,
  ART_PREVIEW_MIN_SCALE,
  artPreviewScaleFromWheel,
  artPreviewScrollCenteringWorldOrigin,
  artPreviewScrollForCursorZoom,
  artPreviewScrollForPan,
  artPreviewScrollPreservingWorldFocalPoint
} from "./artPreviewCamera";

describe("art preview camera", () => {
  it("zooms in for wheel-up, out for wheel-down, and clamps the camera scale", () => {
    expect(artPreviewScaleFromWheel(1, -100)).toBeGreaterThan(1);
    expect(artPreviewScaleFromWheel(1, 100)).toBeLessThan(1);
    expect(artPreviewScaleFromWheel(ART_PREVIEW_MAX_SCALE, -1000)).toBe(ART_PREVIEW_MAX_SCALE);
    expect(artPreviewScaleFromWheel(ART_PREVIEW_MIN_SCALE, 1000)).toBe(ART_PREVIEW_MIN_SCALE);
  });

  it("keeps the world point beneath the cursor fixed while zooming", () => {
    const currentScroll = { left: 200, top: 100 };
    const pointer = { x: 300, y: 150 };
    const next = artPreviewScrollForCursorZoom(currentScroll, pointer, 1, 2);

    expect(next).toEqual({ left: 700, top: 350 });
    expect((next.left + pointer.x) / 2).toBe((currentScroll.left + pointer.x) / 1);
    expect((next.top + pointer.y) / 2).toBe((currentScroll.top + pointer.y) / 1);
  });

  it("accounts for fixed viewport padding while keeping cursor zoom anchored", () => {
    const next = artPreviewScrollForCursorZoom(
      { left: 50, top: 40 },
      { x: 250, y: 150 },
      1,
      2,
      { x: 250, y: 150 }
    );

    expect(next).toEqual({ left: 100, top: 80 });
  });

  it("centers world zero and preserves it when visual bounds move", () => {
    const previous = {
      compositionId: "vip",
      origin: { x: 300, y: 190 },
      viewportCenter: { x: 250, y: 150 },
      scale: 1
    };
    const next = { ...previous, origin: { x: 350, y: 230 } };
    const centered = artPreviewScrollCenteringWorldOrigin(previous);

    expect(centered).toEqual({ left: 50, top: 40 });
    expect(artPreviewScrollPreservingWorldFocalPoint(centered, previous, next)).toEqual({ left: 100, top: 80 });
  });

  it("pans the viewport opposite the middle-button pointer movement", () => {
    expect(artPreviewScrollForPan({ left: 400, top: 300 }, { x: 60, y: -40 })).toEqual({ left: 340, top: 340 });
    expect(artPreviewScrollForPan({ left: 10, top: 10 }, { x: 50, y: 50 })).toEqual({ left: 0, top: 0 });
  });
});
