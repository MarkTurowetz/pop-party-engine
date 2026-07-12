import {
  normalizeTimeline,
  timelineCommandAcceptsEvent,
  timelineCommandAcceptsTarget,
  timelineSegmentFor,
  type TimelineCommand,
  type TimelineDocument,
  type TimelineKeyframe,
  type TimelineProperties,
  type TimelinePropertyValue,
  type TimelineTrack
} from "../../../shared/timeline-model";
import type { ArtComponent } from "../../types/game-data";
import { findArtComponentTarget } from "../shared/artComponentTargets";

const DEFAULT_TIMELINE: TimelineDocument = Object.freeze({
  fps: 30,
  frameCount: 1,
  labels: [],
  commands: [],
  tracks: []
});
const MAX_FRAME_COUNT = 60 * 60 * 10;
const ANIMATION_KEYFRAME_PROPERTY_KEYS = ["x", "y", "width", "height", "scale", "rotation", "opacity", "visible"] as const;
const DEFAULT_TWEEN_EASING = "easeInOut";

export interface TimelineFrameClipboard {
  frameCount: number;
  labels: TimelineDocument["labels"];
  commandFrames?: number[];
  commands: TimelineCommand[];
  tracks: TimelineTrack[];
}

export interface TimelineCommandFrameClipboard {
  commands: TimelineCommand[];
}

export const defaultArtVisibilityTimeline = (): TimelineDocument => ({
  fps: 30,
  frameCount: 33,
  labels: [
    { name: "Off", frame: 0 },
    { name: "Park", frame: 0 },
    { name: "On", frame: 1 },
    { name: "Appear", frame: 2 },
    { name: "Update", frame: 13 },
    { name: "Disappear", frame: 17 }
  ],
  commandFrames: [0, 1, 2, 12, 13, 16, 32],
  commands: [
    { id: "stop-0", frame: 0, type: "stop" },
    { id: "setvisible-0-false", frame: 0, type: "setVisible", target: "false" },
    { id: "stop-1", frame: 1, type: "stop" },
    { id: "setvisible-1-true", frame: 1, type: "setVisible", target: "true" },
    { id: "setvisible-2-true", frame: 2, type: "setVisible", target: "true" },
    { id: "stop-12", frame: 12, type: "stop" },
    { id: "setvisible-13-true", frame: 13, type: "setVisible", target: "true" },
    { id: "stop-16", frame: 16, type: "stop" },
    { id: "stop-32", frame: 32, type: "stop" },
    { id: "setvisible-32-false", frame: 32, type: "setVisible", target: "false" }
  ],
  tracks: []
});

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

export function timelineFrameRangeFromAnchor(
  frameCount: number,
  anchorFrame: number,
  focusFrame: number
): { startFrame: number; endFrame: number; frameCount: number } {
  const cleanCount = cleanFrameCount(frameCount, 1);
  const cleanAnchor = cleanFrame(anchorFrame, cleanCount);
  const cleanFocus = cleanFrame(focusFrame, cleanCount);
  const startFrame = Math.min(cleanAnchor, cleanFocus);
  const endFrame = Math.max(cleanAnchor, cleanFocus);
  return {
    startFrame,
    endFrame,
    frameCount: endFrame - startFrame + 1
  };
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

function slugForId(value: string, fallback: string): string {
  return cleanName(value, fallback)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64) || fallback;
}

function uniqueCommandId(
  timeline: Pick<TimelineDocument, "commands">,
  command: Pick<TimelineCommand, "frame" | "type" | "target" | "event">,
  fallback = "command"
): string {
  const existingIds = new Set(timeline.commands.map((entry) => entry.id).filter(Boolean));
  const targetSlug = command.target ? slugForId(command.target, "target") : "";
  const eventSlug = command.event ? slugForId(command.event, "event") : "";
  const suffix = [targetSlug, eventSlug].filter(Boolean).join("-");
  const base = [
    slugForId(command.type || fallback, fallback),
    Math.max(0, Math.round(Number(command.frame) || 0)),
    suffix
  ]
    .filter((entry) => entry !== "")
    .join("-");
  if (!existingIds.has(base)) return base;
  for (let index = 2; index < 1000; index += 1) {
    const candidate = `${base}-${index}`;
    if (!existingIds.has(candidate)) return candidate;
  }
  return `${base}-${timeline.commands.length + 1}`;
}

function sortTimeline(timeline: TimelineDocument): TimelineDocument {
  const commands = [...timeline.commands].sort((a, b) => a.frame - b.frame);
  return {
    ...timeline,
    labels: [...timeline.labels].sort((a, b) => a.frame - b.frame || a.name.localeCompare(b.name)),
    commandFrames: [...new Set([...(timeline.commandFrames || []), ...commands.map((command) => command.frame)])].sort((a, b) => a - b),
    commands,
    tracks: timeline.tracks.map((track) => ({
      ...track,
      keyframes: [...track.keyframes].sort((a, b) => a.frame - b.frame)
    }))
  };
}

function remappedTimelineCommandTarget(command: TimelineCommand, labelNameBySource: Map<string, string>): string | undefined {
  if ((command.type === "gotoAndPlay" || command.type === "gotoAndStop") && command.target && labelNameBySource.has(command.target)) {
    return labelNameBySource.get(command.target);
  }
  return command.target;
}

function assignTimelineCommandFields(command: TimelineCommand, target: string, event: string): TimelineCommand {
  const nextCommand: TimelineCommand = { ...command };
  if (timelineCommandAcceptsTarget(nextCommand.type) && target) nextCommand.target = target;
  else delete nextCommand.target;
  if (timelineCommandAcceptsEvent(nextCommand.type) && event) nextCommand.event = event;
  else delete nextCommand.event;
  return nextCommand;
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
    commandFrames: [...new Set((current.commandFrames || []).map((frame) => cleanFrame(frame, frameCount)))].sort((a, b) => a - b),
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
    commandFrames: (current.commandFrames || []).map((commandFrame) =>
      cleanFrame(commandFrame >= insertAt ? commandFrame + delta : commandFrame, frameCount)
    ),
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
    commandFrames: (current.commandFrames || [])
      .filter((commandFrame) => !isInsideRemovedRange(commandFrame))
      .map((commandFrame) => cleanFrame(shiftFrame(commandFrame), frameCount)),
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
    commandFrames: (current.commandFrames || [])
      .filter((commandFrame) => isInsideRange(commandFrame))
      .map((commandFrame) => commandFrame - startFrame),
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
  const copiedCommands = (clipboard.commands || []).reduce<TimelineCommand[]>((commands, command) => {
    const target = remappedTimelineCommandTarget(command, labelNameBySource);
    const copiedCommand: TimelineCommand = {
      ...command,
      frame: cleanFrame(destinationFrame + command.frame, withSpace.frameCount)
    };
    if (target) copiedCommand.target = target;
    else delete copiedCommand.target;
    copiedCommand.id = uniqueCommandId({ commands: [...withSpace.commands, ...commands] }, copiedCommand);
    commands.push(copiedCommand);
    return commands;
  }, []);
  const copiedCommandFrames = (clipboard.commandFrames || []).map((commandFrame) =>
    cleanFrame(destinationFrame + commandFrame, withSpace.frameCount)
  );
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
    commandFrames: [...(withSpace.commandFrames || []), ...copiedCommandFrames],
    commands: [...withSpace.commands, ...copiedCommands],
    tracks: [...tracksByTargetId.values()].filter((track) => track.keyframes.length > 0)
  });
}

export function overwriteTimelineFrameRange(
  timeline: TimelineDocument | null | undefined,
  clipboard: TimelineFrameClipboard | null | undefined,
  frame: number
): TimelineDocument {
  const current = artTimelineOrDefault(timeline);
  if (!clipboard) return current;
  const destinationFrame = cleanFrame(frame, current.frameCount);
  const pasteFrameCount = cleanFrameDelta(clipboard.frameCount || 1);
  const nextFrameCount = cleanFrameCount(Math.max(current.frameCount, destinationFrame + pasteFrameCount), current.frameCount);
  const pasteEnd = destinationFrame + pasteFrameCount;
  const isInsideDestinationRange = (value: number) => value >= destinationFrame && value < pasteEnd;
  const labelNameBySource = new Map<string, string>();
  const nextLabels = current.labels.filter((label) => !isInsideDestinationRange(label.frame));
  const nextCommandFrames = (current.commandFrames || []).filter((commandFrame) => !isInsideDestinationRange(commandFrame));
  const nextCommands = current.commands.filter((command) => !isInsideDestinationRange(command.frame));

  for (const label of clipboard.labels || []) {
    const labelFrame = cleanFrame(destinationFrame + label.frame, nextFrameCount);
    const labelName =
      nextLabels.some((entry) => entry.name === label.name && entry.frame !== labelFrame)
        ? uniqueLabelName({ ...current, labels: nextLabels }, label.name, label.name || "Label")
        : cleanName(label.name, "Label");
    labelNameBySource.set(label.name, labelName);
    nextLabels.push({ name: labelName, frame: labelFrame });
  }

  const copiedCommands = (clipboard.commands || []).reduce<TimelineCommand[]>((commands, command) => {
    const target = remappedTimelineCommandTarget(command, labelNameBySource);
    const copiedCommand: TimelineCommand = {
      ...command,
      frame: cleanFrame(destinationFrame + command.frame, nextFrameCount)
    };
    if (target) copiedCommand.target = target;
    else delete copiedCommand.target;
    copiedCommand.id = uniqueCommandId({ commands: [...nextCommands, ...commands] }, copiedCommand);
    commands.push(copiedCommand);
    return commands;
  }, []);
  const copiedCommandFrames = (clipboard.commandFrames || []).map((commandFrame) =>
    cleanFrame(destinationFrame + commandFrame, nextFrameCount)
  );

  const tracksByTargetId = new Map<string, TimelineTrack>();
  for (const track of current.tracks) {
    tracksByTargetId.set(track.targetId, {
      ...track,
      keyframes: track.keyframes.filter((keyframe) => !isInsideDestinationRange(keyframe.frame))
    });
  }
  for (const track of clipboard.tracks || []) {
    const copiedKeyframes = track.keyframes.map((keyframe) => {
      const keyframeFrame = cleanFrame(destinationFrame + keyframe.frame, nextFrameCount);
      return {
        ...keyframe,
        id: `key-${track.targetId}-${keyframeFrame}`,
        frame: keyframeFrame,
        props: cleanTimelineProps(keyframe.props),
        easing: cleanTimelineEasing(keyframe.easing)
      };
    });
    const existing = tracksByTargetId.get(track.targetId);
    tracksByTargetId.set(track.targetId, existing ? upsertManyKeyframes(existing, copiedKeyframes) : { ...track, keyframes: copiedKeyframes });
  }

  return sortTimeline({
    ...current,
    frameCount: nextFrameCount,
    labels: nextLabels,
    commandFrames: [...nextCommandFrames, ...copiedCommandFrames],
    commands: [...nextCommands, ...copiedCommands],
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
  return sortTimeline({
    ...current,
    labels: nextLabels,
    commands: current.commands.map((command) =>
      (command.type === "gotoAndPlay" || command.type === "gotoAndStop") && command.target === currentName
        ? { ...command, target: nextName }
        : command
    )
  });
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
    .reduce<TimelineCommand[]>((commands, command) => {
      const target = remappedTimelineCommandTarget(command, labelNameBySource);
      const nextCommand: TimelineCommand = {
        ...command,
        frame: destinationStartFrame + (command.frame - segment.startFrame)
      };
      if (target) nextCommand.target = target;
      else delete nextCommand.target;
      nextCommand.id = uniqueCommandId({ commands: [...current.commands, ...commands] }, nextCommand);
      commands.push(nextCommand);
      return commands;
    }, []);
  const copiedCommandFrames = (current.commandFrames || [])
    .filter((commandFrame) => commandFrame >= segment.startFrame && commandFrame <= segment.endFrame)
    .map((commandFrame) => destinationStartFrame + (commandFrame - segment.startFrame));
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
    commandFrames: [...(current.commandFrames || []), ...copiedCommandFrames],
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
    frame: cleanFrame(frame, current.frameCount),
    type
  };
  const target = cleanName(String(command.target || ""), "");
  const event = cleanName(String(command.event || ""), "");
  const cleanCommand = assignTimelineCommandFields(nextCommand, target, event);
  cleanCommand.id = uniqueCommandId(current, cleanCommand);
  return sortTimeline({ ...current, commands: [...current.commands, cleanCommand] });
}

export function addTimelineCommandFrame(timeline: TimelineDocument | null | undefined, frame: number): TimelineDocument {
  const current = artTimelineOrDefault(timeline);
  const normalizedFrame = cleanFrame(frame, current.frameCount);
  return sortTimeline({ ...current, commandFrames: [...(current.commandFrames || []), normalizedFrame] });
}

export function copyTimelineCommandFrame(
  timeline: TimelineDocument | null | undefined,
  frame: number
): TimelineCommandFrameClipboard {
  const current = artTimelineOrDefault(timeline);
  const normalizedFrame = cleanFrame(frame, current.frameCount);
  return {
    commands: current.commands
      .filter((command) => command.frame === normalizedFrame)
      .map((command) => ({ ...command }))
  };
}

export function pasteTimelineCommandFrame(
  timeline: TimelineDocument | null | undefined,
  clipboard: TimelineCommandFrameClipboard,
  frame: number
): TimelineDocument {
  return replaceTimelineCommandsAtFrame(timeline, frame, clipboard.commands || []);
}

export function removeTimelineCommandFrame(timeline: TimelineDocument | null | undefined, frame: number): TimelineDocument {
  const current = artTimelineOrDefault(timeline);
  const normalizedFrame = cleanFrame(frame, current.frameCount);
  return sortTimeline({
    ...current,
    commandFrames: (current.commandFrames || []).filter((commandFrame) => commandFrame !== normalizedFrame),
    commands: current.commands.filter((command) => command.frame !== normalizedFrame)
  });
}

export function replaceTimelineCommandsAtFrame(
  timeline: TimelineDocument | null | undefined,
  frame: number,
  commands: Partial<Pick<TimelineCommand, "type" | "target" | "event">>[]
): TimelineDocument {
  const current = artTimelineOrDefault(timeline);
  const normalizedFrame = cleanFrame(frame, current.frameCount);
  let nextTimeline = sortTimeline({
    ...current,
    commandFrames: [...(current.commandFrames || []), normalizedFrame],
    commands: current.commands.filter((command) => command.frame !== normalizedFrame)
  });
  for (const command of commands) {
    nextTimeline = addTimelineCommand(nextTimeline, normalizedFrame, command);
  }
  return nextTimeline;
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
    return assignTimelineCommandFields(nextCommand, target, event);
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

  if (component.kind === "sprite") {
    addOptionalString(props, component, "imageAssetId");
    addOptionalString(props, component, "imageTint");
    addOptionalString(props, component, "imageObjectFit");
    addOptionalString(props, component, "spriteRenderMode");
  }

  return props;
}

function componentAnimationTimelinePropsFor(component: ArtComponent): TimelineProperties {
  const props = componentTimelinePropsFor(component);
  const animationProps: TimelineProperties = {};
  for (const key of ANIMATION_KEYFRAME_PROPERTY_KEYS) {
    if (Object.prototype.hasOwnProperty.call(props, key)) animationProps[key] = props[key];
  }
  return animationProps;
}

function fallbackAnimationTimelineProps(): TimelineProperties {
  return {
    x: 0,
    y: 0,
    width: 1,
    height: 1,
    scale: 1,
    rotation: 0,
    opacity: 1,
    visible: true
  };
}

function timelineTargetForAnimationProps(rootComponent: ArtComponent, targetId: string): ArtComponent | undefined {
  const cleanTargetId = String(targetId || "").trim();
  const rootId = String(rootComponent.id || "").trim();
  if (!cleanTargetId || cleanTargetId === "self" || cleanTargetId === rootId) return rootComponent;
  return (
    findArtComponentTarget([rootComponent], cleanTargetId, { includeRoot: true }) ||
    findArtComponentTarget([rootComponent], cleanTargetId, { includeRoot: true, scopeRootPath: false })
  );
}

function normalizeTrackAnimationProps(track: TimelineTrack, rootComponent: ArtComponent): { track: TimelineTrack; changed: boolean } {
  const target = timelineTargetForAnimationProps(rootComponent, track.targetId);
  const carriedProps: TimelineProperties = {
    ...fallbackAnimationTimelineProps(),
    ...(target ? componentAnimationTimelinePropsFor(target) : {})
  };
  let changed = false;
  const keyframes = track.keyframes.map((keyframe) => {
    const sourceProps = cleanTimelineProps(keyframe.props);
    const nextProps: TimelineProperties = { ...sourceProps };
    let keyframeChanged = false;
    for (const key of ANIMATION_KEYFRAME_PROPERTY_KEYS) {
      const nextValue = Object.prototype.hasOwnProperty.call(sourceProps, key) ? sourceProps[key] : carriedProps[key];
      if (nextValue !== undefined) nextProps[key] = nextValue;
      carriedProps[key] = nextProps[key];
    }
    if (Object.keys(nextProps).length !== Object.keys(sourceProps).length) keyframeChanged = true;
    else {
      for (const [key, value] of Object.entries(nextProps)) {
        if (sourceProps[key] !== value) {
          keyframeChanged = true;
          break;
        }
      }
    }
    if (keyframeChanged) changed = true;
    return keyframeChanged ? { ...keyframe, props: nextProps } : keyframe;
  });
  return { track: changed ? { ...track, keyframes } : track, changed };
}

export function normalizeAnimationKeyframePropsForEditing(
  timeline: TimelineDocument | null | undefined,
  rootComponent?: ArtComponent | null
): TimelineDocument {
  const current = artTimelineOrDefault(timeline);
  if (!rootComponent || current.tracks.length === 0) return current;
  let changed = false;
  const tracks = current.tracks.map((track) => {
    const result = normalizeTrackAnimationProps(track, rootComponent);
    if (result.changed) changed = true;
    return result.track;
  });
  return changed ? sortTimeline({ ...current, tracks }) : current;
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

function upsertManyKeyframes(track: TimelineTrack, keyframes: TimelineKeyframe[]): TimelineTrack {
  return keyframes.reduce((nextTrack, keyframe) => upsertKeyframe(nextTrack, keyframe), track);
}

export function mergeDefaultArtVisibilityTimeline(
  timeline: TimelineDocument | null | undefined,
  targetComponent?: Pick<ArtComponent, "id"> | null
): TimelineDocument {
  const current = normalizeTimeline(timeline);
  if (current) return current;
  const defaults = defaultArtVisibilityTimeline();
  const targetId = String(targetComponent?.id || "").trim();
  if (!targetId) return defaults;
  return {
    ...defaults,
    tracks: [{
      id: `track-${targetId}`,
      targetId,
      keyframes: [
        { id: `key-${targetId}-0`, frame: 0, props: { opacity: 0, visible: false }, easing: "hold" },
        { id: `key-${targetId}-1`, frame: 1, props: { opacity: 1, visible: true }, easing: "hold" },
        { id: `key-${targetId}-2`, frame: 2, props: { opacity: 0, visible: true }, easing: "easeOut" },
        { id: `key-${targetId}-12`, frame: 12, props: { opacity: 1, visible: true }, easing: "hold" },
        { id: `key-${targetId}-13`, frame: 13, props: { opacity: 1, visible: true }, easing: "hold" },
        { id: `key-${targetId}-16`, frame: 16, props: { opacity: 1, visible: true }, easing: "hold" },
        { id: `key-${targetId}-17`, frame: 17, props: { opacity: 1, visible: true }, easing: "easeIn" },
        { id: `key-${targetId}-32`, frame: 32, props: { opacity: 0, visible: false }, easing: "hold" }
      ]
    }]
  };
}

export function effectiveArtVisibilityTimeline(
  timeline: TimelineDocument | null | undefined,
  targetComponent?: Pick<ArtComponent, "id"> | null
): TimelineDocument {
  return mergeDefaultArtVisibilityTimeline(timeline, targetComponent);
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

export type TimelineTweenSpan = {
  targetId: string;
  startFrame: number;
  endFrame: number;
  easing: string;
};

export function timelineTweenSpanAtFrame(
  timeline: TimelineDocument | null | undefined,
  targetId: string,
  frame: number
): TimelineTweenSpan | null {
  const current = artTimelineOrDefault(timeline);
  const cleanTargetId = String(targetId || "").trim();
  if (!cleanTargetId) return null;
  const track = current.tracks.find((item) => item.targetId === cleanTargetId);
  if (!track) return null;
  const selectedFrame = cleanFrame(frame, current.frameCount);
  const keyframes = [...track.keyframes].sort((a, b) => a.frame - b.frame);
  const previous = [...keyframes].reverse().find((keyframe) => keyframe.frame <= selectedFrame);
  if (!previous) return null;
  const next = keyframes.find((keyframe) => keyframe.frame > previous.frame);
  if (!next) return null;
  return {
    targetId: cleanTargetId,
    startFrame: previous.frame,
    endFrame: next.frame,
    easing: cleanTimelineEasing(previous.easing) || "hold"
  };
}

export function timelineFrameIsTweened(
  timeline: TimelineDocument | null | undefined,
  targetId: string,
  frame: number
): boolean {
  const current = artTimelineOrDefault(timeline);
  const cleanTargetId = String(targetId || "").trim();
  const selectedFrame = cleanFrame(frame, current.frameCount);
  const track = current.tracks.find((item) => item.targetId === cleanTargetId);
  if (!track) return false;
  const keyframes = [...track.keyframes].sort((a, b) => a.frame - b.frame);
  for (let index = 0; index < keyframes.length - 1; index += 1) {
    const start = keyframes[index];
    const end = keyframes[index + 1];
    const easing = cleanTimelineEasing(start?.easing) || "hold";
    if (easing === "hold") continue;
    if (selectedFrame >= start.frame && selectedFrame <= end.frame) return true;
  }
  return false;
}

export function toggleTimelineTweenAtFrame(
  timeline: TimelineDocument | null | undefined,
  targetId: string,
  frame: number,
  tweenEasing = DEFAULT_TWEEN_EASING
): TimelineDocument {
  const current = artTimelineOrDefault(timeline);
  const span = timelineTweenSpanAtFrame(current, targetId, frame);
  if (!span) return current;
  const currentEasing = cleanTimelineEasing(span.easing) || "hold";
  const nextEasing = currentEasing === "hold" ? cleanTimelineEasing(tweenEasing) || DEFAULT_TWEEN_EASING : "hold";
  return updateTimelineKeyframe(current, span.targetId, span.startFrame, { easing: nextEasing });
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
  const existingTrack = current.tracks.find((track) => track.targetId === cleanTargetId);
  const existingKeyframe = existingTrack?.keyframes.find((keyframe) => keyframe.frame === cleanFrameValue);
  const previousKeyframe = existingTrack?.keyframes
    .filter((keyframe) => keyframe.frame < cleanFrameValue)
    .sort((left, right) => right.frame - left.frame)[0];
  const nextKeyframe = existingTrack?.keyframes
    .filter((keyframe) => keyframe.frame > cleanFrameValue)
    .sort((left, right) => left.frame - right.frame)[0];
  const splitTweenEasing = previousKeyframe && nextKeyframe && cleanTimelineEasing(previousKeyframe.easing) !== "hold"
    ? cleanTimelineEasing(previousKeyframe.easing)
    : undefined;
  const keyframe: TimelineKeyframe = {
    id: existingKeyframe?.id || `key-${cleanTargetId}-${cleanFrameValue}`,
    frame: cleanFrameValue,
    props: componentTimelinePropsFor(component),
    easing: cleanTimelineEasing(existingKeyframe?.easing) || splitTweenEasing || "hold"
  };
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
  keyframe.easing = existingKeyframe?.easing || "hold";
  const nextTrack = existingTrack
    ? upsertKeyframe(existingTrack, keyframe)
    : { id: `track-${cleanTargetId}`, targetId: cleanTargetId, keyframes: [keyframe] };
  return sortTimeline({
    ...current,
    tracks: [...current.tracks.filter((track) => track.targetId !== cleanTargetId), nextTrack]
  });
}

export function upsertTimelineKeyframeProps(
  timeline: TimelineDocument | null | undefined,
  targetId: string,
  frame: number,
  props: TimelineProperties,
  options: { defaultEasing?: string; rootComponent?: ArtComponent | null } = {}
): TimelineDocument {
  const current = artTimelineOrDefault(timeline);
  const cleanTargetId = String(targetId || "").trim();
  if (!cleanTargetId) return current;
  const cleanProps = cleanTimelineProps(props);
  if (Object.keys(cleanProps).length === 0) return current;
  const cleanFrameValue = cleanFrame(frame, current.frameCount);
  const existingTrack = current.tracks.find((track) => track.targetId === cleanTargetId);
  const existingKeyframe = existingTrack?.keyframes.find((keyframe) => keyframe.frame === cleanFrameValue);
  const keyframe: TimelineKeyframe = {
    id: existingKeyframe?.id || `key-${cleanTargetId}-${cleanFrameValue}`,
    frame: cleanFrameValue,
    props: cleanTimelineProps({ ...(existingKeyframe?.props || {}), ...cleanProps })
  };
  const easing = cleanTimelineEasing(existingKeyframe?.easing || options.defaultEasing);
  if (easing) keyframe.easing = easing;
  const nextTrack = existingTrack
    ? upsertKeyframe(existingTrack, keyframe)
    : { id: `track-${cleanTargetId}`, targetId: cleanTargetId, keyframes: [keyframe] };
  const nextTimeline = sortTimeline({
    ...current,
    tracks: [...current.tracks.filter((track) => track.targetId !== cleanTargetId), nextTrack]
  });
  return options.rootComponent ? normalizeAnimationKeyframePropsForEditing(nextTimeline, options.rootComponent) : nextTimeline;
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
      if (easing) nextKeyframe.easing = easing;
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
