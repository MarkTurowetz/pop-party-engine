// Typed port of the legacy client/stage/visual-object.js IIFE. Behaviour preserved
// 1:1; PartyGameVisualObject is exported for TS consumers (game-object next) and
// installed on window for the still-legacy stage runtime.

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
    this.token = "";
    this.applyTransformOrigin();
  }

  applyTransformOrigin(): void {
    if (this.element && this.transformOrigin) {
      this.element.style.transformOrigin = this.transformOrigin;
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
    const duration = this.durations[effectiveAnimation] || 0;
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
