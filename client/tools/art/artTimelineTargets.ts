import type { ArtComponent, ArtComposition } from "../../types/game-data";
import { normalizeTimeline, type TimelineDocument, type TimelineTrack } from "../../../shared/timeline-model";
import {
  artComponentTargetIdFor,
  artComponentTargetPathId,
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

function cleanTargetParts(id: string): string[] {
  return String(id || "")
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean);
}

function startsWithPath(parts: string[], prefix: string[]): boolean {
  return prefix.length > 0 && prefix.every((part, index) => parts[index] === part);
}

function outputPathIdFor(path: string[], options: TimelineTargetOptions): string {
  const scopedPath = options.scopeRootPath === false ? path.slice(1) : path;
  return artComponentTargetPathId(scopedPath);
}

function scopedTrackTargetIdFor(component: ArtComponent, componentPath: string[], trackTargetId: string, options: TimelineTargetOptions): string {
  const cleanComponentId = String(component.id || "").trim();
  const cleanTrackTargetId = String(trackTargetId || "").trim();
  const outputComponentId = outputPathIdFor(componentPath, options) || cleanComponentId;
  if (!cleanTrackTargetId || cleanTrackTargetId === "self" || cleanTrackTargetId === cleanComponentId) return outputComponentId;

  const trackParts = cleanTargetParts(cleanTrackTargetId);
  const outputComponentParts = cleanTargetParts(outputComponentId);
  if (startsWithPath(trackParts, outputComponentParts)) return artComponentTargetPathId(trackParts);
  if (trackParts[0] === cleanComponentId) return artComponentTargetPathId([...outputComponentParts, ...trackParts.slice(1)]);
  return artComponentTargetPathId([...outputComponentParts, ...trackParts]);
}

function cloneTrackForScope(track: TimelineTrack, component: ArtComponent, componentPath: string[], options: TimelineTargetOptions): TimelineTrack | null {
  const targetId = scopedTrackTargetIdFor(component, componentPath, track.targetId, options);
  if (!targetId) return null;
  return {
    ...track,
    id: track.id ? `${track.id}@${targetId}` : `track-${targetId}`,
    targetId,
    keyframes: (track.keyframes || []).map((keyframe) => ({ ...keyframe, props: { ...(keyframe.props || {}) } }))
  };
}

function collectComponentTimelineTracks(
  component: ArtComponent,
  path: string[],
  options: TimelineTargetOptions,
  out: TimelineTrack[]
): void {
  const timeline = normalizeTimeline(component.timeline);
  if (timeline) {
    for (const track of timeline.tracks || []) {
      const scopedTrack = cloneTrackForScope(track, component, path, options);
      if (scopedTrack) out.push(scopedTrack);
    }
  }
  const children = (String(component.kind || "").toLowerCase() === "reference" ? options.resolveReference?.(component)?.components : null) || component.children || [];
  for (const child of children) {
    collectComponentTimelineTracks(child, [...path, String(child.id || "").trim()].filter(Boolean), options, out);
  }
}

export function timelineWithScopedComponentTracks(
  timeline: TimelineDocument,
  component: ArtComponent | undefined,
  targetOptions: TimelineTargetOptions = {}
): TimelineDocument {
  if (!component) return timeline;
  const scopedTracks: TimelineTrack[] = [];
  collectComponentTimelineTracks(component, [String(component.id || "").trim()].filter(Boolean), targetOptions, scopedTracks);
  if (!scopedTracks.length) return timeline;

  const mergedByTargetId = new Map<string, TimelineTrack>();
  for (const track of scopedTracks) mergedByTargetId.set(track.targetId, track);
  for (const track of timeline.tracks || []) mergedByTargetId.set(track.targetId, track);
  return {
    ...timeline,
    tracks: [...mergedByTargetId.values()].sort((a, b) => a.targetId.localeCompare(b.targetId))
  };
}
