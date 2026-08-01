type FrameRequest = (callback: FrameRequestCallback) => number;

function stableValue(value: unknown): string {
  if (value === undefined) return "undefined";
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableValue).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${stableValue(object[key])}`).join(",")}}`;
}

export class SurfaceSliceReconciler {
  private readonly fingerprints = new Map<string, string>();

  changed(slice: string, value: unknown, force = false): boolean {
    const fingerprint = stableValue(value);
    const changed = force || this.fingerprints.get(slice) !== fingerprint;
    this.fingerprints.set(slice, fingerprint);
    return changed;
  }

  reset(): void {
    this.fingerprints.clear();
  }
}

export class AnimationFrameRenderQueue<T> {
  private pending: T | null = null;
  private frameId: number | null = null;

  constructor(
    private readonly render: (value: T) => void,
    private readonly requestFrame: FrameRequest = globalThis.requestAnimationFrame.bind(globalThis)
  ) {}

  enqueue(value: T): void {
    this.pending = value;
    if (this.frameId !== null) return;
    this.frameId = this.requestFrame(() => {
      this.frameId = null;
      const next = this.pending;
      this.pending = null;
      if (next !== null) this.render(next);
    });
  }
}

export function semanticSurfaceRevision(payload: Record<string, unknown>): number {
  const surfaceRevision = Number(payload.surfaceRevision);
  if (Number.isFinite(surfaceRevision) && surfaceRevision >= 0) return surfaceRevision;
  return Number(payload.revision);
}

export function surfacePayloadMatches(payload: Record<string, unknown>, expectedSurface: "stage" | "controller"): boolean {
  const surface = String(payload.surface || "");
  return !surface || surface === expectedSurface;
}
