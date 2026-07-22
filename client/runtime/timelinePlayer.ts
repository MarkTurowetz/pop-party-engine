import {
  frameForTimelineLabel,
  hasTimelineLabel,
  normalizeTimeline,
  timelinePlaybackDuration,
  type TimelineCommand,
  timelineSegmentFor,
  type TimelineDocument,
  type TimelineKeyframe,
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
  onCommand?: (command: TimelineCommand, context: { frame: number; elapsedMs: number }) => void;
  commandDuration?: (command: TimelineCommand, context: { frame: number; elapsedMs: number }) => number;
  onCommandLimit?: (detail: { frame: number; commandCount: number; maxCommandRedirects: number }) => void;
  maxCommandRedirects?: number;
  schedule?: (callback: () => void, delay: number) => number;
  clearScheduled?: (id: number) => void;
  requestAnimationFrame?: ((callback: (timestamp: number) => void) => number) | null;
  cancelAnimationFrame?: ((id: number) => void) | null;
  now?: () => number;
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

function defaultRequestAnimationFrame(callback: (timestamp: number) => void): number {
  return globalThis.requestAnimationFrame(callback);
}

function defaultCancelAnimationFrame(id: number): void {
  globalThis.cancelAnimationFrame(id);
}

function defaultNow(): number {
  return globalThis.performance?.now?.() ?? Date.now();
}

const DEFAULT_MAX_COMMAND_REDIRECTS = 50;

function cleanCommandDuration(value: unknown): number {
  const next = Number(value);
  return Number.isFinite(next) ? Math.max(0, next) : 0;
}

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

function interpolateRotation(previous: number, next: number, progress: number, keyframe: TimelineKeyframe): number {
  const direction = keyframe.rotationDirection;
  if (!direction) return Number((previous + (next - previous) * progress).toFixed(3));
  const turns = Math.max(0, Number(keyframe.rotationTurns || 0));
  const positiveDelta = ((next - previous) % 360 + 360) % 360;
  const negativeDelta = ((previous - next) % 360 + 360) % 360;
  const delta = direction === "clockwise"
    ? positiveDelta + turns * 360
    : -(negativeDelta + turns * 360);
  return Number((previous + delta * progress).toFixed(3));
}

function easedProgress(progress: number, easing?: string): number {
  const t = Math.max(0, Math.min(1, progress));
  if (!easing || easing === "hold") return 0;
  if (easing === "linear") return t;
  if (easing === "easeIn") return t * t;
  if (easing === "easeOut") return 1 - (1 - t) * (1 - t);
  if (easing === "easeInOut") return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  return 0;
}

function keyframeSnapshotForTrack(track: TimelineTrack, frame: number): TimelineProperties {
  const keyframes = track.keyframes;
  if (!keyframes.length) return {};
  if (frame < keyframes[0].frame) return {};
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
  const progress = previous.frame === next.frame ? 0 : easedProgress((frame - previous.frame) / span, previous.easing);
  const keys = new Set([...Object.keys(previous.props), ...Object.keys(next.props)]);
  const props: TimelineProperties = {};
  for (const key of keys) {
    const previousValue = previous.props[key];
    const nextValue = next.props[key];
    const value = key === "rotation" && isNumericValue(previousValue) && isNumericValue(nextValue)
      ? interpolateRotation(previousValue, nextValue, progress, previous)
      : interpolateValue(previousValue, nextValue, progress);
    if (value !== undefined) props[key] = value;
  }
  return props;
}

export function timelineSnapshotAt(timeline: TimelineDocument, frame: number): TimelineFrameSnapshot {
  const cleanFrame = Math.max(0, Math.min(Math.max(0, timeline.frameCount - 1), Math.round(frame)));
  return timelineSnapshotAtPosition(timeline, cleanFrame, cleanFrame);
}

export function timelineSnapshotAtPosition(
  timeline: TimelineDocument,
  framePosition: number,
  displayFrame = Math.floor(framePosition)
): TimelineFrameSnapshot {
  const maxFrame = Math.max(0, timeline.frameCount - 1);
  const cleanPosition = Math.max(0, Math.min(maxFrame, Number(framePosition) || 0));
  const cleanDisplayFrame = Math.max(0, Math.min(maxFrame, Math.floor(Number(displayFrame) || 0)));
  const targets: Record<string, TimelineProperties> = {};
  for (const track of timeline.tracks) {
    targets[track.targetId] = keyframeSnapshotForTrack(track, cleanPosition);
  }
  return { frame: cleanDisplayFrame, targets };
}

export class TimelinePlayer {
  timeline: TimelineDocument | null;
  onFrame: ((snapshot: TimelineFrameSnapshot) => void) | null;
  onCommand: TimelinePlayerOptions["onCommand"] | null;
  commandDuration: NonNullable<TimelinePlayerOptions["commandDuration"]> | null;
  onCommandLimit: TimelinePlayerOptions["onCommandLimit"] | null;
  maxCommandRedirects: number;
  schedule: (callback: () => void, delay: number) => number;
  clearScheduled: (id: number) => void;
  requestAnimationFrame: ((callback: (timestamp: number) => void) => number) | null;
  cancelAnimationFrame: ((id: number) => void) | null;
  now: () => number;
  timerIds = new Set<number>();
  animationFrameId: number | null = null;
  token = 0;
  currentFrame = 0;
  isPlaying = false;

  constructor(options: TimelinePlayerOptions = {}) {
    this.timeline = normalizeTimeline(options.timeline);
    this.onFrame = options.onFrame || null;
    this.commandDuration = options.commandDuration || null;
    this.onCommand = options.onCommand || null;
    this.onCommandLimit = options.onCommandLimit || null;
    this.maxCommandRedirects = Math.max(1, Math.round(Number(options.maxCommandRedirects) || DEFAULT_MAX_COMMAND_REDIRECTS));
    this.schedule = options.schedule || defaultSchedule;
    this.clearScheduled = options.clearScheduled || defaultClearScheduled;
    const browserCanAnimate =
      typeof globalThis.requestAnimationFrame === "function" && typeof globalThis.cancelAnimationFrame === "function";
    this.requestAnimationFrame =
      options.requestAnimationFrame === undefined
        ? browserCanAnimate
          ? defaultRequestAnimationFrame
          : null
        : options.requestAnimationFrame;
    this.cancelAnimationFrame =
      options.cancelAnimationFrame === undefined
        ? browserCanAnimate
          ? defaultCancelAnimationFrame
          : null
        : options.cancelAnimationFrame;
    this.now = options.now || defaultNow;
  }

  updateTimeline(timeline: TimelineDocument | null | undefined): void {
    this.stop();
    this.timeline = normalizeTimeline(timeline);
  }

  hasLabel(label: string): boolean {
    return hasTimelineLabel(this.timeline, label);
  }

  stop(): void {
    this.token += 1;
    this.isPlaying = false;
    for (const id of this.timerIds) this.clearScheduled(id);
    this.timerIds.clear();
    if (this.animationFrameId !== null) this.cancelAnimationFrame?.(this.animationFrameId);
    this.animationFrameId = null;
  }

  private scheduleFrame(callback: () => void, delay: number): void {
    let timerId = 0;
    timerId = this.schedule(() => {
      this.timerIds.delete(timerId);
      callback();
    }, delay);
    this.timerIds.add(timerId);
  }

  private durationForFrameCommands(frame: number, commandCount = 0): number {
    if (!this.timeline) return 0;
    let duration = 0;
    for (const command of this.timeline.commands.filter((entry) => entry.frame === frame)) {
      if ((command.type === "gotoAndPlay" || command.type === "gotoAndStop") && command.target) {
        if (commandCount + 1 > this.maxCommandRedirects) return duration;
        if (command.type === "gotoAndPlay") {
          duration = Math.max(
            duration,
            timelinePlaybackDuration(this.timeline, command.target, {
              commandDuration: this.commandDuration || undefined,
              maxCommandRedirects: this.maxCommandRedirects - commandCount - 1
            })
          );
        } else {
          duration = Math.max(duration, this.durationForFrameCommands(frameForTimelineLabel(this.timeline, command.target), commandCount + 1));
        }
        continue;
      }
      duration = Math.max(duration, cleanCommandDuration(this.commandDuration?.(command, { frame, elapsedMs: 0 })));
    }
    return Math.max(0, duration);
  }

  private cleanTimelineFrame(frame: number): number {
    if (!this.timeline) return 0;
    return Math.max(0, Math.min(Math.max(0, this.timeline.frameCount - 1), Math.round(Number(frame) || 0)));
  }

  private nextStopFrameAfter(startFrame: number): number {
    if (!this.timeline) return 0;
    const cleanStartFrame = this.cleanTimelineFrame(startFrame);
    const maxFrame = Math.max(0, this.timeline.frameCount - 1);
    const stop = this.timeline.commands.find((command) => command.type === "stop" && command.frame > cleanStartFrame);
    return stop ? stop.frame : maxFrame;
  }

  private durationFromFrame(startFrame: number, endFrame: number): number {
    if (!this.timeline) return 0;
    const cleanStartFrame = this.cleanTimelineFrame(startFrame);
    const cleanEndFrame = this.cleanTimelineFrame(endFrame);
    const frameDuration = 1000 / this.timeline.fps;
    let duration = Math.max(0, (cleanEndFrame - cleanStartFrame) * frameDuration);
    for (let frame = cleanStartFrame; frame <= cleanEndFrame; frame += 1) {
      const elapsedMs = Math.max(0, (frame - cleanStartFrame) * frameDuration);
      duration = Math.max(duration, elapsedMs + this.durationForFrameCommands(frame, 0));
    }
    return duration;
  }

  applyFrame(frame: number): void {
    if (!this.timeline) return;
    this.currentFrame = this.cleanTimelineFrame(frame);
    this.onFrame?.(timelineSnapshotAt(this.timeline, this.currentFrame));
  }

  private applyFramePosition(framePosition: number, displayFrame = Math.floor(framePosition)): void {
    if (!this.timeline) return;
    this.currentFrame = this.cleanTimelineFrame(displayFrame);
    this.onFrame?.(timelineSnapshotAtPosition(this.timeline, framePosition, this.currentFrame));
  }

  gotoAndStop(labelOrFrame: string | number, options: TimelinePlayOptions = {}): number {
    return this.gotoAndStopInternal(labelOrFrame, options, 0);
  }

  private gotoAndStopInternal(labelOrFrame: string | number, options: TimelinePlayOptions = {}, commandCount = 0): number {
    this.stop();
    if (!this.timeline) return 0;
    if (typeof labelOrFrame === "string" && !this.hasLabel(labelOrFrame)) return 0;
    const frame = frameForTimelineLabel(this.timeline, labelOrFrame);
    const duration = this.durationForFrameCommands(frame, commandCount);
    this.applyFrame(frame);
    if (!this.runFrameCommands(frame, options.complete, commandCount, 0)) {
      this.isPlaying = false;
      options.complete?.();
    }
    return duration;
  }

  gotoAndPlay(labelOrFrame: string | number, options: TimelinePlayOptions = {}): number {
    return this.gotoAndPlayInternal(labelOrFrame, options, 0);
  }

  playFromFrame(frame: number, options: TimelinePlayOptions = {}): number {
    this.stop();
    if (!this.timeline) return 0;
    const startFrame = this.cleanTimelineFrame(frame);
    const endFrame = this.nextStopFrameAfter(startFrame);
    const duration = this.durationFromFrame(startFrame, endFrame);
    if (options.instant === true || endFrame <= startFrame) {
      this.applyFrame(endFrame);
      if (!this.runFrameCommands(endFrame, options.complete, 0, duration)) {
        this.isPlaying = false;
        options.complete?.();
      }
      return duration;
    }
    this.playRange(startFrame, endFrame, options, 0);
    return duration;
  }

  private gotoAndPlayInternal(labelOrFrame: string | number, options: TimelinePlayOptions = {}, commandCount = 0): number {
    this.stop();
    if (!this.timeline) return 0;
    if (typeof labelOrFrame === "string" && !this.hasLabel(labelOrFrame)) return 0;
    const segment = timelineSegmentFor(this.timeline, labelOrFrame);
    const duration = timelinePlaybackDuration(this.timeline, labelOrFrame, {
      instant: options.instant,
      commandDuration: this.commandDuration || undefined,
      maxCommandRedirects: this.maxCommandRedirects - commandCount
    });
    if (options.instant === true || segment.durationMs === 0) {
      this.applyFrame(segment.endFrame);
      if (!this.runFrameCommands(segment.endFrame, options.complete, commandCount, segment.durationMs)) {
        this.isPlaying = false;
        options.complete?.();
      }
      return duration;
    }
    this.playRange(segment.startFrame, segment.endFrame, options, commandCount);
    return duration;
  }

  private playRange(startFrame: number, endFrame: number, options: TimelinePlayOptions, commandCount: number): void {
    if (!this.timeline) return;
    const playToken = this.token;
    const frameDuration = 1000 / this.timeline.fps;
    this.isPlaying = true;
    this.applyFrame(startFrame);
    if (this.runFrameCommands(startFrame, options.complete, commandCount, 0)) return;

    if (this.requestAnimationFrame && this.cancelAnimationFrame) {
      const startedAt = this.now();
      let lastCommandFrame = startFrame;
      const tick = (timestamp: number) => {
        if (this.token !== playToken || !this.timeline) return;
        const elapsedMs = Math.max(0, timestamp - startedAt);
        const framePosition = Math.min(endFrame, startFrame + elapsedMs / frameDuration);
        const reachedFrame = Math.min(endFrame, Math.floor(framePosition));
        this.applyFramePosition(framePosition, reachedFrame);
        for (let frame = lastCommandFrame + 1; frame <= reachedFrame; frame += 1) {
          const commandElapsedMs = (frame - startFrame) * frameDuration;
          if (this.runFrameCommands(frame, options.complete, commandCount, commandElapsedMs)) return;
          lastCommandFrame = frame;
        }
        if (framePosition >= endFrame) {
          this.animationFrameId = null;
          this.isPlaying = false;
          options.complete?.();
          return;
        }
        this.animationFrameId = this.requestAnimationFrame?.(tick) ?? null;
      };
      this.animationFrameId = this.requestAnimationFrame(tick);
      return;
    }

    for (let frame = startFrame + 1; frame <= endFrame; frame += 1) {
      const delay = (frame - startFrame) * frameDuration;
      this.scheduleFrame(() => {
        if (this.token !== playToken) return;
        this.applyFrame(frame);
        const redirected = this.runFrameCommands(frame, options.complete, commandCount, delay);
        if (!redirected && frame === endFrame) {
          this.isPlaying = false;
          options.complete?.();
        }
      }, delay);
    }
  }

  runFrameCommands(frame: number, complete?: () => void, commandCount = 0, elapsedMs = 0): boolean {
    if (!this.timeline) return false;
    for (const command of this.timeline.commands.filter((entry) => entry.frame === frame)) {
      this.onCommand?.(command, { frame, elapsedMs });
      if (command.type === "gotoAndStop" && command.target) {
        if (!this.canRedirectFrameCommand(frame, commandCount + 1)) return false;
        this.gotoAndStopInternal(command.target, { complete }, commandCount + 1);
        return true;
      } else if (command.type === "gotoAndPlay" && command.target) {
        if (!this.canRedirectFrameCommand(frame, commandCount + 1)) return false;
        this.gotoAndPlayInternal(command.target, { complete }, commandCount + 1);
        return true;
      } else if (command.type === "loop" && command.target) {
        // A loop is an intentional authored cycle, not a redirect chain. Reset
        // the redirect counter on each pass so idle animations remain active
        // until their owning GameObject is stopped or removed.
        this.gotoAndPlayInternal(command.target, { complete }, 0);
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
  timelineSnapshotAt,
  timelineSnapshotAtPosition
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
