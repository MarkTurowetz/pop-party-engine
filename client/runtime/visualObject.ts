// Typed port of the legacy client/stage/visual-object.js IIFE. PartyGameVisualObject
// is exported for TS consumers (game-object next) and installed on window for the
// still-legacy stage runtime.

import {
  defaultVisibilityTimeline,
  hasTimelineLabel,
  normalizeTimeline,
  timelineSegmentFor,
  type TimelineCommand,
  type TimelineDocument,
  type TimelineProperties,
  type TimelinePropertyValue
} from "../../shared/timeline-model";
import { TimelinePlayer, type TimelineFrameSnapshot } from "./timelinePlayer";

export type AnimationName = "park" | "on" | "off" | "appear" | "disappear" | "update";
type VisualLifecycleState = "hidden" | "shown" | "appearing" | "disappearing";

const DEFAULT_DURATIONS = Object.freeze({
  park: 0,
  on: 0,
  off: 0,
  appear: 500,
  disappear: 500,
  update: 200
});

function asArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter(Boolean) as string[];
  return value ? [value as string] : [];
}

function animationForVisibility(isShown: boolean, wasVisible: boolean): AnimationName {
  if (!isShown) return wasVisible ? "disappear" : "park";
  return wasVisible ? "update" : "appear";
}

function instantAnimation(animation: string, instant: boolean): string {
  if (!instant) return animation;
  if (animation === "appear" || animation === "update") return "on";
  if (animation === "disappear" || animation === "park") return "off";
  return animation;
}

function animationToken(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function isVisualLifecycleState(value: unknown): value is VisualLifecycleState {
  return value === "hidden" || value === "shown" || value === "appearing" || value === "disappearing";
}

function isShownLifecycleState(state: VisualLifecycleState): boolean {
  return state === "shown" || state === "appearing" || state === "disappearing";
}

function normalizeTimelineCanvas(value: CssVisualObjectOptions["timelineCanvas"]): { width: number; height: number } | null {
  const width = Number(value?.width);
  const height = Number(value?.height);
  if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) return null;
  return { width, height };
}

function numericTimelineValue(value: TimelinePropertyValue | undefined): number | null {
  const next = Number(value);
  return Number.isFinite(next) ? next : null;
}

function timelineTextValue(value: TimelinePropertyValue | undefined): string | null {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return null;
}

function setStyleProperty(element: HTMLElement, name: string, value: string): void {
  if (typeof element.style.setProperty === "function") {
    element.style.setProperty(name, value);
    return;
  }
  (element.style as unknown as Record<string, string>)[name] = value;
}

function timelineDomEvent(type: string, detail: TimelineCommandEventDetail): Event {
  if (typeof globalThis.CustomEvent === "function") {
    return new globalThis.CustomEvent(type, { bubbles: true, detail });
  }
  return { type, detail } as unknown as Event;
}

export interface TimelineCommandEventDetail {
  command: TimelineCommand;
  eventName: string;
  visual: CssVisualObject;
}

interface CustomAnimationApi {
  addClasses: (classes: unknown) => void;
  animation: string;
  applyParkedState: () => void;
  applyShownState: () => void;
  duration: number;
  element: HTMLElement | undefined;
  hasAnyClass: (classes: unknown) => boolean;
  instant: boolean;
  removeClasses: (classes: unknown) => void;
  schedule: (delay: number, callback?: () => void) => number | null;
  setVisibleState: (isVisible: boolean) => void;
  token: string;
  tokenMatches: () => boolean;
  wasVisible: boolean;
}

export interface CssVisualObjectOptions {
  element?: HTMLElement;
  hiddenClasses?: string | string[];
  motionHiddenClasses?: string | string[];
  displayHiddenClasses?: string | string[];
  exitingClass?: string;
  updateClass?: string;
  instantClass?: string;
  animationHandlers?: Record<string, (api: CustomAnimationApi) => number>;
  transformOrigin?: string | false;
  getVisible?: () => boolean;
  setVisible?: (isVisible: boolean) => void;
  timerSink?: (timerId: number) => void;
  durations?: Partial<Record<AnimationName, number>>;
  timeline?: TimelineDocument | null;
  timelineCanvas?: { width?: number; height?: number } | null;
  timelineCommandHandler?: (detail: TimelineCommandEventDetail) => void;
}

interface PlayOptions {
  instant?: boolean;
  complete?: () => void;
}

class CssVisualObject {
  element?: HTMLElement;
  hiddenClasses: string[];
  motionHiddenClasses: string[];
  displayHiddenClasses: string[];
  exitingClass: string;
  updateClass: string;
  instantClass: string;
  animationHandlers: Record<string, (api: CustomAnimationApi) => number>;
  transformOrigin: string;
  getVisible: (() => boolean) | null;
  setVisible: ((isVisible: boolean) => void) | null;
  timerSink: ((timerId: number) => void) | null;
  durations: Record<string, number>;
  timeline: TimelineDocument | null;
  timelineCanvas: { width: number; height: number } | null;
  timelineCommandHandler: ((detail: TimelineCommandEventDetail) => void) | null;
  timelinePlayer: TimelinePlayer | null;
  token: string;

  constructor(options: CssVisualObjectOptions = {}) {
    this.element = options.element;
    this.hiddenClasses = asArray(options.hiddenClasses || "hidden");
    this.motionHiddenClasses = asArray(options.motionHiddenClasses || this.hiddenClasses);
    this.displayHiddenClasses = asArray(options.displayHiddenClasses);
    this.exitingClass = options.exitingClass || "";
    this.updateClass = options.updateClass || "";
    this.instantClass = options.instantClass || "";
    this.animationHandlers = options.animationHandlers || {};
    this.transformOrigin = options.transformOrigin === false ? "" : options.transformOrigin || "center center";
    this.getVisible = typeof options.getVisible === "function" ? options.getVisible : null;
    this.setVisible = typeof options.setVisible === "function" ? options.setVisible : null;
    this.timerSink = typeof options.timerSink === "function" ? options.timerSink : null;
    this.durations = { ...DEFAULT_DURATIONS, ...(options.durations || {}) };
    this.timeline = normalizeTimeline(options.timeline);
    this.timelineCanvas = normalizeTimelineCanvas(options.timelineCanvas);
    this.timelineCommandHandler = typeof options.timelineCommandHandler === "function" ? options.timelineCommandHandler : null;
    this.timelinePlayer = this.timeline
      ? new TimelinePlayer({
          timeline: this.timeline,
          onFrame: (snapshot) => this.applyTimelineSnapshot(snapshot),
          onCommand: (command) => this.handleTimelineCommand(command),
          schedule: (callback, delay) => {
            const timerId = this.schedule(delay, callback);
            return timerId || 0;
          },
          clearScheduled: (id) => {
            if (id) window.clearTimeout(id);
          }
        })
      : null;
    this.token = "";
    this.applyTransformOrigin();
  }

  applyTransformOrigin(): void {
    if (this.element && this.transformOrigin) {
      this.element.style.transformOrigin = this.transformOrigin;
    }
  }

  timelineTargetIds(): string[] {
    const ids = new Set<string>(["self"]);
    const dataset = this.element?.dataset || {};
    if (this.element?.id) ids.add(this.element.id);
    if (dataset.artComponentId) ids.add(dataset.artComponentId);
    if (dataset.componentId) ids.add(dataset.componentId);
    return Array.from(ids);
  }

  applyTimelineSnapshot(snapshot: TimelineFrameSnapshot): void {
    const targetIds = this.timelineTargetIds();
    for (const targetId of targetIds) {
      const props = snapshot.targets[targetId];
      if (props) {
        this.applyTimelineProperties(props);
        return;
      }
    }
  }

  applyTimelineProperties(props: TimelineProperties): void {
    if (!this.element) return;
    const width = numericTimelineValue(props.width);
    const height = numericTimelineValue(props.height);
    const x = numericTimelineValue(props.x);
    const y = numericTimelineValue(props.y);
    const scale = numericTimelineValue(props.scale);
    const rotation = numericTimelineValue(props.rotation);
    const opacity = numericTimelineValue(props.opacity);
    if (width !== null) this.element.style.width = this.canvasUnit(width, "width");
    if (height !== null) this.element.style.height = this.canvasUnit(height, "height");
    if (x !== null) this.element.style.left = this.canvasUnit(x, "width");
    if (y !== null) this.element.style.top = this.canvasUnit(y, "height");
    if (scale !== null) setStyleProperty(this.element, "--component-scale", String(scale));
    if (rotation !== null) setStyleProperty(this.element, "--component-rotation", `${rotation}deg`);
    if (opacity !== null) this.element.style.opacity = String(Math.max(0, Math.min(1, opacity)));
    if (typeof props.visible === "boolean") {
      this.element.style.display = props.visible ? "" : "none";
    }
    const text = timelineTextValue(props.text ?? props.defaultText);
    if (text !== null) {
      const label = this.element.querySelector?.(".art-runtime-object-label");
      if (label) label.textContent = text;
    }
  }

  canvasUnit(value: number, axis: "width" | "height"): string {
    const canvasSize = this.timelineCanvas?.[axis] || 0;
    return canvasSize > 0 ? `${(value / canvasSize) * 100}%` : `${value}px`;
  }

  handleTimelineCommand(command: TimelineCommand): void {
    const eventName = String(command.event || command.type || "").trim();
    if (!eventName) return;
    const detail: TimelineCommandEventDetail = { command, eventName, visual: this };
    this.timelineCommandHandler?.(detail);
    this.element?.dispatchEvent?.(timelineDomEvent("party-game:timeline-command", detail));
    if (command.type === "emit") {
      this.element?.dispatchEvent?.(timelineDomEvent(`party-game:timeline:${eventName}`, detail));
    }
  }

  addClasses(classes: string[]): void {
    for (const className of classes) this.element?.classList.add(className);
  }

  removeClasses(classes: string[]): void {
    for (const className of classes) this.element?.classList.remove(className);
  }

  hasAnyClass(classes: string[]): boolean {
    return classes.some((className) => this.element?.classList.contains(className));
  }

  isVisible(): boolean {
    if (!this.element) return false;
    return isShownLifecycleState(this.readLifecycleState());
  }

  rememberTimer(timerId: number): void {
    if (this.timerSink) this.timerSink(timerId);
  }

  setVisibleState(isVisible: boolean): void {
    if (this.setVisible) {
      this.setVisible(isVisible);
      return;
    }
    if (this.element) this.element.dataset.visualVisible = isVisible ? "true" : "false";
  }

  schedule(delay: number, callback?: () => void): number | null {
    if (typeof callback !== "function") return null;
    const timerId = window.setTimeout(callback, Math.max(0, Number(delay || 0)));
    this.rememberTimer(timerId);
    return timerId;
  }

  completeAfter(delay: number, complete?: () => void): void {
    this.schedule(delay, complete);
  }

  customAnimationApi(animation: string, token: string, duration: number, instant: boolean, wasVisible: boolean): CustomAnimationApi {
    return {
      addClasses: (classes) => this.addClasses(asArray(classes)),
      animation,
      applyParkedState: () => this.applyParkedState(),
      applyShownState: () => this.applyShownState(),
      duration,
      element: this.element,
      hasAnyClass: (classes) => this.hasAnyClass(asArray(classes)),
      instant,
      removeClasses: (classes) => this.removeClasses(asArray(classes)),
      schedule: (delay, callback) => this.schedule(delay, callback),
      setVisibleState: (isVisible) => this.setVisibleState(isVisible),
      token,
      tokenMatches: () => this.tokenMatches(token),
      wasVisible
    };
  }

  playCustomAnimation(animation: string, token: string, duration: number, instant: boolean, wasVisible: boolean): number | null {
    const handler = this.animationHandlers[animation];
    if (typeof handler !== "function") return null;
    const nextDuration = Number(handler(this.customAnimationApi(animation, token, duration, instant, wasVisible)));
    return Number.isFinite(nextDuration) ? Math.max(0, nextDuration) : duration;
  }

  durationForAnimation(animation: string): number {
    if (this.timeline && hasTimelineLabel(this.timeline, animation)) {
      return timelineSegmentFor(this.timeline, animation).durationMs;
    }
    return this.durations[animation] || 0;
  }

  markNewAnimation(): string {
    this.token = animationToken();
    if (this.element) this.element.dataset.visualAnimationToken = this.token;
    return this.token;
  }

  tokenMatches(token: string): boolean {
    return this.element?.dataset.visualAnimationToken === token;
  }

  readLifecycleState(): VisualLifecycleState {
    if (!this.element) return "hidden";
    const state = this.element.dataset.visualState;
    if (isVisualLifecycleState(state)) return state;
    if (this.getVisible) return this.getVisible() ? "shown" : "hidden";
    if (this.element.dataset.visualVisible === "true") return "shown";
    return this.hasAnyClass([...this.hiddenClasses, this.exitingClass].filter(Boolean)) ? "hidden" : "shown";
  }

  setLifecycleState(state: VisualLifecycleState): void {
    if (this.element) this.element.dataset.visualState = state;
  }

  clearTransientClasses(): void {
    this.removeClasses([this.updateClass, this.instantClass].filter(Boolean));
  }

  applyParkedState(): void {
    this.addClasses(this.hiddenClasses);
    if (this.exitingClass) this.element?.classList.remove(this.exitingClass);
    this.setLifecycleState("hidden");
    this.setVisibleState(false);
  }

  applyShownState(): void {
    this.removeClasses([...this.hiddenClasses, this.exitingClass].filter(Boolean));
    this.setLifecycleState("shown");
    this.setVisibleState(true);
  }

  applyAppearingState(): void {
    this.setVisibleState(true);
    this.setLifecycleState("appearing");
  }

  applyDisappearingState(): void {
    this.setVisibleState(true);
    this.setLifecycleState("disappearing");
  }

  completeLifecycleAnimation(animation: string, token: string): void {
    if (!this.tokenMatches(token)) return;
    if (animation === "appear" || animation === "on") {
      this.applyShownState();
    } else if (animation === "disappear" || animation === "off" || animation === "park") {
      this.applyParkedState();
    } else if (animation === "update") {
      this.applyShownState();
    }
  }

  play(animation: string, options: PlayOptions = {}): number {
    if (!this.element) return 0;
    const instant = options.instant === true;
    const effectiveAnimation = instantAnimation(animation, instant);
    const duration = this.durationForAnimation(effectiveAnimation);
    const lifecycleState = this.readLifecycleState();
    const wasVisible = isShownLifecycleState(lifecycleState);

    if (
      (effectiveAnimation === "appear" || effectiveAnimation === "on") &&
      (lifecycleState === "shown" || lifecycleState === "appearing")
    ) {
      this.setVisibleState(true);
      this.completeAfter(0, options.complete);
      return 0;
    }

    if ((effectiveAnimation === "update" || effectiveAnimation === "on") && lifecycleState === "appearing") {
      this.setVisibleState(true);
      this.completeAfter(0, options.complete);
      return 0;
    }

    if ((effectiveAnimation === "disappear" || effectiveAnimation === "off") && lifecycleState === "hidden") {
      this.applyParkedState();
      this.completeAfter(0, options.complete);
      return 0;
    }

    const token = this.markNewAnimation();
    if (this.timelinePlayer?.hasLabel(effectiveAnimation)) {
      this.timelinePlayer.gotoAndPlay(effectiveAnimation, { instant });
    }
    this.clearTransientClasses();
    if (instant || effectiveAnimation === "on" || effectiveAnimation === "off") {
      this.addClasses([this.instantClass].filter(Boolean));
    }

    if (effectiveAnimation === "appear") {
      this.applyAppearingState();
    } else if (effectiveAnimation === "disappear") {
      this.applyDisappearingState();
    }

    const customDuration = this.playCustomAnimation(effectiveAnimation, token, duration, instant, wasVisible);
    if (customDuration !== null) {
      if (customDuration > 0) {
        this.completeAfter(customDuration, () => this.completeLifecycleAnimation(effectiveAnimation, token));
      } else {
        this.completeLifecycleAnimation(effectiveAnimation, token);
      }
      this.completeAfter(customDuration, options.complete);
      return customDuration;
    }

    if (effectiveAnimation === "park" || effectiveAnimation === "off") {
      this.applyParkedState();
    } else if (effectiveAnimation === "on") {
      this.applyShownState();
    } else if (effectiveAnimation === "appear") {
      this.removeClasses(this.displayHiddenClasses);
      if (this.exitingClass) this.element.classList.remove(this.exitingClass);
      this.addClasses(this.motionHiddenClasses);
      void this.element.offsetWidth;
      this.applyAppearingState();
      window.requestAnimationFrame(() => {
        if (!this.tokenMatches(token)) return;
        this.removeClasses(this.motionHiddenClasses);
      });
      this.completeAfter(duration, () => this.completeLifecycleAnimation(effectiveAnimation, token));
    } else if (effectiveAnimation === "disappear") {
      this.removeClasses([...this.hiddenClasses, ...this.displayHiddenClasses]);
      void this.element.offsetWidth;
      this.applyDisappearingState();
      if (this.exitingClass) {
        this.element.classList.add(this.exitingClass);
      } else {
        this.addClasses(this.motionHiddenClasses);
      }
      if (duration > 0) {
        const timerId = window.setTimeout(() => {
          if (!this.tokenMatches(token)) return;
          this.applyParkedState();
        }, duration);
        this.rememberTimer(timerId);
      } else {
        this.applyParkedState();
      }
    } else if (effectiveAnimation === "update") {
      this.applyShownState();
      void this.element.offsetWidth;
      if (!instant) this.addClasses([this.updateClass].filter(Boolean));
    }

    this.completeAfter(duration, options.complete);
    return duration;
  }
}

export const PartyGameVisualObject = {
  DEFAULT_DURATIONS,
  CssVisualObject,
  animationForVisibility,
  createCssVisualObject: (options?: CssVisualObjectOptions) => new CssVisualObject(options),
  defaultVisibilityTimeline,
  createLegacyCssVisualObject: (options?: CssVisualObjectOptions) => new CssVisualObject(options),
  instantAnimation
};

export type PartyGameVisualObjectApi = typeof PartyGameVisualObject;
export { CssVisualObject };

declare global {
  interface Window {
    PartyGameVisualObject?: PartyGameVisualObjectApi;
  }
}

export function installVisualObjectGlobals(target: Window | typeof globalThis = globalThis): void {
  (target as Window).PartyGameVisualObject = PartyGameVisualObject;
}

installVisualObjectGlobals(typeof window !== "undefined" ? window : globalThis);
