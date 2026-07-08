import {
  defaultVisibilityTimeline,
  normalizeTimeline,
  timelineSegmentFor,
  timelineStopFrame,
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

export interface TimelineFrameClipboard {
  frameCount: number;
  labels: TimelineDocument["labels"];
  commands: TimelineCommand[];
  tracks: TimelineTrack[];
}

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

function uniqueLabelName(timeline: TimelineDocument, name: string, fallback: string): string {
  const baseName = cleanName(name, fallback);
  const existingNames = new Set(timeline.labels.map((label) => label.name));
  if (!existingNames.has(baseName)) return baseName;
  for (let index = 2; index < 1000; index += 1) {
    const candidate = `${baseName} ${index}`;
    if (!existingNames.has(candidate)) return candidate;
  }
  return `${baseName} ${Date.now().toString(36)}`;
}

function sortTimeline(timeline: TimelineDocument): TimelineDocument {
  return {
    ...timeline,
    labels: [...timeline.labels].sort((a, b) => a.frame - b.frame || a.name.localeCompare(b.name)),
    commands: [...timeline.commands].sort((a, b) => a.frame - b.frame),
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

export function copyTimelineFrameRange(
  timeline: TimelineDocument | null | undefined,
  frame: number,
  count = 1
): TimelineFrameClipboard {
  const current = artTimelineOrDefault(timeline);
  const startFrame = cleanFrame(frame, current.frameCount);
  const endFrame = Math.min(current.frameCount, startFrame + cleanFrameDelta(count));
  const frameCount = Math.max(1, endFrame - startFrame);
  const isInsideRange = (value: number) => value >= startFrame && value < endFrame;
  return {
    frameCount,
    labels: current.labels
      .filter((label) => isInsideRange(label.frame))
      .map((label) => ({ ...label, frame: label.frame - startFrame })),
    commands: current.commands
      .filter((command) => isInsideRange(command.frame))
      .map((command) => ({ ...command, frame: command.frame - startFrame })),
    tracks: current.tracks
      .map((track) => ({
        ...track,
        keyframes: track.keyframes
          .filter((keyframe) => isInsideRange(keyframe.frame))
          .map((keyframe) => ({
            ...keyframe,
            frame: keyframe.frame - startFrame,
            props: cleanTimelineProps(keyframe.props),
            easing: cleanTimelineEasing(keyframe.easing)
          }))
      }))
      .filter((track) => track.keyframes.length > 0)
  };
}

export function pasteTimelineFrameRange(
  timeline: TimelineDocument | null | undefined,
  clipboard: TimelineFrameClipboard | null | undefined,
  frame: number
): TimelineDocument {
  const current = artTimelineOrDefault(timeline);
  const frameCountToPaste = cleanFrameDelta(clipboard?.frameCount || 1);
  if (!clipboard) return insertTimelineFrames(current, frame, frameCountToPaste);
  const destinationFrame = cleanFrame(frame, current.frameCount);
  const withSpace = insertTimelineFrames(current, destinationFrame, frameCountToPaste);
  const labelNameBySource = new Map<string, string>();
  const seededTimeline = { ...withSpace, labels: [...withSpace.labels] };
  const copiedLabels = (clipboard.labels || []).map((label) => {
    const labelName = uniqueLabelName(seededTimeline, label.name, label.name || "Label");
    labelNameBySource.set(label.name, labelName);
    const copiedLabel = { name: labelName, frame: cleanFrame(destinationFrame + label.frame, withSpace.frameCount) };
    seededTimeline.labels.push(copiedLabel);
    return copiedLabel;
  });
  const copiedCommands = (clipboard.commands || []).map((command, index) => {
    const target = command.target && labelNameBySource.has(command.target) ? labelNameBySource.get(command.target) : command.target;
    const copiedCommand: TimelineCommand = {
      ...command,
      id: `${command.id || command.type || "command"}-${destinationFrame}-${index}-${Date.now().toString(36)}`,
      frame: cleanFrame(destinationFrame + command.frame, withSpace.frameCount)
    };
    if (target) copiedCommand.target = target;
    else delete copiedCommand.target;
    return copiedCommand;
  });
  const copiedTracks = (clipboard.tracks || []).map((track) => ({
    ...track,
    keyframes: track.keyframes.map((keyframe) => ({
      ...keyframe,
      id: `key-${track.targetId}-${cleanFrame(destinationFrame + keyframe.frame, withSpace.frameCount)}`,
      frame: cleanFrame(destinationFrame + keyframe.frame, withSpace.frameCount),
      props: cleanTimelineProps(keyframe.props),
      easing: cleanTimelineEasing(keyframe.easing)
    }))
  }));
  const tracksByTargetId = new Map<string, TimelineTrack>();
  for (const track of withSpace.tracks) {
    tracksByTargetId.set(track.targetId, { ...track, keyframes: [...track.keyframes] });
  }
  for (const track of copiedTracks) {
    const existing = tracksByTargetId.get(track.targetId);
    tracksByTargetId.set(track.targetId, existing ? { ...existing, keyframes: [...existing.keyframes, ...track.keyframes] } : track);
  }
  return sortTimeline({
    ...withSpace,
    labels: [...withSpace.labels, ...copiedLabels],
    commands: [...withSpace.commands, ...copiedCommands],
    tracks: [...tracksByTargetId.values()].filter((track) => track.keyframes.length > 0)
  });
}

export function cutTimelineFrameRange(
  timeline: TimelineDocument | null | undefined,
  frame: number,
  count = 1
): { timeline: TimelineDocument; clipboard: TimelineFrameClipboard } {
  const clipboard = copyTimelineFrameRange(timeline, frame, count);
  return {
    clipboard,
    timeline: removeTimelineFrames(timeline, frame, clipboard.frameCount)
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

export function updateTimelineLabel(
  timeline: TimelineDocument | null | undefined,
  currentName: string,
  patch: Partial<Pick<TimelineDocument["labels"][number], "name" | "frame">>
): TimelineDocument {
  const current = artTimelineOrDefault(timeline);
  const existing = current.labels.find((label) => label.name === currentName);
  if (!existing) return current;
  const nextName = patch.name === undefined ? existing.name : cleanName(patch.name, existing.name);
  const nextFrame = patch.frame === undefined ? existing.frame : cleanFrame(patch.frame, current.frameCount);
  const nextLabels = current.labels.filter((label) => label.name !== currentName && label.name !== nextName);
  nextLabels.push({ name: nextName, frame: nextFrame });
  return sortTimeline({ ...current, labels: nextLabels });
}

export function addStopCommand(timeline: TimelineDocument | null | undefined, frame: number): TimelineDocument {
  return addTimelineCommand(timeline, frame, { type: "stop" });
}

export function createTimelineSegment(
  timeline: TimelineDocument | null | undefined,
  frame: number,
  name: string,
  durationFrames = 15
): TimelineDocument {
  const current = artTimelineOrDefault(timeline);
  const startFrame = cleanFrame(frame, current.frameCount);
  const segmentFrames = Math.max(1, Math.min(1000, Math.round(Number(durationFrames) || 1)));
  const stopFrame = startFrame + segmentFrames;
  const frameCount = cleanFrameCount(Math.max(current.frameCount, stopFrame + 1), current.frameCount);
  const labelName = uniqueLabelName(current, name, `Animation ${current.labels.length + 1}`);
  return sortTimeline({
    ...current,
    frameCount,
    labels: [...current.labels, { name: labelName, frame: startFrame }],
    commands: [...current.commands, { id: `stop-${labelName}-${stopFrame}`, frame: stopFrame, type: "stop" }]
  });
}

export function timelineSegmentsForArt(timeline: TimelineDocument | null | undefined) {
  const current = artTimelineOrDefault(timeline);
  return current.labels.map((label) => timelineSegmentFor(current, label.name));
}

export function duplicateTimelineSegment(
  timeline: TimelineDocument | null | undefined,
  sourceLabel: string,
  name: string
): TimelineDocument {
  const current = artTimelineOrDefault(timeline);
  const source = current.labels.find((label) => label.name === sourceLabel);
  if (!source) return current;
  const segment = timelineSegmentFor(current, sourceLabel);
  const segmentFrameCount = Math.max(1, segment.endFrame - segment.startFrame + 1);
  const destinationStartFrame = current.frameCount;
  const frameCount = cleanFrameCount(current.frameCount + segmentFrameCount, current.frameCount + segmentFrameCount);
  const sourceLabels = current.labels.filter((label) => label.frame >= segment.startFrame && label.frame <= segment.endFrame);
  const labelNameBySource = new Map<string, string>();
  const seededTimeline = { ...current, labels: [...current.labels] };
  const copiedLabels = sourceLabels.map((label) => {
    const labelName =
      label.name === sourceLabel
        ? uniqueLabelName(seededTimeline, name, `${sourceLabel} Copy`)
        : uniqueLabelName(seededTimeline, `${cleanName(name, `${sourceLabel} Copy`)} ${label.name}`, `${label.name} Copy`);
    labelNameBySource.set(label.name, labelName);
    seededTimeline.labels.push({ name: labelName, frame: destinationStartFrame + (label.frame - segment.startFrame) });
    return { name: labelName, frame: destinationStartFrame + (label.frame - segment.startFrame) };
  });
  const copiedCommands = current.commands
    .filter((command) => command.frame >= segment.startFrame && command.frame <= segment.endFrame)
    .map((command, index) => {
      const target = command.target && labelNameBySource.has(command.target) ? labelNameBySource.get(command.target) : command.target;
      const nextCommand: TimelineCommand = {
        ...command,
        id: `${command.type}-${destinationStartFrame}-${index}-${Date.now().toString(36)}`,
        frame: destinationStartFrame + (command.frame - segment.startFrame)
      };
      if (target) nextCommand.target = target;
      else delete nextCommand.target;
      return nextCommand;
    });
  const copiedTracks = current.tracks.map((track) => {
    const copiedKeyframes = track.keyframes
      .filter((keyframe) => keyframe.frame >= segment.startFrame && keyframe.frame <= segment.endFrame)
      .map((keyframe) => ({
        ...keyframe,
        id: `key-${track.targetId}-${destinationStartFrame + (keyframe.frame - segment.startFrame)}`,
        frame: destinationStartFrame + (keyframe.frame - segment.startFrame),
        props: cleanTimelineProps(keyframe.props),
        easing: cleanTimelineEasing(keyframe.easing)
      }));
    return copiedKeyframes.length
      ? { ...track, keyframes: [...track.keyframes, ...copiedKeyframes] }
      : track;
  });
  return sortTimeline({
    ...current,
    frameCount,
    labels: [...current.labels, ...copiedLabels],
    commands: [...current.commands, ...copiedCommands],
    tracks: copiedTracks
  });
}

export function removeTimelineSegment(timeline: TimelineDocument | null | undefined, sourceLabel: string): TimelineDocument {
  const current = artTimelineOrDefault(timeline);
  const source = current.labels.find((label) => label.name === sourceLabel);
  if (!source) return current;
  const segment = timelineSegmentFor(current, sourceLabel);
  return removeTimelineFrames(current, segment.startFrame, Math.max(1, segment.endFrame - segment.startFrame + 1));
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

export function moveTimelineCommandAt(
  timeline: TimelineDocument | null | undefined,
  index: number,
  direction: -1 | 1
): TimelineDocument {
  const current = artTimelineOrDefault(timeline);
  if (index < 0 || index >= current.commands.length) return current;
  const targetIndex = index + direction;
  if (targetIndex < 0 || targetIndex >= current.commands.length) return current;
  const command = current.commands[index];
  const target = current.commands[targetIndex];
  if (!command || !target || command.frame !== target.frame) return current;
  const commands = [...current.commands];
  commands[index] = target;
  commands[targetIndex] = command;
  return { ...current, commands };
}

export function updateTimelineCommandAt(
  timeline: TimelineDocument | null | undefined,
  index: number,
  patch: Partial<Pick<TimelineCommand, "frame" | "type" | "target" | "event">>
): TimelineDocument {
  const current = artTimelineOrDefault(timeline);
  if (index < 0 || index >= current.commands.length) return current;
  const commands = current.commands.map((command, commandIndex) => {
    if (commandIndex !== index) return command;
    const nextCommand: TimelineCommand = {
      ...command,
      frame: patch.frame === undefined ? command.frame : cleanFrame(patch.frame, current.frameCount),
      type: patch.type === undefined ? command.type : cleanName(patch.type, command.type || "stop")
    };
    const target = patch.target === undefined ? command.target || "" : cleanName(patch.target, "");
    const event = patch.event === undefined ? command.event || "" : cleanName(patch.event, "");
    if (target) nextCommand.target = target;
    else delete nextCommand.target;
    if (event) nextCommand.event = event;
    else delete nextCommand.event;
    return nextCommand;
  });
  return sortTimeline({ ...current, commands });
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

function cleanPropertyKeys(keys: Iterable<unknown>): string[] {
  const seen = new Set<string>();
  for (const key of keys || []) {
    const cleanKey = String(key || "").trim();
    if (cleanKey) seen.add(cleanKey);
  }
  return [...seen];
}

function componentTimelinePropsForKeys(component: ArtComponent, keys: Iterable<unknown>): TimelineProperties {
  const availableProps = componentTimelinePropsFor(component);
  const props: TimelineProperties = {};
  for (const key of cleanPropertyKeys(keys)) {
    if (Object.prototype.hasOwnProperty.call(availableProps, key)) props[key] = availableProps[key];
  }
  return props;
}

function upsertKeyframe(track: TimelineTrack, keyframe: TimelineKeyframe): TimelineTrack {
  const withoutFrame = track.keyframes.filter((item) => item.frame !== keyframe.frame);
  return { ...track, keyframes: [...withoutFrame, keyframe].sort((a, b) => a.frame - b.frame) };
}

function commandKey(command: TimelineCommand): string {
  return [command.frame, command.type, command.target || "", command.event || ""].join("|");
}

function labelFrame(timeline: TimelineDocument, name: string): number {
  return timeline.labels.find((label) => label.name === name)?.frame ?? 0;
}

function mergeKeyframeProps(track: TimelineTrack, frame: number, props: TimelineProperties, easing?: string): TimelineTrack {
  const existing = track.keyframes.find((keyframe) => keyframe.frame === frame);
  const nextProps = existing ? { ...props, ...existing.props } : props;
  const nextKeyframe: TimelineKeyframe = {
    id: existing?.id || `key-${track.targetId}-${frame}`,
    frame,
    props: cleanTimelineProps(nextProps)
  };
  const nextEasing = existing?.easing || cleanTimelineEasing(easing);
  if (nextEasing && nextEasing !== "linear") nextKeyframe.easing = nextEasing;
  return upsertKeyframe(track, nextKeyframe);
}

function mergeDefaultVisibilityTrack(timeline: TimelineDocument, defaults: TimelineDocument, targetId: string): TimelineDocument {
  const cleanTargetId = String(targetId || "").trim();
  if (!cleanTargetId) return timeline;
  const appearFrame = labelFrame(defaults, "appear");
  const appearStopFrame = timelineStopFrame(defaults, appearFrame);
  const updateFrame = labelFrame(defaults, "update");
  const updateStopFrame = timelineStopFrame(defaults, updateFrame);
  const disappearFrame = labelFrame(defaults, "disappear");
  const disappearStopFrame = timelineStopFrame(defaults, disappearFrame);
  const existingTrack = timeline.tracks.find((track) => track.targetId === cleanTargetId);
  let nextTrack: TimelineTrack = existingTrack || { id: `track-${cleanTargetId}`, targetId: cleanTargetId, keyframes: [] };
  nextTrack = mergeKeyframeProps(nextTrack, labelFrame(defaults, "park"), { opacity: 0, visible: false }, "hold");
  nextTrack = mergeKeyframeProps(nextTrack, labelFrame(defaults, "on"), { opacity: 1, visible: true }, "hold");
  nextTrack = mergeKeyframeProps(nextTrack, appearFrame, { opacity: 0, visible: true }, "easeOut");
  nextTrack = mergeKeyframeProps(nextTrack, appearStopFrame, { opacity: 1, visible: true }, "hold");
  nextTrack = mergeKeyframeProps(nextTrack, updateFrame, { opacity: 1, visible: true }, "hold");
  nextTrack = mergeKeyframeProps(nextTrack, updateStopFrame, { opacity: 1, visible: true }, "hold");
  nextTrack = mergeKeyframeProps(nextTrack, disappearFrame, { opacity: 1, visible: true }, "easeIn");
  nextTrack = mergeKeyframeProps(nextTrack, disappearStopFrame, { opacity: 0, visible: false }, "hold");
  return {
    ...timeline,
    tracks: [...timeline.tracks.filter((track) => track.targetId !== cleanTargetId), nextTrack]
  };
}

export function mergeDefaultArtVisibilityTimeline(
  timeline: TimelineDocument | null | undefined,
  targetComponent?: Pick<ArtComponent, "id"> | null
): TimelineDocument {
  const current = artTimelineOrDefault(timeline);
  const defaults = defaultArtVisibilityTimeline();
  const existingLabelNames = new Set(current.labels.map((label) => label.name));
  const labels = [
    ...current.labels,
    ...defaults.labels.filter((label) => !existingLabelNames.has(label.name))
  ];
  const existingCommandKeys = new Set(current.commands.map(commandKey));
  const commands = [
    ...current.commands,
    ...defaults.commands.filter((command) => !existingCommandKeys.has(commandKey(command)))
  ];
  const withMarkers = sortTimeline({
    ...current,
    frameCount: Math.max(current.frameCount, defaults.frameCount),
    labels,
    commands
  });
  return sortTimeline(mergeDefaultVisibilityTrack(withMarkers, defaults, targetComponent?.id || ""));
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

function cleanTimelineEasing(value: unknown): string | undefined {
  const easing = String(value || "").trim();
  return ["linear", "easeIn", "easeOut", "easeInOut", "hold"].includes(easing) ? easing : undefined;
}

function keyframeAt(timeline: TimelineDocument, targetId: string, frame: number): TimelineKeyframe | null {
  const cleanTargetId = String(targetId || "").trim();
  const cleanFrameValue = cleanFrame(frame, timeline.frameCount);
  const track = timeline.tracks.find((item) => item.targetId === cleanTargetId);
  return track?.keyframes.find((keyframe) => keyframe.frame === cleanFrameValue) || null;
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

export function addTimelinePropertyKeyframe(
  timeline: TimelineDocument | null | undefined,
  component: ArtComponent,
  frame: number,
  propertyKeys: Iterable<unknown>
): TimelineDocument {
  const current = artTimelineOrDefault(timeline);
  const cleanTargetId = String(component.id || "").trim();
  if (!cleanTargetId) return current;
  const props = componentTimelinePropsForKeys(component, propertyKeys);
  if (Object.keys(props).length === 0) return current;
  const cleanFrameValue = cleanFrame(frame, current.frameCount);
  const existingTrack = current.tracks.find((track) => track.targetId === cleanTargetId);
  const existingKeyframe = existingTrack?.keyframes.find((keyframe) => keyframe.frame === cleanFrameValue);
  const keyframe: TimelineKeyframe = {
    id: existingKeyframe?.id || `key-${cleanTargetId}-${cleanFrameValue}`,
    frame: cleanFrameValue,
    props: cleanTimelineProps({ ...(existingKeyframe?.props || {}), ...props })
  };
  if (existingKeyframe?.easing) keyframe.easing = existingKeyframe.easing;
  const nextTrack = existingTrack
    ? upsertKeyframe(existingTrack, keyframe)
    : { id: `track-${cleanTargetId}`, targetId: cleanTargetId, keyframes: [keyframe] };
  return sortTimeline({
    ...current,
    tracks: [...current.tracks.filter((track) => track.targetId !== cleanTargetId), nextTrack]
  });
}

export function replaceTransformKeyframeFromComponent(
  timeline: TimelineDocument | null | undefined,
  component: ArtComponent,
  frame: number
): TimelineDocument {
  const current = artTimelineOrDefault(timeline);
  const cleanTargetId = String(component.id || "").trim();
  if (!cleanTargetId) return current;
  const cleanFrameValue = cleanFrame(frame, current.frameCount);
  const existing = keyframeAt(current, cleanTargetId, cleanFrameValue);
  if (!existing) return addTransformKeyframe(current, component, cleanFrameValue);
  return updateTimelineKeyframe(current, cleanTargetId, cleanFrameValue, {
    props: componentTimelinePropsFor(component),
    easing: existing.easing
  });
}

export function updateTimelineKeyframe(
  timeline: TimelineDocument | null | undefined,
  targetId: string,
  frame: number,
  patch: Partial<Pick<TimelineKeyframe, "frame" | "props" | "easing">>
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
    if (patch.easing !== undefined) {
      const easing = cleanTimelineEasing(patch.easing);
      if (easing && easing !== "linear") nextKeyframe.easing = easing;
      else delete nextKeyframe.easing;
    }
    return upsertKeyframe({ ...track, keyframes: track.keyframes.filter((keyframe) => keyframe.frame !== currentFrame) }, nextKeyframe);
  });
  return changed ? sortTimeline({ ...current, tracks }) : current;
}

export function copyTimelineKeyframe(
  timeline: TimelineDocument | null | undefined,
  sourceTargetId: string,
  sourceFrame: number,
  targetTargetId: string,
  targetFrame: number
): TimelineDocument {
  const current = artTimelineOrDefault(timeline);
  const sourceKeyframe = keyframeAt(current, sourceTargetId, sourceFrame);
  const cleanTargetId = String(targetTargetId || "").trim();
  if (!sourceKeyframe || !cleanTargetId) return current;
  const cleanFrameValue = cleanFrame(targetFrame, current.frameCount);
  const nextKeyframe: TimelineKeyframe = {
    id: `key-${cleanTargetId}-${cleanFrameValue}`,
    frame: cleanFrameValue,
    props: cleanTimelineProps(sourceKeyframe.props),
    easing: cleanTimelineEasing(sourceKeyframe.easing)
  };
  const existingTrack = current.tracks.find((track) => track.targetId === cleanTargetId);
  const nextTrack = existingTrack
    ? upsertKeyframe(existingTrack, nextKeyframe)
    : { id: `track-${cleanTargetId}`, targetId: cleanTargetId, keyframes: [nextKeyframe] };
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
