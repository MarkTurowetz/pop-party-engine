export const lifecycleLabels = Object.freeze({
  park: "Park",
  on: "On",
  off: "Off",
  appear: "Appear",
  update: "Update",
  disappear: "Disappear"
} as const);

export type LifecycleLabel = (typeof lifecycleLabels)[keyof typeof lifecycleLabels];

const legacyByCanonical = new Map<string, LifecycleLabel>(
  Object.entries(lifecycleLabels).flatMap(([legacy, canonical]) => [[legacy, canonical], [canonical, canonical]])
);

export function canonicalLifecycleLabel(value: unknown): LifecycleLabel | null {
  return legacyByCanonical.get(String(value ?? "").trim()) || null;
}

export function normalizeLifecycleLabel(value: unknown): string {
  const text = String(value ?? "").trim();
  return canonicalLifecycleLabel(text) || text;
}

export function lifecycleLabelsMatch(left: unknown, right: unknown): boolean {
  const leftText = String(left ?? "").trim();
  const rightText = String(right ?? "").trim();
  const leftLifecycle = canonicalLifecycleLabel(leftText);
  const rightLifecycle = canonicalLifecycleLabel(rightText);
  if (leftLifecycle || rightLifecycle) return Boolean(leftLifecycle && rightLifecycle && leftLifecycle === rightLifecycle);
  return leftText === rightText;
}

export function uniqueTimelineLabelMatch<T extends { name: string }>(labels: T[], requested: unknown): T | null {
  const matches = (labels || []).filter((label) => lifecycleLabelsMatch(label.name, requested));
  return matches.length === 1 ? matches[0] : null;
}

export const PartyGameLifecycleLabels = {
  lifecycleLabels,
  canonicalLifecycleLabel,
  normalizeLifecycleLabel,
  lifecycleLabelsMatch,
  uniqueTimelineLabelMatch
};

if (typeof globalThis !== "undefined") {
  (globalThis as typeof globalThis & { PartyGameLifecycleLabels?: typeof PartyGameLifecycleLabels }).PartyGameLifecycleLabels =
    PartyGameLifecycleLabels;
}
