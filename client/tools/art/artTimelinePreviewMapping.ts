import type { ArtComponent } from "../../types/game-data";
import type { TimelineProperties } from "../../../shared/timeline-model";
import { artComponentTargetPathId } from "../shared/artComponentTargets";

export type TimelinePreviewOverrides = Record<string, TimelineProperties>;

function cleanTargetParts(id: string): string[] {
  return String(id || "")
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean);
}

function startsWithPath(parts: string[], prefix: string[]): boolean {
  return prefix.length > 0 && prefix.every((part, index) => parts[index] === part);
}

function scopedTargetIdFor(targetId: string, componentId: string, componentPath: string[]): string {
  const cleanTargetId = String(targetId || "").trim();
  const cleanComponentPath = componentPath.map((part) => String(part || "").trim()).filter(Boolean);
  const componentPathId = artComponentTargetPathId(cleanComponentPath);
  if (!cleanTargetId) return componentPathId || componentId;
  if (cleanTargetId === "self" || cleanTargetId === componentId || cleanTargetId === componentPathId) return componentPathId || componentId;

  const targetParts = cleanTargetParts(cleanTargetId);
  if (startsWithPath(targetParts, cleanComponentPath)) return artComponentTargetPathId(targetParts);
  if (targetParts[0] === componentId) return artComponentTargetPathId([...cleanComponentPath, ...targetParts.slice(1)]);
  return artComponentTargetPathId([...cleanComponentPath, ...targetParts]);
}

export function scopeTimelinePreviewOverridesToComponent(
  overrides: TimelinePreviewOverrides | null | undefined,
  component: Pick<ArtComponent, "id"> | null | undefined,
  componentPath: string[] | null | undefined
): TimelinePreviewOverrides | null {
  if (!overrides || !component) return overrides || null;
  const cleanComponentId = String(component.id || "").trim();
  const cleanComponentPath = (componentPath || []).map((part) => String(part || "").trim()).filter(Boolean);
  if (!cleanComponentId || cleanComponentPath.length === 0) return overrides;

  const scoped: TimelinePreviewOverrides = {};
  for (const [targetId, props] of Object.entries(overrides)) {
    const scopedTargetId = scopedTargetIdFor(targetId, cleanComponentId, cleanComponentPath);
    scoped[scopedTargetId] = { ...(scoped[scopedTargetId] || {}), ...props };
  }
  return scoped;
}
