import type { ArtComponent, ArtComposition } from "../../types/game-data";
import type { TimelineDocument, TimelineTrack } from "../../../shared/timeline-model";
import {
  artComponentTargetIdFor,
  artComponentTargetLabel,
  artComponentTargetOptionsFor,
  findArtComponentTarget
} from "../shared/artComponentTargets";

export type TimelineTargetOption = {
  id: string;
  label: string;
  detail: string;
};

export type TimelineTrackRow = {
  target: TimelineTargetOption;
  track: TimelineTrack | null;
};

export type TimelineTargetOptions = {
  includeRoot?: boolean;
  useScopedIds?: boolean;
  scopeRootPath?: boolean;
  resolveReference?: (component: ArtComponent) => ArtComposition | null | undefined;
};

export function findTimelineTargetComponent(components: ArtComponent[], id: string, targetOptions: TimelineTargetOptions = {}): ArtComponent | undefined {
  return findArtComponentTarget(components, id, targetOptions);
}

export function timelineTargetIdFor(component: ArtComponent, path: string[], targetOptions: TimelineTargetOptions = {}): string {
  return artComponentTargetIdFor(component, path, targetOptions);
}

export function timelineTargetOptionsFor(component: ArtComponent | undefined, targetOptions: TimelineTargetOptions = {}): TimelineTargetOption[] {
  return artComponentTargetOptionsFor(component, targetOptions).map((option) => ({
    id: option.id,
    label: option.label,
    detail: option.detail
  }));
}

export function timelineTargetLabel(targetId: string, component: ArtComponent | undefined, targetOptions: TimelineTargetOptions = {}): TimelineTargetOption {
  return artComponentTargetLabel(targetId, component, targetOptions);
}

export function timelineTrackRowsFor(
  timeline: TimelineDocument,
  component: ArtComponent | undefined,
  targetOptions: TimelineTargetOptions = {}
): TimelineTrackRow[] {
  const targets = timelineTargetOptionsFor(component, targetOptions);
  const targetById = new Map(targets.map((target) => [target.id, target]));
  const trackByTargetId = new Map((timeline.tracks || []).map((track) => [track.targetId, track]));
  const rows = targets.map((target) => ({
    target,
    track: trackByTargetId.get(target.id) || null
  }));
  for (const track of timeline.tracks || []) {
    if (targetById.has(track.targetId)) continue;
    rows.push({
      target: timelineTargetLabel(track.targetId, component, targetOptions),
      track
    });
  }
  return rows;
}
