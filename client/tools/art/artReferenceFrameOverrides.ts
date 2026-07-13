import { normalizeTimeline, type TimelineProperties } from "../../../shared/timeline-model";
import { timelineSnapshotAt } from "../../runtime/timelinePlayer";
import type { ArtComponent, ArtComposition } from "../../types/game-data";
import { artComponentTargetPathId } from "../shared/artComponentTargets";
import type { TimelinePreviewOverrides } from "./artTimelinePreviewMapping";

const MAX_REFERENCE_DEPTH = 20;

function targetParts(value: unknown): string[] {
  return String(value || "")
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean);
}

function mergeTargetProps(output: TimelinePreviewOverrides, targetId: string, props: TimelineProperties): void {
  if (!targetId) return;
  output[targetId] = { ...(output[targetId] || {}), ...props };
}

function scopedReferenceTargetId(referencePath: string[], compositionId: string, targetId: string): string {
  const cleanTargetId = String(targetId || "").trim();
  if (!cleanTargetId || cleanTargetId === "self" || cleanTargetId === compositionId) {
    return artComponentTargetPathId(referencePath);
  }
  const parts = targetParts(cleanTargetId);
  return artComponentTargetPathId([
    ...referencePath,
    ...(parts[0] === compositionId ? parts.slice(1) : parts)
  ]);
}

/**
 * A placed prefab reference is an independent timeline instance. Its resting
 * editor representation therefore starts at frame 0 of its own composition,
 * regardless of the frame selected in the parent composition.
 */
export function artReferenceFrameZeroOverrides(
  components: ArtComponent[],
  compositionById: Map<string, ArtComposition>
): TimelinePreviewOverrides {
  const output: TimelinePreviewOverrides = {};

  const visit = (component: ArtComponent, path: string[], referenceStack: Set<string>, depth: number): void => {
    if (depth > MAX_REFERENCE_DEPTH) return;
    const componentPath = [...path, String(component.id || "").trim()].filter(Boolean);
    if (component.kind === "reference") {
      const compositionId = String(component.artCompositionId || "").trim();
      const referenced = compositionById.get(compositionId);
      if (referenced && !referenceStack.has(compositionId)) {
        const nextStack = new Set([...referenceStack, compositionId]);
        for (const child of referenced.components || []) visit(child, componentPath, nextStack, depth + 1);
        const timeline = normalizeTimeline(referenced.timeline);
        if (timeline) {
          for (const [targetId, props] of Object.entries(timelineSnapshotAt(timeline, 0).targets)) {
            mergeTargetProps(output, scopedReferenceTargetId(componentPath, compositionId, targetId), props);
          }
        }
      }
      return;
    }
    for (const child of component.children || []) visit(child, componentPath, referenceStack, depth + 1);
  };

  for (const component of components || []) visit(component, [], new Set(), 0);
  return output;
}
