// Typed port of the legacy client/stage/art-object-visuals.js IIFE — the art
// component tree renderer (ArtObjectView + ArtObjectTreeRenderer). Installs
// window.PartyGameArtObject for the legacy stage runtime. PartyGameArtComponentSchema
// is read lazily (it is a legacy script loaded via bootLegacySurface, after this
// module's import-time install).

import { normalizeGameTextFontFamily } from "../textFonts";
import type { ArtComposition } from "../types/game-data";
import { artCompositionContentBoundsWithResolver } from "../tools/art/artCompositionBounds";
import { distributedContainerItemPositions } from "./distributedContainerLayout";
import { effectiveArtComponentVisibilityTimeline, effectiveVisibilityTimeline } from "./effectiveTimeline";
import type { TimelineCommandEventDetail } from "./visualObject";
import { TimelinePlayer, type TimelineFrameSnapshot } from "./timelinePlayer";
import { hasTimelineLabel, timelinePlaybackDuration, type TimelineCommand, type TimelineDocument } from "../../shared/timeline-model";

type Dict = Record<string, unknown>;
type Component = Dict;
type CanvasSize = { width?: number; height?: number; minX?: number; minY?: number } | undefined;

interface ArtComponentSchema {
  normalizeComponentKind: (kind?: unknown) => string;
  componentLabel: (component: Component) => string;
  normalizeFillCss: (css?: unknown) => string;
  normalizeImageObjectFit: (fit?: unknown) => string;
  normalizeShapeStyle: (style: unknown, kind: string) => string;
  componentSpriteDataUrl: (component: Component) => string;
  normalizeSpriteRenderMode: (value?: unknown) => string;
  normalizeContainerDistribution?: (value?: unknown) => string;
  transformOriginCss?: (value?: unknown) => string;
}

declare global {
  interface Window {
    PartyGameArtObject?: typeof PartyGameArtObject;
    artComposition?: (id: string) => Dict | null;
    artAssetUrl?: (assetId?: string) => string;
  }
}

const w = () => globalThis as typeof globalThis & Window;
const schema = (): ArtComponentSchema => w().PartyGameArtComponentSchema as unknown as ArtComponentSchema;

const RUNTIME_CLASS = "art-runtime-object";
const ART_TEXT_PADDING = 4;
const HIDDEN_CLASS = "art-runtime-object-hidden";
const EXITING_CLASS = "art-runtime-object-exiting";
const UPDATE_CLASS = "art-runtime-object-update";
const INSTANT_CLASS = "art-runtime-object-instant";
let artTreeInstanceCounter = 1;

function num(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function applyComponentLayout(element: HTMLElement | null, component: Component | null, canvas: CanvasSize, options: Dict = {}): void {
  if (!element || !component) return;
  const s = schema();
  const kind = s.normalizeComponentKind(component.kind);
  const canvasWidth = Math.max(1, num(canvas?.width, 1));
  const canvasHeight = Math.max(1, num(canvas?.height, 1));
  const canvasMinX = num(canvas?.minX, 0);
  const canvasMinY = num(canvas?.minY, 0);
  const labelText = Object.prototype.hasOwnProperty.call(options, "labelText")
    ? String(options.labelText || "")
    : s.componentLabel(component);
  element.style.left = `${((num(component.x) - canvasMinX) / canvasWidth) * 100}%`;
  element.style.top = `${((num(component.y) - canvasMinY) / canvasHeight) * 100}%`;
  element.style.width = `${(num(component.width, 1) / canvasWidth) * 100}%`;
  element.style.height = `${(num(component.height, 1) / canvasHeight) * 100}%`;
  element.style.setProperty("--component-scale", String(num(component.scale, 1)));
  element.style.setProperty("--component-rotation", `${num(component.rotation)}deg`);
  element.style.transformOrigin = s.transformOriginCss?.(component.transformOrigin) || "50% 50%";
  const fontScale = Number.isFinite(Number(options.fontScale)) && Number(options.fontScale) > 0 ? Number(options.fontScale) : 1;
  const textLayout = isTextBearingComponentKind(kind) ? componentTextLayout(component, labelText) : null;
  (element as unknown as Dict).__partyGameTextLayout = textLayout;
  element.style.setProperty("--component-font-size", `${(num(textLayout?.fontSize, num(component.fontSize, 16))) * fontScale}px`);
  element.style.setProperty("--component-font-family", normalizeGameTextFontFamily(component.fontFamily));
  element.style.setProperty("--component-text-color", (component.fontColor as string) || "#17131f");
  element.style.setProperty("--component-fill-color", (component.fillColor as string) || "transparent");
  element.style.setProperty("--component-fill-css", s.normalizeFillCss(component.fillCss) || (component.fillColor as string) || "transparent");
  element.style.setProperty("--component-border-color", (component.borderColor as string) || "transparent");
  element.style.setProperty("--component-border-width", `${num(component.borderWidth)}px`);
  element.style.setProperty("--component-border-radius", `${num(component.borderRadius)}px`);
  element.style.setProperty("--component-image-fit", s.normalizeImageObjectFit(component.imageObjectFit));
}

function componentFontSize(component: Component, labelText: string = schema().componentLabel(component)): number {
  return componentTextLayout(component, labelText).fontSize as number;
}

function componentTextLayout(component: Component, labelText: string = schema().componentLabel(component)): Dict {
  const baseSize = num(component?.fontSize, 16);
  const measuredLayout = w().PartyGameTextFit?.measureGameText?.({ text: labelText, element: component, fallbackSize: baseSize, options: { padding: ART_TEXT_PADDING } });
  if (measuredLayout) return measuredLayout as Dict;
  const lineHeight = w().PartyGameTextFit?.constants?.lineHeight || 1.15;
  const fontSize = Math.max(8, baseSize);
  return {
    fontSize,
    lineHeight,
    lineBoxHeight: fontSize * lineHeight,
    inkHeight: fontSize * 0.9,
    lineGap: Math.max(fontSize * (lineHeight - 1), 0),
    lines: String(labelText ?? "").split("\n"),
    baselineShift: 0,
    boxWidth: Math.max(1, num(component?.width, 1)),
    boxHeight: Math.max(1, num(component?.height, 1))
  };
}

function componentImageSource(component: Component): string {
  return schema().componentSpriteDataUrl(component) || w().artAssetUrl?.(component?.imageAssetId as string) || "";
}

function syncComponentElement(options: Dict = {}): void {
  const element = options.element as HTMLElement | undefined;
  const component = (options.component as Component) || {};
  if (!element) return;
  const s = schema();
  const kind = s.normalizeComponentKind(component.kind);
  const baseClass = (options.baseClass as string) || RUNTIME_CLASS;
  const labelText = Object.prototype.hasOwnProperty.call(options, "labelText")
    ? String(options.labelText || "")
    : s.componentLabel(component);
  const imageSource = Object.prototype.hasOwnProperty.call(options, "imageSource")
    ? String(options.imageSource || "")
    : componentImageSource(component);
  const spriteRenderMode = s.normalizeSpriteRenderMode(component.spriteRenderMode);
  const tintedSprite = kind === "sprite" && spriteRenderMode === "tinted" && Boolean(imageSource);
  element.className = `${baseClass} is-${kind}${kind === "sprite" ? "" : ` is-style-${s.normalizeShapeStyle(component.shapeStyle, kind)}`}`;
  element.classList.toggle("is-art-root-container", Boolean(options.isRootContainer));
  element.classList.toggle("is-selected", Boolean(options.isSelected));
  element.classList.toggle("has-sprite-source", Boolean(imageSource));
  element.classList.toggle("is-sprite-tinted", tintedSprite);
  element.classList.toggle("has-image-mask", Boolean(imageSource));
  element.classList.toggle("has-tinted-image-mask", tintedSprite);
  element.dataset.artComponentId = (component.id as string) || "";
  element.dataset.componentId = (component.id as string) || "";
  element.dataset.spriteSource = imageSource;
  element.style.zIndex = String(componentLayerIndex(options.layerIndex, options.layerTotal));
  if (imageSource) element.style.setProperty("--component-mask-url", `url('${String(imageSource).replaceAll("'", "%27")}')`);
  else element.style.removeProperty("--component-mask-url");
  element.style.setProperty("--component-sprite-tint", String(component.imageTint || "currentColor"));
  applyComponentLayout(element, component, options.canvas as CanvasSize, { labelText });

  const image = options.imageElement as HTMLImageElement | undefined;
  if (image) {
    image.hidden = !imageSource;
    if (imageSource && !tintedSprite) {
      if (image.getAttribute("src") !== imageSource) image.src = imageSource;
    } else {
      image.removeAttribute("src");
    }
  }
  const label = options.labelElement as HTMLElement | undefined;
  if (label) {
    const hasLabelText = isTextBearingComponentKind(kind) && Boolean(String(labelText || "").trim());
    label.hidden = Boolean(imageSource) || !hasLabelText;
    if (hasLabelText) setLabelText(label, component, labelText);
    else label.replaceChildren();
  }
}

function setLabelText(label: HTMLElement, component: Component, labelText: string): void {
  const textFit = w().PartyGameTextFit;
  if (textFit?.renderLayoutTextField) {
    const textElement = renderedArtTextElement(label, component);
    const baseSize = num(textElement.fontSize, 16);
    const layout = textFit.renderLayoutTextField(label, textElement, {
      text: labelText,
      defaults: { defaultText: schema().componentLabel(component), fontSize: baseSize, fontColor: (component?.fontColor as string) || "#17131f" },
      fallbackSize: baseSize,
      renderOptions: { padding: ART_TEXT_PADDING }
    }) as Dict | null;
    label.style.setProperty("--component-font-size", `${num(layout?.fontSize, baseSize)}px`);
  } else {
    label.textContent = labelText;
  }
}

function renderComponentText(target: HTMLElement | null, component: Component | null, labelText?: string): Dict | null {
  if (!target || !component) return null;
  const resolvedLabel = labelText === undefined ? schema().componentLabel(component) : labelText;
  const text = String(resolvedLabel ?? "");
  const textElement = renderedArtTextElement(target, component);
  const baseSize = num(textElement.fontSize, 16);
  const textFit = w().PartyGameTextFit;
  const layout = (
    textFit?.renderLayoutTextField
      ? textFit.renderLayoutTextField(target, textElement, {
          text,
          defaults: { defaultText: schema().componentLabel(component), fontSize: baseSize, fontColor: (component?.fontColor as string) || "#17131f" },
          fallbackSize: baseSize,
          renderOptions: { padding: ART_TEXT_PADDING }
        })
      : componentTextLayout(component, text)
  ) as Dict;
  if (!textFit?.renderLayoutTextField) target.textContent = text;
  target.style.setProperty("--component-font-size", `${layout.fontSize}px`);
  return layout;
}

function renderedArtTextElement(target: HTMLElement, component: Component = {}): Dict {
  const width = renderedBoxSize(target, "width", component.width);
  const height = renderedBoxSize(target, "height", component.height);
  return { ...component, width, height, autoFitText: component.autoFitText !== false };
}

function renderedBoxSize(target: HTMLElement | null, dimension: "width" | "height", fallback: unknown): number {
  const clientValue = dimension === "width" ? target?.clientWidth : target?.clientHeight;
  if (Number(clientValue) > 0) return Number(clientValue);
  const offsetValue = dimension === "width" ? target?.offsetWidth : target?.offsetHeight;
  if (Number(offsetValue) > 0) return Number(offsetValue);
  const rect = target?.getBoundingClientRect?.();
  const rectValue = rect ? Number(rect[dimension]) : 0;
  if (rectValue > 0) return rectValue;
  return Math.max(1, num(fallback, 1));
}

function componentLayerIndex(index: unknown, siblingCount: unknown): number {
  return Math.max(1, num(siblingCount, 1) - num(index));
}

function isTextBearingComponentKind(kind: string): boolean {
  return kind === "text" || kind === "badge";
}

function referencedCompositionFor(component: Component | null, resolver: unknown, referencePath = new Set<string>()): Dict | null {
  if (schema().normalizeComponentKind(component?.kind) !== "reference") return null;
  const compositionId = String(component?.artCompositionId || "");
  if (!compositionId || referencePath.has(compositionId)) return null;
  return typeof resolver === "function" ? (resolver as (id: string) => Dict | null)(compositionId) : null;
}

function artComponentViewKey(component: Component, index: number, counts: Map<string, number>): string {
  const rawId = String(component?.id || "").trim();
  const baseKey = rawId || `component-${num(index)}`;
  const count = Number(counts?.get(baseKey) || 0);
  counts?.set(baseKey, count + 1);
  return count > 0 ? `${baseKey}::${count}` : baseKey;
}

function isArtRootContainer(component: Component | null, parentComponents: unknown): boolean {
  if (!component || schema().normalizeComponentKind(component.kind) !== "container") return false;
  const siblings = Array.isArray(parentComponents) ? parentComponents : [];
  if (siblings.length !== 1 || siblings[0] !== component) return false;
  return String(component.name || "").trim().toLowerCase() === "art root" || String(component.id || "").startsWith("root-");
}

function cloneArtComponentTree(component: Component): Component {
  return { ...component, children: ((component.children as Component[]) || []).map(cloneArtComponentTree) };
}

function distributedContainerChildren(component: Component, children: Component[] = []): Component[] {
  if (schema().normalizeComponentKind(component?.kind) !== "container") return children || [];
  const distribution = schema().normalizeContainerDistribution?.(component.childDistribution) || "none";
  if (distribution === "none" || !Array.isArray(children) || children.length === 0) return children || [];
  const width = Math.max(1, num(component.width, 1));
  const height = Math.max(1, num(component.height, 1));
  const positions = distributedContainerItemPositions({ width, height }, children, distribution === "vertical" ? "vertical" : "horizontal");
  return children.map((child, index) => {
    const clone = cloneArtComponentTree(child);
    clone.x = positions[index]?.x ?? num(clone.x);
    clone.y = positions[index]?.y ?? num(clone.y);
    return clone;
  });
}

type TimelineComponentCommandTarget = {
  play?: (animation: string, options?: Dict) => number;
  stopAt?: (animation: string, options?: Dict) => number;
  durationForAnimation?: (animation: string) => number;
  setVisibleTree?: (isVisible: boolean) => void;
};

type TimelineComponentCommandHost = {
  viewForComponentId: (componentId: string) => TimelineComponentCommandTarget | null;
  setVisibleTree?: (isVisible: boolean) => void;
};

function timelineComponentCommandPayload(command: TimelineCommand | { type?: unknown; target?: unknown; event?: unknown }): { targetId: string; animation: string; stop: boolean } | null {
  const commandType = String(command?.type || "");
  if (commandType !== "emit" && commandType !== "playComponent" && commandType !== "stopComponent") return null;
  const targetId = String(command.target || "").trim();
  const animation = String(command.event || "").trim();
  if (!targetId || !animation) return null;
  return { targetId, animation, stop: commandType === "stopComponent" };
}

function playTimelineComponentCommand(host: TimelineComponentCommandHost, command: TimelineCommand | { type?: unknown; target?: unknown; event?: unknown }, options: Dict = {}): number {
  if (String(command?.type || "") === "setVisible") {
    const isVisible = String(command.target || "").trim().toLowerCase() !== "false";
    host.setVisibleTree?.(isVisible);
    return 0;
  }
  const payload = timelineComponentCommandPayload(command);
  if (!payload) return 0;
  const target = host.viewForComponentId(payload.targetId);
  if (!target) return 0;
  return payload.stop ? target.stopAt?.(payload.animation, options) || 0 : target.play?.(payload.animation, options) || 0;
}

function timelineComponentCommandDuration(host: TimelineComponentCommandHost, command: TimelineCommand | { type?: unknown; target?: unknown; event?: unknown }): number {
  const payload = timelineComponentCommandPayload(command);
  if (!payload || payload.stop) return 0;
  return host.viewForComponentId(payload.targetId)?.durationForAnimation?.(payload.animation) || 0;
}

class ArtObjectView {
  document: Document;
  visualAnimation: unknown;
  gameObjectApi: unknown;
  instanceId: string;
  getComposition: (id: string) => Dict | null;
  referencePath: Set<string>;
  componentPath: string[];
  component: Component | null = null;
  canvas: CanvasSize | null = null;
  children = new Map<string, ArtObjectView>();
  element: HTMLElement;
  image: HTMLImageElement;
  label: HTMLElement;
  gameObject: Dict | null = null;
  visual: Dict | null = null;

  constructor(options: Dict = {}) {
    this.document = (options.document as Document) || globalThis.document;
    this.visualAnimation = options.visualAnimation || w().PartyGameVisualObject;
    this.gameObjectApi = options.gameObjectApi || w().PartyGameGameObject || w().PartyGameStageGameObject;
    this.instanceId = String(options.instanceId || "");
    this.getComposition =
      typeof options.getComposition === "function"
        ? (options.getComposition as (id: string) => Dict | null)
        : (id: string) => w().artComposition?.(id) || null;
    this.referencePath = options.referencePath instanceof Set ? (options.referencePath as Set<string>) : new Set();
    this.componentPath = Array.isArray(options.componentPath) ? (options.componentPath as string[]) : [];
    this.element = this.document.createElement("div");
    this.image = this.document.createElement("img");
    this.image.className = "art-runtime-object-image";
    this.image.alt = "";
    this.image.draggable = false;
    this.label = this.document.createElement("span");
    this.label.className = "art-runtime-object-label";
    this.element.appendChild(this.image);
    this.element.appendChild(this.label);
    if (options.component) this.update(options.component as Component, options.canvas as CanvasSize, options.layer as Dict);
  }

  gameObjectId(): string {
    const componentId = (this.component?.id as string) || this.element.dataset.artComponentId || "";
    const componentPath = this.componentPathId() || componentId;
    return `art-component:${this.instanceId || "default"}:${componentPath}`;
  }

  componentPathId(): string {
    return (this.componentPath || []).filter(Boolean).join("/");
  }

  componentTargetIds(): Set<string> {
    const ids = new Set<string>();
    const componentId = String(this.component?.id || "").trim();
    const componentName = String(this.component?.name || "").trim();
    const instanceLabel = String(this.component?.instanceLabel || "").trim();
    const pathId = this.componentPathId();
    if (componentId) ids.add(componentId);
    if (componentName) ids.add(componentName);
    if (instanceLabel) ids.add(instanceLabel);
    if (pathId) ids.add(pathId);
    return ids;
  }

  componentTimeline(): TimelineDocument {
    const referencedComposition = referencedCompositionFor(this.component, this.getComposition, this.referencePath);
    if (referencedComposition?.timeline) {
      return effectiveVisibilityTimeline((referencedComposition.timeline || null) as TimelineDocument | null);
    }
    return effectiveArtComponentVisibilityTimeline(
      (this.component?.timeline || null) as TimelineDocument | null,
      String(this.component?.id || "").trim()
    );
  }

  createVisual(): Dict | null {
    const id = this.gameObjectId();
    const timelineApplySelf = !referencedCompositionFor(this.component, this.getComposition, this.referencePath);
    const bridge = w().PartyGameVisualBridge?.createVisualForTarget?.({
      gameObjectApi: this.gameObjectApi,
      visualAnimation: this.visualAnimation,
      target: this.element,
      gameObject: this.gameObject,
      legacyVisual: this.visual,
      gameObjectOptions: {
        id,
        visibilityKey: id,
        isArt: true,
        visualOptions: {
          hiddenClasses: [HIDDEN_CLASS],
          motionHiddenClasses: [HIDDEN_CLASS],
          exitingClass: EXITING_CLASS,
          updateClass: UPDATE_CLASS,
          instantClass: INSTANT_CLASS,
          layoutHiddenClasses: [HIDDEN_CLASS, EXITING_CLASS],
          timeline: this.componentTimeline(),
          timelineApplySelf,
          timelineCanvas: this.canvas || null,
          timelineFrameHandler: (snapshot: TimelineFrameSnapshot) => this.applyTimelineSnapshotToDescendants(snapshot),
          timelineCommandHandler: (detail: TimelineCommandEventDetail) => this.handleTimelineCommand(detail),
          timelineCommandDurationHandler: (command: TimelineCommand) => this.timelineCommandDuration(command)
        }
      },
      legacyVisualOptions: {
        hiddenClasses: [HIDDEN_CLASS],
        motionHiddenClasses: [HIDDEN_CLASS],
        exitingClass: EXITING_CLASS,
        updateClass: UPDATE_CLASS,
        instantClass: INSTANT_CLASS,
        timeline: this.componentTimeline(),
        timelineApplySelf,
        timelineCanvas: this.canvas || null,
        timelineFrameHandler: (snapshot: TimelineFrameSnapshot) => this.applyTimelineSnapshotToDescendants(snapshot),
        timelineCommandHandler: (detail: TimelineCommandEventDetail) => this.handleTimelineCommand(detail),
        timelineCommandDurationHandler: (command: TimelineCommand) => this.timelineCommandDuration(command)
      }
    }) as Dict | undefined;
    this.gameObject = (bridge?.gameObject as Dict) || this.gameObject;
    this.visual = (bridge?.visual as Dict) || (bridge?.legacyVisual as Dict) || this.visual;
    return this.visual;
  }

  isVisible(): boolean {
    return (this.createVisual() as { isVisible?: () => boolean } | null)?.isVisible?.() === true;
  }

  setVisibleTree(isVisible: boolean): void {
    const visual = this.createVisual() as { setVisibleState?: (nextVisible: boolean) => void } | null;
    visual?.setVisibleState?.(isVisible === true);
    if (!visual?.setVisibleState) {
      this.element.dataset.visualVisible = isVisible ? "true" : "false";
      this.element.classList.toggle(HIDDEN_CLASS, isVisible !== true);
    }
    for (const child of this.children.values()) child.setVisibleTree(isVisible);
  }

  viewForComponentId(componentId: string): ArtObjectView | null {
    if (this.componentTargetIds().has(componentId)) return this;
    return this.viewForDescendantComponentId(componentId);
  }

  viewForDescendantComponentId(componentId: string): ArtObjectView | null {
    for (const child of this.children.values()) {
      const match = child.viewForComponentId(componentId);
      if (match) return match;
    }
    return null;
  }

  applyTimelineSnapshotToDescendants(snapshot: TimelineFrameSnapshot): void {
    for (const targetId of Object.keys(snapshot.targets || {})) {
      const view = this.viewForDescendantComponentId(targetId);
      if (!view) continue;
      const visual = view.createVisual() as { applyTimelineSnapshot?: (nextSnapshot: TimelineFrameSnapshot) => void } | null;
      visual?.applyTimelineSnapshot?.(snapshot);
    }
  }

  timelineCommandHost(): TimelineComponentCommandHost {
    if (String(this.component?.kind || "").trim().toLowerCase() !== "reference") return this;
    if (!referencedCompositionFor(this.component, this.getComposition, this.referencePath)) return this;
    return {
      viewForComponentId: (componentId) => this.viewForDescendantComponentId(componentId),
      setVisibleTree: (isVisible) => this.setVisibleTree(isVisible)
    };
  }

  handleTimelineCommand(detail: TimelineCommandEventDetail): number {
    return playTimelineComponentCommand(this.timelineCommandHost(), detail.command || {});
  }

  timelineCommandDuration(command: TimelineCommand): number {
    return timelineComponentCommandDuration(this.timelineCommandHost(), command);
  }

  durationForAnimation(animation: string): number {
    const cleanAnimation = String(animation || "").trim();
    if (!cleanAnimation) return 0;
    const timeline = this.componentTimeline();
    if (timeline && hasTimelineLabel(timeline, cleanAnimation)) {
      return timelinePlaybackDuration(timeline, cleanAnimation, {
        commandDuration: (command) => this.timelineCommandDuration(command)
      });
    }
    const visual = this.createVisual() as { durationForAnimation?: (a: string) => number } | null;
    return Number(visual?.durationForAnimation?.(cleanAnimation) || 0);
  }

  update(component: Component, canvas: CanvasSize, layer: Dict = {}): void {
    this.component = component || {};
    this.canvas = canvas || null;
    const wasVisible = this.visual ? this.isVisible() : true;
    if (!wasVisible) this.element.classList.add(HIDDEN_CLASS);
    syncComponentElement({
      element: this.element,
      imageElement: this.image,
      labelElement: this.label,
      component: this.component,
      canvas,
      layerIndex: layer.index,
      layerTotal: layer.total,
      isRootContainer: layer.isRootContainer
    });
    if (!wasVisible) this.element.classList.add(HIDDEN_CLASS);
    this.element.dataset.artComponentPath = this.componentPathId();
    if (this.visual || this.gameObject) this.createVisual();
    this.renderChildren((this.component.children as Component[]) || []);
  }

  renderChildren(children: Component[]): void {
    const referencedId =
      schema().normalizeComponentKind(this.component?.kind) === "reference" ? String(this.component?.artCompositionId || "") : "";
    const referencedComposition = referencedCompositionFor(this.component, this.getComposition, this.referencePath);
    const referencedBounds = referencedComposition
      ? artCompositionContentBoundsWithResolver(
          referencedComposition as unknown as ArtComposition,
          (id) => this.getComposition(id) as unknown as ArtComposition | null
        )
      : null;
    const childCanvas = referencedBounds
      ? { width: referencedBounds.width, height: referencedBounds.height, minX: referencedBounds.minX, minY: referencedBounds.minY }
      : { width: num(this.component?.width, 1), height: num(this.component?.height, 1) };
    const renderList =
      (referencedComposition?.components as Component[]) || distributedContainerChildren(this.component || {}, children || []);
    const childReferencePath = referencedComposition ? new Set([...this.referencePath, referencedId]) : this.referencePath;
    const counts = new Map<string, number>();
    const keyedChildren = renderList.map((child, index) => ({ child, index, key: artComponentViewKey(child, index, counts) }));
    const desiredKeys = new Set(keyedChildren.map((child) => child.key));
    for (const { child, index, key } of keyedChildren) {
      let view = this.children.get(key);
      if (!view) {
        view = new ArtObjectView({
          document: this.document,
          visualAnimation: this.visualAnimation,
          gameObjectApi: this.gameObjectApi,
          getComposition: this.getComposition,
          referencePath: childReferencePath,
          componentPath: [...this.componentPath, String(child.id || "").trim()].filter(Boolean),
          instanceId: `${this.instanceId}/${key}`,
          component: child,
          canvas: childCanvas,
          layer: { index, total: renderList.length }
        });
        this.children.set(key, view);
        view.play((child.defaultAnimationState as string) || "on", { instant: true });
      } else {
        view.update(child, childCanvas, { index, total: renderList.length, isRootContainer: false });
      }
      this.element.appendChild(view.element);
    }
    for (const [childKey, view] of Array.from(this.children.entries())) {
      if (desiredKeys.has(childKey)) continue;
      this.children.delete(childKey);
      view.remove();
    }
  }

  play(animation: string, options: Dict = {}): number {
    return (this.createVisual() as { play?: (a: string, o: Dict) => number } | null)?.play?.(animation, options) || 0;
  }

  stopAt(animation: string, options: Dict = {}): number {
    const visual = this.createVisual() as { stopAt?: (a: string, o: Dict) => number; play?: (a: string, o: Dict) => number } | null;
    return visual?.stopAt?.(animation, options) || visual?.play?.(animation, { ...options, instant: true }) || 0;
  }

  playTree(animation: string, options: Dict = {}): number {
    let duration = this.play(animation, options);
    for (const child of this.children.values()) duration = Math.max(duration, child.playTree(animation, options));
    return duration;
  }

  stopAtTree(animation: string, options: Dict = {}): number {
    let duration = this.stopAt(animation, options);
    for (const child of this.children.values()) duration = Math.max(duration, child.stopAtTree(animation, options));
    return duration;
  }

  park(options: Dict = {}): number {
    return this.play("park", options);
  }
  on(options: Dict = {}): number {
    return this.play("on", options);
  }
  off(options: Dict = {}): number {
    return this.play("off", options);
  }
  appear(options: Dict = {}): number {
    return this.play("appear", options);
  }
  disappear(options: Dict = {}): number {
    return this.play("disappear", options);
  }
  updateVisual(options: Dict = {}): number {
    return this.play("update", options);
  }

  remove(options: Dict = {}): number {
    const duration = this.disappear(options);
    const element = this.element;
    const token = element.dataset.visualAnimationToken || "";
    const removeElement = () => {
      if (element.parentElement && element.dataset.visualAnimationToken === token) element.remove();
    };
    if (duration > 0) setTimeout(removeElement, duration);
    else removeElement();
    return duration;
  }
}

class ArtObjectTreeRenderer {
  host?: HTMLElement;
  document: Document;
  visualAnimation: unknown;
  gameObjectApi: unknown;
  instanceId: string;
  getComposition: (id: string) => Dict | null;
  views = new Map<string, ArtObjectView>();
  rootTimelinePlayer: TimelinePlayer | null = null;

  constructor(options: Dict = {}) {
    this.host = options.host as HTMLElement | undefined;
    this.document = (options.document as Document) || globalThis.document;
    this.visualAnimation = options.visualAnimation || w().PartyGameVisualObject;
    this.gameObjectApi = options.gameObjectApi || w().PartyGameGameObject || w().PartyGameStageGameObject;
    this.instanceId = String(options.instanceId || `art-tree:${artTreeInstanceCounter++}`);
    this.getComposition =
      typeof options.getComposition === "function"
        ? (options.getComposition as (id: string) => Dict | null)
        : (id: string) => w().artComposition?.(id) || null;
  }

  playTimelineCommand(command: { type?: unknown; target?: unknown; event?: unknown }): number {
    return playTimelineComponentCommand(this, command);
  }

  applyTimelineSnapshotToViews(snapshot: TimelineFrameSnapshot): void {
    for (const targetId of Object.keys(snapshot.targets || {})) {
      const view = this.viewForComponentId(targetId);
      const visual = view?.createVisual() as { applyTimelineSnapshot?: (nextSnapshot: TimelineFrameSnapshot) => void } | null | undefined;
      visual?.applyTimelineSnapshot?.(snapshot);
    }
  }

  updateRootTimeline(timeline: TimelineDocument | null | undefined): void {
    if (!timeline) {
      this.rootTimelinePlayer?.stop();
      this.rootTimelinePlayer = null;
      return;
    }
    if (!this.rootTimelinePlayer) {
      this.rootTimelinePlayer = new TimelinePlayer({
        timeline,
        onFrame: (snapshot) => this.applyTimelineSnapshotToViews(snapshot),
        onCommand: (command) => this.playTimelineCommand(command),
        commandDuration: (command) => this.timelineCommandDuration(command)
      });
      return;
    }
    this.rootTimelinePlayer.updateTimeline(timeline);
  }

  syncRootTimelineFrame(): void {
    if (!this.rootTimelinePlayer) return;
    this.rootTimelinePlayer.applyFrame(this.rootTimelinePlayer.currentFrame);
  }

  render(components: Component[] = [], canvas?: CanvasSize, options: Dict = {}): void {
    if (!this.host) return;
    this.updateRootTimeline((options.timeline || null) as TimelineDocument | null);
    const defaultAnimation = (options.defaultAnimation as string) || "on";
    const respectDefaultAnimationState = options.respectDefaultAnimationState !== false;
    const counts = new Map<string, number>();
    const keyedComponents = (components || []).map((component, index) => ({
      component,
      index,
      key: artComponentViewKey(component, index, counts)
    }));
    const desiredKeys = new Set(keyedComponents.map((component) => component.key));
    for (const { component, index, key } of keyedComponents) {
      let view = this.views.get(key);
      if (!view) {
        view = new ArtObjectView({
          document: this.document,
          visualAnimation: this.visualAnimation,
          gameObjectApi: this.gameObjectApi,
          getComposition: this.getComposition,
          componentPath: [String(component.id || "").trim()].filter(Boolean),
          instanceId: `${this.instanceId}/${key}`,
          component,
          canvas,
          layer: { index, total: (components || []).length, isRootContainer: isArtRootContainer(component, components) }
        });
        this.views.set(key, view);
        view.play(respectDefaultAnimationState ? (component.defaultAnimationState as string) || defaultAnimation : defaultAnimation, {
          instant: options.instant !== false
        });
      } else {
        view.update(component, canvas, { index, total: (components || []).length, isRootContainer: isArtRootContainer(component, components) });
      }
      this.host.appendChild(view.element);
    }
    for (const [componentKey, view] of Array.from(this.views.entries())) {
      if (desiredKeys.has(componentKey)) continue;
      this.views.delete(componentKey);
      view.remove({ instant: options.instant === true });
    }
    this.syncRootTimelineFrame();
  }

  playAll(animation: string, options: Dict = {}): number {
    const cleanAnimation = String(animation || "").trim();
    if (cleanAnimation && this.rootTimelinePlayer?.hasLabel(cleanAnimation)) {
      return this.rootTimelinePlayer.gotoAndPlay(cleanAnimation, {
        instant: options.instant === true,
        complete: typeof options.complete === "function" ? (options.complete as () => void) : undefined
      });
    }
    let duration = 0;
    for (const view of this.views.values()) duration = Math.max(duration, view.play(animation, options));
    return duration;
  }

  timelineCommandDuration(command: { type?: unknown; target?: unknown; event?: unknown }): number {
    return timelineComponentCommandDuration(this, command);
  }

  stopAtAll(animation: string, options: Dict = {}): number {
    const cleanAnimation = String(animation || "").trim();
    if (cleanAnimation && this.rootTimelinePlayer?.hasLabel(cleanAnimation)) {
      return this.rootTimelinePlayer.gotoAndStop(cleanAnimation, {
        instant: true,
        complete: typeof options.complete === "function" ? (options.complete as () => void) : undefined
      });
    }
    let duration = 0;
    for (const view of this.views.values()) duration = Math.max(duration, view.stopAt(animation, options));
    return duration;
  }

  viewForComponentId(componentId: string): ArtObjectView | null {
    for (const view of this.views.values()) {
      const match = view.viewForComponentId(componentId);
      if (match) return match;
    }
    return null;
  }

  isComponentVisible(componentId: string): boolean {
    return this.viewForComponentId(componentId)?.isVisible() === true;
  }

  setVisibleTree(isVisible: boolean): void {
    for (const view of this.views.values()) view.setVisibleTree(isVisible);
  }

  playComponent(componentId: string, animation: string, options: Dict = {}): number {
    return this.viewForComponentId(componentId)?.play(animation, options) || 0;
  }

  stopAtComponent(componentId: string, animation: string, options: Dict = {}): number {
    return this.viewForComponentId(componentId)?.stopAt(animation, options) || 0;
  }

  playComponentTree(componentId: string, animation: string, options: Dict = {}): number {
    return this.viewForComponentId(componentId)?.playTree(animation, options) || 0;
  }

  stopAtComponentTree(componentId: string, animation: string, options: Dict = {}): number {
    return this.viewForComponentId(componentId)?.stopAtTree(animation, options) || 0;
  }

  clear(options: Dict = {}): number {
    let duration = 0;
    for (const [, view] of Array.from(this.views.entries())) duration = Math.max(duration, view.remove(options));
    this.views.clear();
    return duration;
  }
}

export const PartyGameArtObject = {
  ArtObjectTreeRenderer,
  ArtObjectView,
  applyComponentLayout,
  componentFontSize,
  componentTextLayout,
  isArtRootContainer,
  renderComponentText,
  syncComponentElement
};

export function installStageArtObjectGlobals(target: Window | typeof globalThis = globalThis): void {
  (target as Window).PartyGameArtObject = PartyGameArtObject;
}

installStageArtObjectGlobals(typeof window !== "undefined" ? window : globalThis);
