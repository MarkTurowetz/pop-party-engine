import {
  defaultVisibilityTimeline,
  normalizeTimeline,
  type TimelineCommand,
  type TimelineDocument,
  type TimelineKeyframe,
  type TimelineProperties,
  type TimelinePropertyValue,
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
const MAX_FRAME_COUNT = 60 * 60 * 10;

export const defaultArtVisibilityTimeline = (): TimelineDocument =>
  defaultVisibilityTimeline({ appear: 500, update: 200, disappear: 500 });

export function artTimelineOrDefault(timeline: TimelineDocument | null | undefined): TimelineDocument {
  return normalizeTimeline(timeline) || JSON.parse(JSON.stringify(DEFAULT_TIMELINE));
}

function cleanFrame(frame: number, frameCount: number): number {
  return Math.max(0, Math.min(Math.max(0, frameCount - 1), Math.round(Number(frame) || 0)));
}

function cleanFrameCount(value: unknown, fallback: number): number {
  return Math.max(1, Math.min(MAX_FRAME_COUNT, Math.round(Number(value) || fallback)));
}

function cleanFrameDelta(value: unknown): number {
  return Math.max(1, Math.min(1000, Math.round(Number(value) || 1)));
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
  const frameCount = cleanFrameCount(patch.frameCount ?? current.frameCount, current.frameCount);
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

export function insertTimelineFrames(
  timeline: TimelineDocument | null | undefined,
  frame: number,
  count = 1
): TimelineDocument {
  const current = artTimelineOrDefault(timeline);
  const delta = cleanFrameDelta(count);
  const insertAt = cleanFrame(frame, current.frameCount);
  const frameCount = cleanFrameCount(current.frameCount + delta, current.frameCount + delta);
  return sortTimeline({
    ...current,
    frameCount,
    labels: current.labels.map((label) => ({ ...label, frame: cleanFrame(label.frame >= insertAt ? label.frame + delta : label.frame, frameCount) })),
    commands: current.commands.map((command) => ({
      ...command,
      frame: cleanFrame(command.frame >= insertAt ? command.frame + delta : command.frame, frameCount)
    })),
    tracks: current.tracks.map((track) => ({
      ...track,
      keyframes: track.keyframes.map((keyframe) => ({
        ...keyframe,
        frame: cleanFrame(keyframe.frame >= insertAt ? keyframe.frame + delta : keyframe.frame, frameCount)
      }))
    }))
  });
}

export function removeTimelineFrames(
  timeline: TimelineDocument | null | undefined,
  frame: number,
  count = 1
): TimelineDocument {
  const current = artTimelineOrDefault(timeline);
  const delta = Math.min(cleanFrameDelta(count), Math.max(1, current.frameCount));
  const removeAt = cleanFrame(frame, current.frameCount);
  const removeEnd = Math.min(current.frameCount, removeAt + delta);
  const removedCount = Math.max(1, removeEnd - removeAt);
  const frameCount = cleanFrameCount(current.frameCount - removedCount, 1);
  const shiftFrame = (value: number) => (value >= removeEnd ? value - removedCount : value);
  const isInsideRemovedRange = (value: number) => value >= removeAt && value < removeEnd;
  return sortTimeline({
    ...current,
    frameCount,
    labels: current.labels
      .filter((label) => !isInsideRemovedRange(label.frame) || (frameCount === 1 && removeAt === 0))
      .map((label) => ({ ...label, frame: cleanFrame(shiftFrame(label.frame), frameCount) })),
    commands: current.commands
      .filter((command) => !isInsideRemovedRange(command.frame))
      .map((command) => ({ ...command, frame: cleanFrame(shiftFrame(command.frame), frameCount) })),
    tracks: current.tracks
      .map((track) => ({
        ...track,
        keyframes: track.keyframes
          .filter((keyframe) => !isInsideRemovedRange(keyframe.frame))
          .map((keyframe) => ({ ...keyframe, frame: cleanFrame(shiftFrame(keyframe.frame), frameCount) }))
      }))
      .filter((track) => track.keyframes.length > 0)
  });
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
  return addTimelineCommand(timeline, frame, { type: "stop" });
}

export function addTimelineCommand(
  timeline: TimelineDocument | null | undefined,
  frame: number,
  command: Partial<Pick<TimelineCommand, "type" | "target" | "event">>
): TimelineDocument {
  const current = artTimelineOrDefault(timeline);
  const type = cleanName(String(command.type || ""), "stop");
  const nextCommand: TimelineCommand = {
    id: `${type}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    frame: cleanFrame(frame, current.frameCount),
    type
  };
  const target = cleanName(String(command.target || ""), "");
  const event = cleanName(String(command.event || ""), "");
  if (target) nextCommand.target = target;
  if (event) nextCommand.event = event;
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

function hasOwn(component: ArtComponent, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(component, key);
}

function numberProp(component: ArtComponent, key: string, fallback: number): number {
  const value = Number((component as Record<string, unknown>)[key]);
  return Number.isFinite(value) ? value : fallback;
}

function stringProp(component: ArtComponent, key: string): string | null {
  const value = (component as Record<string, unknown>)[key];
  if (value === undefined || value === null) return null;
  return String(value);
}

function booleanProp(component: ArtComponent, key: string, fallback: boolean): boolean {
  const value = (component as Record<string, unknown>)[key];
  return typeof value === "boolean" ? value : fallback;
}

function addOptionalString(props: TimelineProperties, component: ArtComponent, key: string): void {
  if (!hasOwn(component, key)) return;
  const value = stringProp(component, key);
  if (value !== null) props[key] = value;
}

function addOptionalNumber(props: TimelineProperties, component: ArtComponent, key: string): void {
  if (!hasOwn(component, key)) return;
  props[key] = numberProp(component, key, 0);
}

function componentTimelinePropsFor(component: ArtComponent): TimelineProperties {
  const props: TimelineProperties = {
    x: Number(component.x || 0),
    y: Number(component.y || 0),
    width: Number(component.width || 1),
    height: Number(component.height || 1),
    scale: Number(component.scale || 1),
    rotation: Number(component.rotation || 0),
    opacity: numberProp(component, "opacity", 1),
    visible: booleanProp(component, "visible", true)
  };

  if (component.kind === "text" || component.kind === "badge") {
    addOptionalString(props, component, "defaultText");
    addOptionalString(props, component, "fontFamily");
    addOptionalNumber(props, component, "fontSize");
    addOptionalString(props, component, "fontColor");
    if (hasOwn(component, "autoFitText")) props.autoFitText = booleanProp(component, "autoFitText", true);
  }

  if (component.kind === "shape" || component.kind === "container" || component.kind === "badge") {
    addOptionalString(props, component, "shapeStyle");
    addOptionalString(props, component, "fillColor");
    addOptionalString(props, component, "fillCss");
    addOptionalString(props, component, "borderColor");
    addOptionalNumber(props, component, "borderWidth");
    addOptionalNumber(props, component, "borderRadius");
  }

  if (component.kind === "shape") {
    addOptionalString(props, component, "imageAssetId");
    addOptionalString(props, component, "imageTint");
    addOptionalString(props, component, "imageObjectFit");
  }

  return props;
}

function upsertKeyframe(track: TimelineTrack, keyframe: TimelineKeyframe): TimelineTrack {
  const withoutFrame = track.keyframes.filter((item) => item.frame !== keyframe.frame);
  return { ...track, keyframes: [...withoutFrame, keyframe].sort((a, b) => a.frame - b.frame) };
}

function cleanTimelineValue(value: unknown): TimelinePropertyValue | undefined {
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  return undefined;
}

function cleanTimelineProps(props: TimelineProperties): TimelineProperties {
  const next: TimelineProperties = {};
  for (const [key, value] of Object.entries(props || {})) {
    const cleanValue = cleanTimelineValue(value);
    if (cleanValue !== undefined) next[key] = cleanValue;
  }
  return next;
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
    props: componentTimelinePropsFor(component)
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

export function updateTimelineKeyframe(
  timeline: TimelineDocument | null | undefined,
  targetId: string,
  frame: number,
  patch: Partial<Pick<TimelineKeyframe, "frame" | "props">>
): TimelineDocument {
  const current = artTimelineOrDefault(timeline);
  const cleanTargetId = String(targetId || "").trim();
  if (!cleanTargetId) return current;
  const currentFrame = cleanFrame(frame, current.frameCount);
  let changed = false;
  const tracks = current.tracks.map((track) => {
    if (track.targetId !== cleanTargetId) return track;
    const existing = track.keyframes.find((keyframe) => keyframe.frame === currentFrame);
    if (!existing) return track;
    changed = true;
    const nextFrame = patch.frame === undefined ? existing.frame : cleanFrame(patch.frame, current.frameCount);
    const nextKeyframe: TimelineKeyframe = {
      ...existing,
      id: existing.id || `key-${cleanTargetId}-${nextFrame}`,
      frame: nextFrame,
      props: patch.props ? cleanTimelineProps(patch.props) : existing.props
    };
    return upsertKeyframe({ ...track, keyframes: track.keyframes.filter((keyframe) => keyframe.frame !== currentFrame) }, nextKeyframe);
  });
  return changed ? sortTimeline({ ...current, tracks }) : current;
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
