import {
  normalizeTimeline,
  timelineWithDefaultVisibility,
  type TimelineDocument
} from "../../shared/timeline-model";

export function effectiveVisibilityTimeline(timeline: TimelineDocument | null | undefined): TimelineDocument {
  const normalized = normalizeTimeline(timeline);
  if (normalized && (normalized.labels.length > 0 || normalized.commands.length > 0 || normalized.tracks.length > 0)) return normalized;
  return timelineWithDefaultVisibility(null, { appear: 500, update: 200, disappear: 500 });
}

export function effectiveArtComponentVisibilityTimeline(
  timeline: TimelineDocument | null | undefined,
  targetId: string
): TimelineDocument {
  return timelineWithDefaultVisibility(timeline, { appear: 500, update: 200, disappear: 500 }, targetId);
}
