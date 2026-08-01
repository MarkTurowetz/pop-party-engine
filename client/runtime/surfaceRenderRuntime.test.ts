import { describe, expect, it, vi } from "vitest";
import {
  AnimationFrameRenderQueue,
  semanticSurfaceRevision,
  surfacePayloadMatches,
  SurfaceSliceReconciler
} from "./surfaceRenderRuntime";

describe("surface render runtime", () => {
  it("uses surface revisions when available and remains compatible with room revisions", () => {
    expect(semanticSurfaceRevision({ revision: 40, surfaceRevision: 3 })).toBe(3);
    expect(semanticSurfaceRevision({ revision: 40 })).toBe(40);
  });

  it("accepts matching and legacy flat payloads but rejects the opposite surface", () => {
    expect(surfacePayloadMatches({ surface: "controller", surfaceRevision: 2 }, "controller")).toBe(true);
    expect(surfacePayloadMatches({ revision: 7 }, "controller")).toBe(true);
    expect(surfacePayloadMatches({ surface: "stage", surfaceRevision: 9 }, "controller")).toBe(false);
  });

  it("detects only semantic slice changes regardless of object key order", () => {
    const slices = new SurfaceSliceReconciler();
    expect(slices.changed("players", { shown: true, players: [{ id: "one" }] })).toBe(true);
    expect(slices.changed("players", { players: [{ id: "one" }], shown: true })).toBe(false);
    expect(slices.changed("players", { shown: false, players: [{ id: "one" }] })).toBe(true);
    expect(slices.changed("players", { shown: false, players: [{ id: "one" }] }, true)).toBe(true);
  });

  it("coalesces a synchronous Stage burst to the latest projection in one animation frame", () => {
    const callbacks: FrameRequestCallback[] = [];
    const render = vi.fn();
    const queue = new AnimationFrameRenderQueue(render, (callback) => {
      callbacks.push(callback);
      return callbacks.length;
    });

    queue.enqueue({ revision: 1 });
    queue.enqueue({ revision: 2 });
    queue.enqueue({ revision: 3 });
    expect(callbacks).toHaveLength(1);
    expect(render).not.toHaveBeenCalled();
    callbacks[0](16);
    expect(render).toHaveBeenCalledOnce();
    expect(render).toHaveBeenCalledWith({ revision: 3 });
  });
});
