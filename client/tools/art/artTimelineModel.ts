import {
  defaultVisibilityTimeline,
  normalizeTimeline,
  type TimelineCommand,
  type TimelineDocument,
  type TimelineKeyframe,
  type TimelineProperties,
  type TimelineTrack
} from "../../../shared/timeline-model";
import type { ArtComponent } from "../../types/game-data";

const DEFAULT_TIMELINE: TimelineDocument = Object.freeze({
  fps: 30,
  frameCount: 1,
  labels: [],
  commands: [],
  tracks: []
});

export const defaultArtVisibilityTimeline = (): TimelineDocument =>
  defaultVisibilityTimeline({ appear: 500, update: 200, disappear: 500 });

export function artTimelineOrDefault(timeline: TimelineDocument | null | undefined): TimelineDocument {
  return normalizeTimeline(timeline) || JSON.parse(JSON.stringify(DEFAULT_TIMELINE));
}

function cleanFrame(frame: number, frameCount: number): number {
  return Math.max(0, Math.min(Math.max(0, frameCount - 1), Math.round(Number(frame) || 0)));
}

function cleanName(name: string, fallback: string): string {
  return String(name || "").trim().slice(0, 80) || fallback;
}

function sortTimeline(timeline: TimelineDocument): TimelineDocument {
  return {
    ...timeline,
    labels: [...timeline.labels].sort((a, b) => a.frame - b.frame || a.name.localeCompare(b.name)),
    commands: [...timeline.commands].sort((a, b) => a.frame - b.frame || a.type.localeCompare(b.type)),
    tracks: timeline.tracks.map((track) => ({
      ...track,
      keyframes: [...track.keyframes].sort((a, b) => a.frame - b.frame)
    }))
  };
}

export function updateTimelineSettings(
  timeline: TimelineDocument | null | undefined,
  patch: Partial<Pick<TimelineDocument, "fps" | "frameCount">>
): TimelineDocument {
  const current = artTimelineOrDefault(timeline);
  const fps = Math.max(1, Math.min(120, Number(patch.fps ?? current.fps) || current.fps));
  const frameCount = Math.max(1, Math.min(60 * 60 * 10, Math.round(Number(patch.frameCount ?? current.frameCount) || current.frameCount)));
  return {
    ...current,
    fps,
    frameCount,
    labels: current.labels.map((label) => ({ ...label, frame: cleanFrame(label.frame, frameCount) })),
    commands: current.commands.map((command) => ({ ...command, frame: cleanFrame(command.frame, frameCount) })),
    tracks: current.tracks.map((track) => ({
      ...track,
      keyframes: track.keyframes.map((keyframe) => ({ ...keyframe, frame: cleanFrame(keyframe.frame, frameCount) }))
    }))
  };
}

export function addTimelineLabel(
  timeline: TimelineDocument | null | undefined,
  frame: number,
  name: string
): TimelineDocument {
  const current = artTimelineOrDefault(timeline);
  const labelName = cleanName(name, `Label ${current.labels.length + 1}`);
  const nextLabels = current.labels.filter((label) => label.name !== labelName);
  nextLabels.push({ name: labelName, frame: cleanFrame(frame, current.frameCount) });
  return sortTimeline({ ...current, labels: nextLabels });
}

export function removeTimelineLabel(timeline: TimelineDocument | null | undefined, name: string): TimelineDocument {
  const current = artTimelineOrDefault(timeline);
  return { ...current, labels: current.labels.filter((label) => label.name !== name) };
}

export function addStopCommand(timeline: TimelineDocument | null | undefined, frame: number): TimelineDocument {
  const current = artTimelineOrDefault(timeline);
  const nextCommand: TimelineCommand = {
    id: `stop-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    frame: cleanFrame(frame, current.frameCount),
    type: "stop"
  };
  return sortTimeline({ ...current, commands: [...current.commands, nextCommand] });
}

export function removeTimelineCommand(timeline: TimelineDocument | null | undefined, commandId: string): TimelineDocument {
  const current = artTimelineOrDefault(timeline);
  return { ...current, commands: current.commands.filter((command) => command.id !== commandId) };
}

export function removeTimelineCommandAt(timeline: TimelineDocument | null | undefined, index: number): TimelineDocument {
  const current = artTimelineOrDefault(timeline);
  return { ...current, commands: current.commands.filter((_, commandIndex) => commandIndex !== index) };
}

function transformPropsFor(component: ArtComponent): TimelineProperties {
  return {
    x: Number(component.x || 0),
    y: Number(component.y || 0),
    width: Number(component.width || 1),
    height: Number(component.height || 1),
    scale: Number(component.scale || 1),
    rotation: Number(component.rotation || 0)
  };
}

function upsertKeyframe(track: TimelineTrack, keyframe: TimelineKeyframe): TimelineTrack {
  const withoutFrame = track.keyframes.filter((item) => item.frame !== keyframe.frame);
  return { ...track, keyframes: [...withoutFrame, keyframe].sort((a, b) => a.frame - b.frame) };
}

export function addTransformKeyframe(
  timeline: TimelineDocument | null | undefined,
  component: ArtComponent,
  frame: number
): TimelineDocument {
  const current = artTimelineOrDefault(timeline);
  const cleanTargetId = String(component.id || "").trim();
  if (!cleanTargetId) return current;
  const cleanFrameValue = cleanFrame(frame, current.frameCount);
  const keyframe: TimelineKeyframe = {
    id: `key-${cleanTargetId}-${cleanFrameValue}`,
    frame: cleanFrameValue,
    props: transformPropsFor(component)
  };
  const existingTrack = current.tracks.find((track) => track.targetId === cleanTargetId);
  const nextTrack = existingTrack
    ? upsertKeyframe(existingTrack, keyframe)
    : { id: `track-${cleanTargetId}`, targetId: cleanTargetId, keyframes: [keyframe] };
  return sortTimeline({
    ...current,
    tracks: [...current.tracks.filter((track) => track.targetId !== cleanTargetId), nextTrack]
  });
}

export function removeTimelineKeyframe(
  timeline: TimelineDocument | null | undefined,
  targetId: string,
  frame: number
): TimelineDocument {
  const current = artTimelineOrDefault(timeline);
  const cleanFrameValue = cleanFrame(frame, current.frameCount);
  const tracks = current.tracks
    .map((track) =>
      track.targetId === targetId ? { ...track, keyframes: track.keyframes.filter((keyframe) => keyframe.frame !== cleanFrameValue) } : track
    )
    .filter((track) => track.keyframes.length > 0);
  return { ...current, tracks };
}
