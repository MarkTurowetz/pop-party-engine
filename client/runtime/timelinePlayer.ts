import {
  frameForTimelineLabel,
  normalizeTimeline,
  timelineSegmentFor,
  type TimelineDocument,
  type TimelineProperties,
  type TimelinePropertyValue,
  type TimelineTrack
} from "../../shared/timeline-model";

export interface TimelineFrameSnapshot {
  frame: number;
  targets: Record<string, TimelineProperties>;
}

export interface TimelinePlayerOptions {
  timeline?: TimelineDocument | null;
  onFrame?: (snapshot: TimelineFrameSnapshot) => void;
  onCommand?: (command: { type: string; frame: number; target?: string; event?: string }) => void;
  onCommandLimit?: (detail: { frame: number; commandCount: number; maxCommandRedirects: number }) => void;
  maxCommandRedirects?: number;
  schedule?: (callback: () => void, delay: number) => number;
  clearScheduled?: (id: number) => void;
}

export interface TimelinePlayOptions {
  complete?: () => void;
  instant?: boolean;
}

function defaultSchedule(callback: () => void, delay: number): number {
  return Number(globalThis.setTimeout(callback, Math.max(0, delay)));
}

function defaultClearScheduled(id: number): void {
  globalThis.clearTimeout(id);
}

const DEFAULT_MAX_COMMAND_REDIRECTS = 50;

function isNumericValue(value: TimelinePropertyValue | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function interpolateValue(
  previous: TimelinePropertyValue | undefined,
  next: TimelinePropertyValue | undefined,
  progress: number
): TimelinePropertyValue | undefined {
  if (isNumericValue(previous) && isNumericValue(next)) {
    return Number((previous + (next - previous) * progress).toFixed(3));
  }
  return previous ?? next;
}

function keyframeSnapshotForTrack(track: TimelineTrack, frame: number): TimelineProperties {
  const keyframes = track.keyframes;
  if (!keyframes.length) return {};
  let previous = keyframes[0];
  let next = keyframes[keyframes.length - 1];
  for (const keyframe of keyframes) {
    if (keyframe.frame <= frame) previous = keyframe;
    if (keyframe.frame >= frame) {
      next = keyframe;
      break;
    }
  }
  const span = Math.max(1, next.frame - previous.frame);
  const progress = previous.frame === next.frame ? 0 : Math.max(0, Math.min(1, (frame - previous.frame) / span));
  const keys = new Set([...Object.keys(previous.props), ...Object.keys(next.props)]);
  const props: TimelineProperties = {};
  for (const key of keys) {
    const value = interpolateValue(previous.props[key], next.props[key], progress);
    if (value !== undefined) props[key] = value;
  }
  return props;
}

export function timelineSnapshotAt(timeline: TimelineDocument, frame: number): TimelineFrameSnapshot {
  const cleanFrame = Math.max(0, Math.min(Math.max(0, timeline.frameCount - 1), Math.round(frame)));
  const targets: Record<string, TimelineProperties> = {};
  for (const track of timeline.tracks) {
    targets[track.targetId] = keyframeSnapshotForTrack(track, cleanFrame);
  }
  return { frame: cleanFrame, targets };
}

export class TimelinePlayer {
  timeline: TimelineDocument | null;
  onFrame: ((snapshot: TimelineFrameSnapshot) => void) | null;
  onCommand: TimelinePlayerOptions["onCommand"] | null;
  onCommandLimit: TimelinePlayerOptions["onCommandLimit"] | null;
  maxCommandRedirects: number;
  schedule: (callback: () => void, delay: number) => number;
  clearScheduled: (id: number) => void;
  timerIds = new Set<number>();
  token = 0;
  currentFrame = 0;
  isPlaying = false;

  constructor(options: TimelinePlayerOptions = {}) {
    this.timeline = normalizeTimeline(options.timeline);
    this.onFrame = options.onFrame || null;
    this.onCommand = options.onCommand || null;
    this.onCommandLimit = options.onCommandLimit || null;
    this.maxCommandRedirects = Math.max(1, Math.round(Number(options.maxCommandRedirects) || DEFAULT_MAX_COMMAND_REDIRECTS));
    this.schedule = options.schedule || defaultSchedule;
    this.clearScheduled = options.clearScheduled || defaultClearScheduled;
  }

  updateTimeline(timeline: TimelineDocument | null | undefined): void {
    this.stop();
    this.timeline = normalizeTimeline(timeline);
  }

  hasLabel(label: string): boolean {
    return Boolean(this.timeline?.labels.some((entry) => entry.name === label));
  }

  stop(): void {
    this.token += 1;
    this.isPlaying = false;
    for (const id of this.timerIds) this.clearScheduled(id);
    this.timerIds.clear();
  }

  applyFrame(frame: number): void {
    if (!this.timeline) return;
    this.currentFrame = Math.max(0, Math.min(Math.max(0, this.timeline.frameCount - 1), Math.round(frame)));
    this.onFrame?.(timelineSnapshotAt(this.timeline, this.currentFrame));
  }

  gotoAndStop(labelOrFrame: string | number, options: TimelinePlayOptions = {}): number {
    return this.gotoAndStopInternal(labelOrFrame, options, 0);
  }

  private gotoAndStopInternal(labelOrFrame: string | number, options: TimelinePlayOptions = {}, commandCount = 0): number {
    this.stop();
    if (!this.timeline) {
      options.complete?.();
      return 0;
    }
    const frame = frameForTimelineLabel(this.timeline, labelOrFrame);
    this.applyFrame(frame);
    if (!this.runFrameCommands(frame, options.complete, commandCount)) options.complete?.();
    return 0;
  }

  gotoAndPlay(labelOrFrame: string | number, options: TimelinePlayOptions = {}): number {
    return this.gotoAndPlayInternal(labelOrFrame, options, 0);
  }

  private gotoAndPlayInternal(labelOrFrame: string | number, options: TimelinePlayOptions = {}, commandCount = 0): number {
    this.stop();
    if (!this.timeline) {
      options.complete?.();
      return 0;
    }
    const segment = timelineSegmentFor(this.timeline, labelOrFrame);
    if (options.instant === true || segment.durationMs === 0) {
      this.applyFrame(segment.endFrame);
      if (!this.runFrameCommands(segment.endFrame, options.complete, commandCount)) options.complete?.();
      return 0;
    }
    this.isPlaying = true;
    const playToken = this.token;
    const frameDuration = 1000 / this.timeline.fps;
    this.applyFrame(segment.startFrame);
    for (let frame = segment.startFrame + 1; frame <= segment.endFrame; frame += 1) {
      const delay = (frame - segment.startFrame) * frameDuration;
      const timerId = this.schedule(() => {
        if (this.token !== playToken) return;
        this.applyFrame(frame);
        const redirected = this.runFrameCommands(frame, options.complete, 0);
        if (!redirected && frame === segment.endFrame) {
          this.isPlaying = false;
          options.complete?.();
        }
      }, delay);
      this.timerIds.add(timerId);
    }
    return segment.durationMs;
  }

  runFrameCommands(frame: number, complete?: () => void, commandCount = 0): boolean {
    if (!this.timeline) return false;
    for (const command of this.timeline.commands.filter((entry) => entry.frame === frame)) {
      this.onCommand?.(command);
      if (command.type === "gotoAndStop" && command.target) {
        if (!this.canRedirectFrameCommand(frame, commandCount + 1)) return false;
        this.gotoAndStopInternal(command.target, { complete }, commandCount + 1);
        return true;
      } else if (command.type === "gotoAndPlay" && command.target) {
        if (!this.canRedirectFrameCommand(frame, commandCount + 1)) return false;
        this.gotoAndPlayInternal(command.target, { complete }, commandCount + 1);
        return true;
      }
    }
    return false;
  }

  private canRedirectFrameCommand(frame: number, commandCount: number): boolean {
    if (commandCount <= this.maxCommandRedirects) return true;
    this.stop();
    this.onCommandLimit?.({ frame, commandCount, maxCommandRedirects: this.maxCommandRedirects });
    return false;
  }
}

export const PartyGameTimeline = {
  TimelinePlayer,
  normalizeTimeline,
  timelineSnapshotAt
};

declare global {
  interface Window {
    PartyGameTimeline?: typeof PartyGameTimeline;
  }
}

export function installTimelineGlobals(target: Window | typeof globalThis = globalThis): void {
  (target as Window).PartyGameTimeline = PartyGameTimeline;
}

installTimelineGlobals(typeof window !== "undefined" ? window : globalThis);
