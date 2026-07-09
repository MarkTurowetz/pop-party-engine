import {
  defaultVisibilityTimeline,
  normalizeTimeline,
  timelineStopFrame,
  type TimelineCommand,
  type TimelineDocument,
  type TimelineTrack
} from "../../shared/timeline-model";

function commandKey(command: TimelineCommand): string {
  return [command.frame, command.type, command.target || "", command.event || ""].join("|");
}

export function effectiveVisibilityTimeline(timeline: TimelineDocument | null | undefined): TimelineDocument {
  const normalized = normalizeTimeline(timeline);
  if (normalized && (normalized.labels.length > 0 || normalized.commands.length > 0 || normalized.tracks.length > 0)) return normalized;
  const current: TimelineDocument = { fps: 30, frameCount: 1, labels: [], commands: [], tracks: [] };
  const defaults = defaultVisibilityTimeline({ appear: 500, update: 200, disappear: 500 });
  const existingLabelNames = new Set(current.labels.map((label) => label.name));
  const existingCommandKeys = new Set(current.commands.map(commandKey));
  return {
    ...current,
    frameCount: Math.max(current.frameCount, defaults.frameCount),
    labels: [
      ...current.labels,
      ...defaults.labels.filter((label) => !existingLabelNames.has(label.name))
    ].sort((a, b) => a.frame - b.frame || a.name.localeCompare(b.name)),
    commands: [
      ...current.commands,
      ...defaults.commands.filter((command) => !existingCommandKeys.has(commandKey(command)))
    ].sort((a, b) => a.frame - b.frame)
  };
}

function labelFrame(timeline: TimelineDocument, name: string): number {
  return timeline.labels.find((label) => label.name === name)?.frame ?? 0;
}

function mergeKeyframeProps(track: TimelineTrack, frame: number, props: Record<string, string | number | boolean | null>, easing: string): TimelineTrack {
  const existingIndex = track.keyframes.findIndex((keyframe) => keyframe.frame === frame);
  if (existingIndex >= 0) {
    const keyframes = track.keyframes.slice();
    const existing = keyframes[existingIndex];
    keyframes[existingIndex] = {
      ...existing,
      props: { ...props, ...existing.props },
      easing: existing.easing || easing
    };
    return { ...track, keyframes: keyframes.sort((a, b) => a.frame - b.frame) };
  }
  return {
    ...track,
    keyframes: [
      ...track.keyframes,
      {
        id: `key-${track.targetId}-${frame}`,
        frame,
        props,
        easing
      }
    ].sort((a, b) => a.frame - b.frame)
  };
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
    tracks: [...timeline.tracks.filter((track) => track.targetId !== cleanTargetId), nextTrack].sort((a, b) => a.targetId.localeCompare(b.targetId))
  };
}

export function effectiveArtComponentVisibilityTimeline(
  timeline: TimelineDocument | null | undefined,
  targetId: string
): TimelineDocument {
  const current = normalizeTimeline(timeline) || { fps: 30, frameCount: 1, labels: [], commands: [], tracks: [] };
  const defaults = defaultVisibilityTimeline({ appear: 500, update: 200, disappear: 500 });
  const existingLabelNames = new Set(current.labels.map((label) => label.name));
  const existingCommandKeys = new Set(current.commands.map(commandKey));
  const withDefaults = {
    ...current,
    frameCount: Math.max(current.frameCount, defaults.frameCount),
    labels: [
      ...current.labels,
      ...defaults.labels.filter((label) => !existingLabelNames.has(label.name))
    ].sort((a, b) => a.frame - b.frame || a.name.localeCompare(b.name)),
    commands: [
      ...current.commands,
      ...defaults.commands.filter((command) => !existingCommandKeys.has(commandKey(command)))
    ].sort((a, b) => a.frame - b.frame)
  };
  return mergeDefaultVisibilityTrack(withDefaults, defaults, targetId);
}
