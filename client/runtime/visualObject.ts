// Typed port of the legacy client/stage/visual-object.js IIFE. PartyGameVisualObject
// is exported for TS consumers (game-object next) and installed on window for the
// still-legacy stage runtime.

import {
  defaultVisibilityTimeline,
  hasTimelineLabel,
  normalizeTimeline,
  timelinePlaybackDuration,
  type TimelineCommand,
  type TimelineDocument,
  type TimelineProperties,
  type TimelinePropertyValue
} from "../../shared/timeline-model";
import { lifecycleLabelsMatch } from "../../shared/lifecycle-labels";
import { PartyGameTextFit, type PartyGameTextFitApi } from "./textFit";
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
  if (!isShown) return wasVisible ? "disappear" : "off";
  return wasVisible ? "update" : "appear";
}

function instantAnimation(animation: string, instant: boolean): string {
  if (!instant) return animation;
  if (animation === "appear" || animation === "update") return "on";
  if (animation === "disappear" || animation === "park") return "off";
  return animation;
}

function normalizeLifecycleAnimation(animation: unknown): string {
  const cleanAnimation = String(animation || "").trim();
  for (const lifecycle of ["park", "on", "off", "appear", "disappear", "update"] as AnimationName[]) {
    if (lifecycleLabelsMatch(cleanAnimation, lifecycle)) return lifecycle;
  }
  return cleanAnimation;
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

function isTargetShownLifecycleState(state: VisualLifecycleState): boolean {
  return state === "shown" || state === "appearing";
}

function normalizeTimelineCanvas(
  value: CssVisualObjectOptions["timelineCanvas"]
): { width: number; height: number; minX: number; minY: number } | null {
  const width = Number(value?.width);
  const height = Number(value?.height);
  if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) return null;
  const minX = Number(value?.minX);
  const minY = Number(value?.minY);
  return {
    width,
    height,
    minX: Number.isFinite(minX) ? minX : 0,
    minY: Number.isFinite(minY) ? minY : 0
  };
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
  if (element.style.getPropertyValue?.(name) === value) return;
  if (typeof element.style.setProperty === "function") {
    element.style.setProperty(name, value);
    return;
  }
  (element.style as unknown as Record<string, string>)[name] = value;
}

function removeStyleProperty(element: HTMLElement, name: string): void {
  if (!element.style.getPropertyValue?.(name)) return;
  if (typeof element.style.removeProperty === "function") {
    element.style.removeProperty(name);
    return;
  }
  delete (element.style as unknown as Record<string, string>)[name];
}

function setInlineStyle(element: HTMLElement, name: string, value: string): boolean {
  const style = element.style as unknown as Record<string, string>;
  if (style[name] === value) return false;
  style[name] = value;
  return true;
}

function hasTimelineProperty(props: TimelineProperties, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(props, key);
}

const TIMELINE_SHAPE_STYLE_CLASSES = ["is-style-rounded", "is-style-circle", "is-style-pill", "is-style-rectangle"];
const TIMELINE_TEXT_PADDING = 4;
const TIMELINE_DEFAULT_TEXT_SIZE = 16;

function timelineShapeStyle(value: TimelinePropertyValue | undefined): string | null {
  const style = timelineTextValue(value);
  if (style === "circle" || style === "pill" || style === "rectangle" || style === "rounded") return style;
  return null;
}

function setTimelineShapeStyleClass(element: HTMLElement, style: string): void {
  if (element.classList?.contains?.(`is-style-${style}`)) return;
  element.classList?.remove?.(...TIMELINE_SHAPE_STYLE_CLASSES);
  element.classList?.add?.(`is-style-${style}`);
}

function textFitApi(): PartyGameTextFitApi {
  const globalApi = (globalThis as typeof globalThis & { PartyGameTextFit?: Partial<PartyGameTextFitApi> }).PartyGameTextFit;
  return typeof globalApi?.renderLayoutTextField === "function" ? (globalApi as PartyGameTextFitApi) : PartyGameTextFit;
}

function positiveStyleNumber(value: unknown): number | null {
  const parsed = Number.parseFloat(String(value ?? ""));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function timelineTextBoxSize(element: HTMLElement, key: "width" | "height", timelineValue: number | null): number {
  const direct = key === "width" ? element.clientWidth || element.offsetWidth : element.clientHeight || element.offsetHeight;
  if (Number.isFinite(direct) && direct > 0) return direct;
  const bounds = element.getBoundingClientRect?.();
  const rendered = Number(bounds?.[key] || 0);
  if (Number.isFinite(rendered) && rendered > 0) return rendered;
  // Authored timeline dimensions are expressed in the nested composition's
  // canvas. A prefab reference may render that canvas at a different size, so
  // they are only a fallback while the element has no measurable layout (for
  // example, while an ancestor is parked Off).
  if (timelineValue !== null) return timelineValue;
  return positiveStyleNumber(element.style[key]) || 1;
}

function currentComponentFontSize(element: HTMLElement, explicitSize: number | null): number {
  return explicitSize || positiveStyleNumber(element.style.getPropertyValue?.("--component-font-size")) || TIMELINE_DEFAULT_TEXT_SIZE;
}

function renderTimelineLabelText(element: HTMLElement, props: TimelineProperties, width: number | null, height: number | null, fontSize: number | null): void {
  const label = element.querySelector?.(".art-runtime-object-label") as HTMLElement | null | undefined;
  if (!label) return;
  const explicitText = timelineTextValue(props.text ?? props.defaultText);
  const text = explicitText !== null ? explicitText : String(label.textContent ?? "");
  if (!text) {
    label.textContent = "";
    return;
  }
  const fallbackSize = currentComponentFontSize(element, fontSize);
  const fontFamily = timelineTextValue(props.fontFamily) || element.style.getPropertyValue?.("--component-font-family") || undefined;
  const fontColor = timelineTextValue(props.fontColor) || element.style.getPropertyValue?.("--component-text-color") || undefined;
  const layout = textFitApi().renderLayoutTextField(label, {
    defaultText: text,
    width: timelineTextBoxSize(element, "width", width),
    height: timelineTextBoxSize(element, "height", height),
    fontSize: fallbackSize,
    fontFamily,
    fontColor,
    autoFitText: props.autoFitText !== false
  }, {
    text,
    defaults: { defaultText: text, fontSize: fallbackSize, fontColor },
    fallbackSize,
    renderOptions: { padding: TIMELINE_TEXT_PADDING }
  }) as Record<string, unknown> | null;
  const measuredSize = Number(layout?.fontSize);
  if (Number.isFinite(measuredSize) && measuredSize > 0) {
    setStyleProperty(element, "--component-font-size", `${measuredSize}px`);
  }
}

function cssUrl(value: string): string {
  return `url('${value.replaceAll("'", "%27")}')`;
}

function timelineImageSource(props: TimelineProperties): string | null {
  const directUrl = timelineTextValue(props.imageDataUrl);
  if (directUrl) return directUrl;
  const assetId = timelineTextValue(props.imageAssetId);
  if (!assetId) return null;
  const resolver = (globalThis as unknown as { artAssetUrl?: (assetId?: string) => string }).artAssetUrl;
  return typeof resolver === "function" ? resolver(assetId) || "" : "";
}

function timelineDomEvent(type: string, detail: TimelineCommandEventDetail): Event {
  if (typeof globalThis.CustomEvent === "function") {
    return new globalThis.CustomEvent(type, { bubbles: true, detail });
  }
  return { type, detail } as unknown as Event;
}

export interface TimelineCommandEventDetail {
  command: TimelineCommand;
  elapsedMs: number;
  eventName: string;
  frame: number;
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
  timelineCanvas?: { width?: number; height?: number; minX?: number; minY?: number } | null;
  timelineApplySelf?: boolean;
  timelineFrameHandler?: (snapshot: TimelineFrameSnapshot) => void;
  timelineCommandHandler?: (detail: TimelineCommandEventDetail) => void;
  timelineCommandDurationHandler?: (command: TimelineCommand, context: { frame: number; elapsedMs: number }) => number;
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
  timelineCanvas: { width: number; height: number; minX: number; minY: number } | null;
  timelineApplySelf: boolean;
  timelineFrameHandler: ((snapshot: TimelineFrameSnapshot) => void) | null;
  timelineCommandHandler: ((detail: TimelineCommandEventDetail) => void) | null;
  timelineCommandDurationHandler: ((command: TimelineCommand, context: { frame: number; elapsedMs: number }) => number) | null;
  timelinePlayer: TimelinePlayer | null;
  token: string;
  activeAnimation = "";
  activeAnimationEndsAt = 0;
  activeAnimationCompletions = new Set<() => void>();

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
    this.timelineApplySelf = options.timelineApplySelf !== false;
    this.timelineFrameHandler = typeof options.timelineFrameHandler === "function" ? options.timelineFrameHandler : null;
    this.timelineCommandHandler = typeof options.timelineCommandHandler === "function" ? options.timelineCommandHandler : null;
    this.timelineCommandDurationHandler = typeof options.timelineCommandDurationHandler === "function" ? options.timelineCommandDurationHandler : null;
    this.timelinePlayer = this.timeline
      ? new TimelinePlayer({
          timeline: this.timeline,
          onFrame: (snapshot) => {
            if (this.timelineApplySelf) this.applyTimelineSnapshot(snapshot);
            this.timelineFrameHandler?.(snapshot);
          },
          onCommand: (command, context) => this.handleTimelineCommand(command, context),
          commandDuration: (command, context) => this.timelineCommandDurationHandler?.(command, context) || 0
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
    if (dataset.artComponentPath) ids.add(dataset.artComponentPath);
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

  reapplyTimelineFrame(): void {
    if (!this.timelinePlayer) return;
    this.timelinePlayer.applyFrame(this.timelinePlayer.currentFrame);
  }

  applyTimelineProperties(props: TimelineProperties): void {
    if (!this.element) return;
    const ownsIntrinsicDimensions = this.element.dataset.artIntrinsicDimensions === "true";
    const width = ownsIntrinsicDimensions ? null : numericTimelineValue(props.width);
    const height = ownsIntrinsicDimensions ? null : numericTimelineValue(props.height);
    const x = numericTimelineValue(props.x);
    const y = numericTimelineValue(props.y);
    const scale = numericTimelineValue(props.scale);
    const rotation = numericTimelineValue(props.rotation);
    const opacity = numericTimelineValue(props.opacity);
    const brightness = numericTimelineValue(props.brightness);
    const fontSize = numericTimelineValue(props.fontSize);
    const borderWidth = numericTimelineValue(props.borderWidth);
    const borderRadius = numericTimelineValue(props.borderRadius);
    const widthChanged = width !== null && setInlineStyle(this.element, "width", this.canvasUnit(width, "width"));
    const heightChanged = height !== null && setInlineStyle(this.element, "height", this.canvasUnit(height, "height"));
    this.applyTimelinePosition(x, y);
    if (scale !== null) setStyleProperty(this.element, "--component-scale", String(scale));
    if (rotation !== null) setStyleProperty(this.element, "--component-rotation", `${rotation}deg`);
    if (opacity !== null) setInlineStyle(this.element, "opacity", String(Math.max(0, Math.min(1, opacity))));
    if (brightness !== null) setStyleProperty(this.element, "--component-brightness", String(Math.max(0, brightness)));
    if (fontSize !== null) setStyleProperty(this.element, "--component-font-size", `${fontSize}px`);
    if (borderWidth !== null) setStyleProperty(this.element, "--component-border-width", `${Math.max(0, borderWidth)}px`);
    if (borderRadius !== null) setStyleProperty(this.element, "--component-border-radius", `${Math.max(0, borderRadius)}px`);
    const fontFamily = timelineTextValue(props.fontFamily);
    const fontColor = timelineTextValue(props.fontColor);
    const fillColor = timelineTextValue(props.fillColor);
    const fillCss = timelineTextValue(props.fillCss);
    const borderColor = timelineTextValue(props.borderColor);
    const imageFit = timelineTextValue(props.imageObjectFit);
    const shapeStyle = timelineShapeStyle(props.shapeStyle);
    if (fontFamily !== null) setStyleProperty(this.element, "--component-font-family", fontFamily);
    if (fontColor !== null) setStyleProperty(this.element, "--component-text-color", fontColor);
    if (fillColor !== null) {
      setStyleProperty(this.element, "--component-fill-color", fillColor);
      // Solid shapes render through --component-fill-css, whose static value is
      // initialized from the component's default fill. A semantic timeline frame
      // that changes only fillColor must update that rendered value too; otherwise
      // the timeline state changes internally while the shape remains its default color.
      if (fillCss === null) setStyleProperty(this.element, "--component-fill-css", fillColor || "transparent");
    }
    if (fillCss !== null) setStyleProperty(this.element, "--component-fill-css", fillCss || fillColor || "transparent");
    if (borderColor !== null) setStyleProperty(this.element, "--component-border-color", borderColor);
    if (imageFit !== null) setStyleProperty(this.element, "--component-image-fit", imageFit);
    if (shapeStyle !== null) setTimelineShapeStyleClass(this.element, shapeStyle);
    if (typeof props.visible === "boolean") {
      setInlineStyle(this.element, "display", props.visible ? "" : "none");
    }
    if (
      hasTimelineProperty(props, "text") ||
      hasTimelineProperty(props, "defaultText") ||
      hasTimelineProperty(props, "fontSize") ||
      hasTimelineProperty(props, "fontFamily") ||
      hasTimelineProperty(props, "fontColor") ||
      hasTimelineProperty(props, "autoFitText") ||
      widthChanged ||
      heightChanged
    ) {
      renderTimelineLabelText(this.element, props, width, height, fontSize);
    }
    if (
      hasTimelineProperty(props, "imageAssetId") ||
      hasTimelineProperty(props, "imageDataUrl") ||
      hasTimelineProperty(props, "imageTint") ||
      hasTimelineProperty(props, "spriteRenderMode")
    ) {
      const changedSource = hasTimelineProperty(props, "imageAssetId") || hasTimelineProperty(props, "imageDataUrl");
      const imageSource = changedSource ? timelineImageSource(props) || "" : this.element.dataset?.spriteSource || "";
      const requestedMode = timelineTextValue(props.spriteRenderMode);
      const tinted = requestedMode
        ? requestedMode === "tinted"
        : this.element.classList?.contains?.("is-sprite-tinted") === true;
      const hasSource = Boolean(imageSource);
      const imageTint = timelineTextValue(props.imageTint);
      this.element.classList?.toggle?.("has-sprite-source", hasSource);
      this.element.classList?.toggle?.("has-image-mask", hasSource);
      this.element.classList?.toggle?.("is-sprite-tinted", hasSource && tinted);
      this.element.classList?.toggle?.("has-tinted-image-mask", hasSource && tinted);
      if (this.element.dataset) this.element.dataset.spriteSource = imageSource;
      if (imageSource) setStyleProperty(this.element, "--component-mask-url", cssUrl(imageSource));
      else removeStyleProperty(this.element, "--component-mask-url");
      if (imageTint) setStyleProperty(this.element, "--component-sprite-tint", imageTint);
      const image = this.element.querySelector?.(".art-runtime-object-image") as HTMLImageElement | null | undefined;
      if (image) {
        image.hidden = !hasSource;
        if (imageSource && !tinted) {
          if (image.getAttribute("src") !== imageSource) image.src = imageSource;
        } else {
          image.removeAttribute("src");
        }
      }
    }
  }

  applyTimelinePosition(x: number | null, y: number | null): void {
    if (!this.element || (x === null && y === null)) return;
    const baseX = Number(this.element.dataset.artBaseX);
    const baseY = Number(this.element.dataset.artBaseY);
    const parent = this.element.parentElement;
    const parentWidth = Number(parent?.clientWidth || 0);
    const parentHeight = Number(parent?.clientHeight || 0);
    const canTranslateX =
      Number.isFinite(baseX) && Boolean(this.timelineCanvas?.width) && Number.isFinite(parentWidth) && parentWidth > 0;
    const canTranslateY =
      Number.isFinite(baseY) && Boolean(this.timelineCanvas?.height) && Number.isFinite(parentHeight) && parentHeight > 0;

    if (x !== null) this.element.dataset.artTimelineX = String(x);
    if (y !== null) this.element.dataset.artTimelineY = String(y);

    if ((x === null || canTranslateX) && (y === null || canTranslateY) && (canTranslateX || canTranslateY)) {
      const timelineX = Number(this.element.dataset.artTimelineX);
      const timelineY = Number(this.element.dataset.artTimelineY);
      const offsetX = canTranslateX && Number.isFinite(timelineX)
        ? ((timelineX - baseX) / (this.timelineCanvas?.width || 1)) * parentWidth
        : 0;
      const offsetY = canTranslateY && Number.isFinite(timelineY)
        ? ((timelineY - baseY) / (this.timelineCanvas?.height || 1)) * parentHeight
        : 0;
      const cleanOffsetX = Number(offsetX.toFixed(3));
      const cleanOffsetY = Number(offsetY.toFixed(3));
      if (canTranslateX) setInlineStyle(this.element, "left", this.canvasUnit(baseX, "width", true));
      if (canTranslateY) setInlineStyle(this.element, "top", this.canvasUnit(baseY, "height", true));
      setInlineStyle(this.element, "translate", "-50% -50%");
      setInlineStyle(this.element, "transform", `translate3d(${cleanOffsetX}px, ${cleanOffsetY}px, 0)`);
      return;
    }

    if (x !== null) setInlineStyle(this.element, "left", this.canvasUnit(x, "width", true));
    if (y !== null) setInlineStyle(this.element, "top", this.canvasUnit(y, "height", true));
  }

  canvasUnit(value: number, axis: "width" | "height", position = false): string {
    const canvasSize = this.timelineCanvas?.[axis] || 0;
    const canvasOrigin = position ? (axis === "width" ? this.timelineCanvas?.minX || 0 : this.timelineCanvas?.minY || 0) : 0;
    return canvasSize > 0 ? `${((value - canvasOrigin) / canvasSize) * 100}%` : `${value}px`;
  }

  handleTimelineCommand(command: TimelineCommand, context: { frame: number; elapsedMs: number } = { frame: command.frame, elapsedMs: 0 }): void {
    const eventName = String(command.event || command.type || "").trim();
    if (!eventName) return;
    const detail: TimelineCommandEventDetail = {
      command,
      elapsedMs: context.elapsedMs,
      eventName,
      frame: context.frame,
      visual: this
    };
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

  isTargetShown(): boolean {
    if (!this.element) return false;
    if (this.element.dataset.visualTargetShown === "true") return true;
    if (this.element.dataset.visualTargetShown === "false") return false;
    return isTargetShownLifecycleState(this.readLifecycleState());
  }

  setTargetShown(isShown: boolean): void {
    if (this.element) this.element.dataset.visualTargetShown = isShown ? "true" : "false";
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

  applyCommandVisibility(isVisible: boolean): void {
    // This command belongs to the active authored timeline. Updating visibility
    // must not replace that timeline's token or discard its completion listeners.
    // It is a state boundary, not a second animation: keep the instant class in
    // place until the next explicit play clears it so generic CSS transitions
    // cannot animate an authored setVisible command after the timeline callback.
    this.addClasses([this.instantClass].filter(Boolean));
    if (isVisible) this.applyShownState();
    else this.applyParkedState();
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

  finishWhenOwnAnimationEnds(animation: string, token: string): void {
    const finish = () => this.finishActiveAnimation(animation, token);
    const inspectAnimations = () => {
      if (!this.tokenMatches(token)) return;
      const animations = this.element?.getAnimations?.({ subtree: false }) || [];
      const active = animations.filter((entry) => entry.playState !== "finished" && entry.playState !== "idle");
      if (!active.length) {
        queueMicrotask(finish);
        return;
      }
      Promise.allSettled(active.map((entry) => entry.finished)).then(finish);
    };
    if (typeof window.requestAnimationFrame === "function") window.requestAnimationFrame(inspectAnimations);
    else queueMicrotask(inspectAnimations);
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
    const cleanAnimation = normalizeLifecycleAnimation(animation);
    if (this.timeline && hasTimelineLabel(this.timeline, cleanAnimation)) {
      return timelinePlaybackDuration(this.timeline, cleanAnimation, {
        commandDuration: (command, context) => this.timelineCommandDurationHandler?.(command, context) || 0
      });
    }
    return this.durations[cleanAnimation] || 0;
  }

  markNewAnimation(): string {
    this.activeAnimation = "";
    this.activeAnimationEndsAt = 0;
    this.activeAnimationCompletions.clear();
    this.token = animationToken();
    if (this.element) this.element.dataset.visualAnimationToken = this.token;
    return this.token;
  }

  beginActiveAnimation(animation: string, duration: number, complete?: () => void): void {
    this.activeAnimation = animation;
    this.activeAnimationEndsAt = Date.now() + Math.max(0, duration);
    this.activeAnimationCompletions.clear();
    if (typeof complete === "function") this.activeAnimationCompletions.add(complete);
  }

  joinActiveAnimation(animation: string, complete?: () => void): number | null {
    if (!this.activeAnimation || this.activeAnimation !== animation) return null;
    if (typeof complete === "function") this.activeAnimationCompletions.add(complete);
    return Math.max(0, this.activeAnimationEndsAt - Date.now());
  }

  updateActiveAnimationDuration(duration: number): void {
    if (!this.activeAnimation) return;
    this.activeAnimationEndsAt = Date.now() + Math.max(0, duration);
  }

  finishActiveAnimation(animation: string, token: string): void {
    if (!this.tokenMatches(token) || this.activeAnimation !== animation) return;
    this.completeLifecycleAnimation(animation, token);
    const completions = Array.from(this.activeAnimationCompletions);
    this.activeAnimation = "";
    this.activeAnimationEndsAt = 0;
    this.activeAnimationCompletions.clear();
    for (const complete of completions) complete();
  }

  cancel(): void {
    this.timelinePlayer?.stop();
    this.markNewAnimation();
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
    this.setTargetShown(false);
    this.addClasses(this.hiddenClasses);
    if (this.exitingClass) this.element?.classList.remove(this.exitingClass);
    this.setLifecycleState("hidden");
    this.setVisibleState(false);
  }

  applyShownState(): void {
    this.setTargetShown(true);
    this.removeClasses([...this.hiddenClasses, this.exitingClass].filter(Boolean));
    this.setLifecycleState("shown");
    this.setVisibleState(true);
  }

  applyAppearingState(): void {
    this.setTargetShown(true);
    this.setVisibleState(true);
    this.setLifecycleState("appearing");
  }

  applyDisappearingState(): void {
    this.setTargetShown(false);
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
    const effectiveAnimation = instantAnimation(normalizeLifecycleAnimation(animation), instant);
    const duration = this.durationForAnimation(effectiveAnimation);
    const lifecycleState = this.readLifecycleState();
    const wasVisible = isShownLifecycleState(lifecycleState);
    const useTimelinePlayback = Boolean(this.timelinePlayer?.hasLabel(effectiveAnimation));
    const requiresAuthoredCallback = typeof options.complete === "function";
    if (requiresAuthoredCallback && !useTimelinePlayback) return 0;
    const joinedDuration = requiresAuthoredCallback ? null : this.joinActiveAnimation(effectiveAnimation, options.complete);
    if (joinedDuration !== null) {
      this.setVisibleState(lifecycleState !== "hidden");
      return joinedDuration;
    }

    if (
      !useTimelinePlayback &&
      (effectiveAnimation === "appear" || effectiveAnimation === "on") &&
      (lifecycleState === "shown" || lifecycleState === "appearing")
    ) {
      if (lifecycleState === "shown") this.applyShownState();
      else this.setVisibleState(true);
      this.completeAfter(0, options.complete);
      return 0;
    }

    if (!useTimelinePlayback && (effectiveAnimation === "update" || effectiveAnimation === "on") && lifecycleState === "appearing") {
      this.setVisibleState(true);
      this.completeAfter(0, options.complete);
      return 0;
    }

    if (!useTimelinePlayback && (effectiveAnimation === "disappear" || effectiveAnimation === "off") && lifecycleState === "hidden") {
      this.applyParkedState();
      this.completeAfter(0, options.complete);
      return 0;
    }

    const token = this.markNewAnimation();
    this.beginActiveAnimation(effectiveAnimation, duration, options.complete);
    this.clearTransientClasses();
    if (useTimelinePlayback) {
      if (this.exitingClass) this.element.classList.remove(this.exitingClass);
      this.timelinePlayer?.gotoAndPlay(effectiveAnimation, {
        instant,
        complete: () => this.finishActiveAnimation(effectiveAnimation, token)
      });
      if (this.activeAnimation === effectiveAnimation) {
        if (effectiveAnimation === "appear") this.applyAppearingState();
        else if (effectiveAnimation === "disappear") this.applyDisappearingState();
      }
      return duration;
    }

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
      this.updateActiveAnimationDuration(customDuration);
      if (instant || customDuration <= 0) this.finishActiveAnimation(effectiveAnimation, token);
      else this.finishWhenOwnAnimationEnds(effectiveAnimation, token);
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
    } else if (effectiveAnimation === "disappear") {
      this.removeClasses([...this.hiddenClasses, ...this.displayHiddenClasses]);
      void this.element.offsetWidth;
      this.applyDisappearingState();
      if (this.exitingClass) {
        this.element.classList.add(this.exitingClass);
      } else {
        this.addClasses(this.motionHiddenClasses);
      }
    } else if (effectiveAnimation === "update") {
      this.applyShownState();
      void this.element.offsetWidth;
      if (!instant) this.addClasses([this.updateClass].filter(Boolean));
    }

    if (instant || duration <= 0) this.finishActiveAnimation(effectiveAnimation, token);
    else this.finishWhenOwnAnimationEnds(effectiveAnimation, token);
    return duration;
  }

  stopAt(animation: string, options: PlayOptions = {}): number {
    if (!this.element) return 0;
    const cleanAnimation = normalizeLifecycleAnimation(animation);
    if (!cleanAnimation) return 0;
    if (this.timelinePlayer?.hasLabel(cleanAnimation)) {
      return this.timelinePlayer.gotoAndStop(cleanAnimation, {
        instant: true,
        complete: options.complete
      });
    }
    return this.play(cleanAnimation, { ...options, instant: true });
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
