export type TimelinePrimitive = string | number | boolean | null;
export type TimelinePropertyValue = TimelinePrimitive;
export type TimelineProperties = Record<string, TimelinePropertyValue>;

export interface TimelineLabel {
  name: string;
  frame: number;
}

export interface TimelineCommand {
  id?: string;
  frame: number;
  type: "stop" | "gotoAndPlay" | "gotoAndStop" | "emit" | string;
  target?: string;
  event?: string;
}

export interface TimelineKeyframe {
  id?: string;
  frame: number;
  props: TimelineProperties;
  easing?: string;
}

export interface TimelineTrack {
  id?: string;
  targetId: string;
  keyframes: TimelineKeyframe[];
}

export interface TimelineDocument {
  fps: number;
  frameCount: number;
  labels: TimelineLabel[];
  commands: TimelineCommand[];
  tracks: TimelineTrack[];
}

export interface TimelineSegment {
  label: string;
  startFrame: number;
  endFrame: number;
  durationMs: number;
}

export interface TimelinePlaybackDurationOptions {
  instant?: boolean;
  maxCommandRedirects?: number;
  commandDuration?: (command: TimelineCommand, context: { frame: number; elapsedMs: number }) => number;
}

const DEFAULT_FPS = 30;
const DEFAULT_FRAME_COUNT = 1;
const MAX_FRAME_COUNT = 60 * 60 * 10;
const MAX_LABELS = 500;
const MAX_COMMANDS = 1000;
const MAX_TRACKS = 1000;
const MAX_KEYFRAMES_PER_TRACK = 2000;

function cleanText(value: unknown, fallback = "", maxLength = 120): string {
  return String(value ?? fallback ?? "").trim().slice(0, maxLength);
}

function cleanFrame(value: unknown, fallback = 0, max = MAX_FRAME_COUNT): number {
  const next = Number(value);
  if (!Number.isFinite(next)) return fallback;
  return Math.max(0, Math.min(max, Math.round(next)));
}

function cleanPositiveNumber(value: unknown, fallback: number, min: number, max: number): number {
  const next = Number(value);
  if (!Number.isFinite(next)) return fallback;
  return Math.max(min, Math.min(max, Number(next.toFixed(3))));
}

function cleanPropertyValue(value: unknown): TimelinePropertyValue | undefined {
  if (typeof value === "string") return value.slice(0, 1000);
  if (typeof value === "number") return Number.isFinite(value) ? Number(value.toFixed(3)) : undefined;
  if (typeof value === "boolean" || value === null) return value;
  return undefined;
}

function normalizeProps(value: unknown): TimelineProperties {
  const source = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  const props: TimelineProperties = {};
  for (const [key, rawValue] of Object.entries(source)) {
    const cleanKey = cleanText(key, "", 80);
    if (!cleanKey) continue;
    const cleanValue = cleanPropertyValue(rawValue);
    if (cleanValue !== undefined) props[cleanKey] = cleanValue;
  }
  return props;
}

export function normalizeTimeline(raw: unknown, fallback: unknown = null): TimelineDocument | null {
  const source = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null;
  const base = fallback && typeof fallback === "object" && !Array.isArray(fallback) ? (fallback as Record<string, unknown>) : null;
  if (!source && !base) return null;
  const input = source || base || {};
  const fps = cleanPositiveNumber(input.fps, DEFAULT_FPS, 1, 120);
  const frameCount = cleanFrame(input.frameCount, DEFAULT_FRAME_COUNT, MAX_FRAME_COUNT) || DEFAULT_FRAME_COUNT;
  const maxFrame = Math.max(0, frameCount - 1);

  const seenLabels = new Set<string>();
  const labels = (Array.isArray(input.labels) ? input.labels : [])
    .slice(0, MAX_LABELS)
    .map((label) => {
      const entry = label && typeof label === "object" && !Array.isArray(label) ? (label as Record<string, unknown>) : {};
      return { name: cleanText(entry.name, "", 80), frame: cleanFrame(entry.frame, 0, maxFrame) };
    })
    .filter((label) => {
      if (!label.name || seenLabels.has(label.name)) return false;
      seenLabels.add(label.name);
      return true;
    })
    .sort((a, b) => a.frame - b.frame || a.name.localeCompare(b.name));

  const commands = (Array.isArray(input.commands) ? input.commands : [])
    .slice(0, MAX_COMMANDS)
    .map((command) => {
      const entry = command && typeof command === "object" && !Array.isArray(command) ? (command as Record<string, unknown>) : {};
      return {
        id: cleanText(entry.id, "", 80) || undefined,
        frame: cleanFrame(entry.frame, 0, maxFrame),
        type: cleanText(entry.type, "stop", 40) || "stop",
        target: cleanText(entry.target, "", 120) || undefined,
        event: cleanText(entry.event, "", 120) || undefined
      };
    })
    .sort((a, b) => a.frame - b.frame);

  const tracks = (Array.isArray(input.tracks) ? input.tracks : [])
    .slice(0, MAX_TRACKS)
    .map((track) => {
      const entry = track && typeof track === "object" && !Array.isArray(track) ? (track as Record<string, unknown>) : {};
      const targetId = cleanText(entry.targetId, "", 120);
      const keyframes = (Array.isArray(entry.keyframes) ? entry.keyframes : [])
        .slice(0, MAX_KEYFRAMES_PER_TRACK)
        .map((keyframe) => {
          const frameEntry =
            keyframe && typeof keyframe === "object" && !Array.isArray(keyframe) ? (keyframe as Record<string, unknown>) : {};
          return {
            id: cleanText(frameEntry.id, "", 80) || undefined,
            frame: cleanFrame(frameEntry.frame, 0, maxFrame),
            props: normalizeProps(frameEntry.props),
            easing: cleanText(frameEntry.easing, "", 40) || undefined
          };
        })
        .filter((keyframe) => Object.keys(keyframe.props).length > 0)
        .sort((a, b) => a.frame - b.frame);
      return { id: cleanText(entry.id, "", 80) || undefined, targetId, keyframes };
    })
    .filter((track) => track.targetId && track.keyframes.length > 0);

  return { fps, frameCount, labels, commands, tracks };
}

export function hasTimelineLabel(timeline: TimelineDocument | null | undefined, label: string): boolean {
  return Boolean(timeline?.labels.some((entry) => entry.name === label));
}

export function frameForTimelineLabel(timeline: TimelineDocument, labelOrFrame: string | number): number {
  if (typeof labelOrFrame === "number") return cleanFrame(labelOrFrame, 0, Math.max(0, timeline.frameCount - 1));
  const label = timeline.labels.find((entry) => entry.name === labelOrFrame);
  return label ? label.frame : 0;
}

export function timelineStopFrame(timeline: TimelineDocument, startFrame: number): number {
  const maxFrame = Math.max(0, timeline.frameCount - 1);
  const stop = timeline.commands.find((command) => command.type === "stop" && command.frame >= startFrame);
  return stop ? stop.frame : maxFrame;
}

export function timelineSegmentFor(timeline: TimelineDocument, labelOrFrame: string | number): TimelineSegment {
  const label = typeof labelOrFrame === "string" ? labelOrFrame : String(labelOrFrame);
  const startFrame = frameForTimelineLabel(timeline, labelOrFrame);
  const endFrame = timelineStopFrame(timeline, startFrame);
  return {
    label,
    startFrame,
    endFrame,
    durationMs: Math.max(0, ((endFrame - startFrame) * 1000) / timeline.fps)
  };
}

function cleanMaxCommandRedirects(value: unknown): number {
  if (value === undefined || value === null) return 50;
  const next = Number(value);
  return Number.isFinite(next) ? Math.max(0, Math.round(next)) : 50;
}

function cleanCommandDuration(value: unknown): number {
  const next = Number(value);
  return Number.isFinite(next) ? Math.max(0, next) : 0;
}

function timelineFrameCommandDuration(
  timeline: TimelineDocument,
  frame: number,
  elapsedMs: number,
  remainingRedirects: number,
  options: TimelinePlaybackDurationOptions
): { durationMs: number; redirected: boolean } {
  let durationMs = 0;
  for (const command of timeline.commands.filter((entry) => entry.frame === frame)) {
    if ((command.type === "gotoAndPlay" || command.type === "gotoAndStop") && command.target) {
      if (remainingRedirects <= 0) return { durationMs, redirected: false };
      if (command.type === "gotoAndStop") {
        const targetFrame = frameForTimelineLabel(timeline, command.target);
        const redirected = timelineFrameCommandDuration(timeline, targetFrame, 0, remainingRedirects - 1, options);
        return { durationMs: Math.max(durationMs, elapsedMs + redirected.durationMs), redirected: true };
      }
      return {
        durationMs: Math.max(
          durationMs,
          elapsedMs +
            timelinePlaybackDuration(timeline, command.target, {
              ...options,
              maxCommandRedirects: remainingRedirects - 1
            })
        ),
        redirected: true
      };
    }
    durationMs = Math.max(durationMs, elapsedMs + cleanCommandDuration(options.commandDuration?.(command, { frame, elapsedMs })));
  }
  return { durationMs, redirected: false };
}

export function timelinePlaybackDuration(
  timeline: TimelineDocument,
  labelOrFrame: string | number,
  options: TimelinePlaybackDurationOptions = {}
): number {
  const maxCommandRedirects = cleanMaxCommandRedirects(options.maxCommandRedirects);
  const segment = timelineSegmentFor(timeline, labelOrFrame);
  if (options.instant === true || segment.durationMs === 0) {
    return timelineFrameCommandDuration(timeline, segment.endFrame, 0, maxCommandRedirects, options).durationMs;
  }
  let durationMs = 0;
  for (let frame = segment.startFrame; frame <= segment.endFrame; frame += 1) {
    const elapsedMs = Math.max(0, ((frame - segment.startFrame) * 1000) / timeline.fps);
    const frameCommands = timelineFrameCommandDuration(timeline, frame, elapsedMs, maxCommandRedirects, options);
    durationMs = Math.max(durationMs, frameCommands.durationMs);
    if (frameCommands.redirected) return durationMs;
  }
  return Math.max(segment.durationMs, durationMs);
}

export function defaultVisibilityTimeline(durations: Record<string, number>): TimelineDocument {
  const fps = DEFAULT_FPS;
  const frameForMs = (ms: number): number => Math.max(1, Math.round((Math.max(0, ms) / 1000) * fps));
  const appearFrames = frameForMs(durations.appear || 0);
  const updateFrames = frameForMs(durations.update || 0);
  const disappearFrames = frameForMs(durations.disappear || 0);
  const park = 0;
  const on = 1;
  const appear = 2;
  const update = appear + appearFrames + 1;
  const disappear = update + updateFrames + 1;
  const off = disappear + disappearFrames + 1;
  const frameCount = off + 1;
  return {
    fps,
    frameCount,
    labels: [
      { name: "park", frame: park },
      { name: "off", frame: park },
      { name: "on", frame: on },
      { name: "appear", frame: appear },
      { name: "update", frame: update },
      { name: "disappear", frame: disappear }
    ],
    commands: [
      { frame: park, type: "stop" },
      { frame: on, type: "stop" },
      { frame: appear + appearFrames, type: "stop" },
      { frame: update + updateFrames, type: "stop" },
      { frame: disappear + disappearFrames, type: "stop" },
      { frame: off, type: "stop" }
    ],
    tracks: []
  };
}
