// Typed port of the legacy client/stage/game-object.js IIFE. Behaviour preserved
// 1:1; this module imports the ported PartyGameVisualObject directly (no global
// read) and installs window.PartyGameGameObject / PartyGameStageGameObject /
// PartyGameVisualBridge for the still-legacy stage runtime.

import { PartyGameVisualObject } from "./visualObject";
import { canonicalLifecycleLabel, lifecycleLabels } from "../../shared/lifecycle-labels";

type Dict = Record<string, unknown>;
type VisualInstance = ReturnType<typeof PartyGameVisualObject.createCssVisualObject>;
type VisualLifecycleState = "hidden" | "shown" | "appearing" | "disappearing";

function fn(value: unknown): value is (...args: unknown[]) => unknown {
  return typeof value === "function";
}

function isVisualLifecycleState(value: unknown): value is VisualLifecycleState {
  return value === "hidden" || value === "shown" || value === "appearing" || value === "disappearing";
}

function isShownLifecycleState(value: VisualLifecycleState): boolean {
  return value === "shown" || value === "appearing" || value === "disappearing";
}

class GameObject {
  id = "";
  element: HTMLElement | null = null;
  target: HTMLElement | null = null;
  isArt = false;
  isDynamic = false;
  isGlobal = false;
  visibilityKey = "";
  defaultAnimationState = "";
  visual: VisualInstance | null = null;
  artRenderer: Dict | null = null;
  syncArtRendererOnShow = false;
  visualOptions: Dict;
  layoutHiddenClasses: string[];
  visibilityOverrides: Map<string, boolean>;
  getVisible: (() => boolean) | null;
  setVisibleHandler: ((isVisible: boolean) => void) | null;
  timerSink: ((timerId: number) => void) | null;
  visualOptionsKey = "";

  constructor(options: Dict = {}) {
    this.visualOptions = (options.visualOptions as Dict) || {};
    this.layoutHiddenClasses =
      (options.layoutHiddenClasses as string[]) || (this.visualOptions.layoutHiddenClasses as string[]) || ["stage-layout-hidden"];
    this.visibilityOverrides = (options.visibilityOverrides as Map<string, boolean>) || new Map();
    this.getVisible = fn(options.getVisible) ? (options.getVisible as () => boolean) : null;
    this.setVisibleHandler = fn(options.setVisible) ? (options.setVisible as (v: boolean) => void) : null;
    this.timerSink = fn(options.timerSink) ? (options.timerSink as (t: number) => void) : null;
    this.update(options);
  }

  update(options: Dict = {}): this {
    const element = options.element as HTMLElement | undefined;
    this.id = (options.id as string) || element?.id || this.id || "";
    this.element = element || this.element;
    this.target = (options.target as HTMLElement) || this.target;
    if (options.isArt !== undefined) this.isArt = options.isArt === true;
    if (options.isDynamic !== undefined) this.isDynamic = options.isDynamic === true;
    if (options.isGlobal !== undefined) this.isGlobal = options.isGlobal === true;
    this.visibilityKey = (options.visibilityKey as string) || this.visibilityKey || this.id;
    const elementDict = element as unknown as Dict | undefined;
    if (options.defaultAnimationState !== undefined || elementDict?.defaultAnimationState !== undefined) {
      this.defaultAnimationState = String(options.defaultAnimationState ?? elementDict?.defaultAnimationState ?? "");
    }
    if (options.artRenderer !== undefined) this.artRenderer = (options.artRenderer as Dict) || null;
    if (options.syncArtRendererOnShow !== undefined) this.syncArtRendererOnShow = options.syncArtRendererOnShow === true;
    if (options.visualOptions) this.visualOptions = options.visualOptions as Dict;
    if (options.layoutHiddenClasses) this.layoutHiddenClasses = options.layoutHiddenClasses as string[];
    if (options.visibilityOverrides) this.visibilityOverrides = options.visibilityOverrides as Map<string, boolean>;
    if (fn(options.getVisible)) this.getVisible = options.getVisible as () => boolean;
    if (fn(options.setVisible)) this.setVisibleHandler = options.setVisible as (v: boolean) => void;
    if (fn(options.timerSink)) this.timerSink = options.timerSink as (t: number) => void;
    return this;
  }

  isActive(): boolean {
    return this.target?.isConnected !== false;
  }

  createVisual(): VisualInstance | null {
    if (!this.target) return null;
    const options = this.visualOptions || {};
    const nextVisualOptionsKey = JSON.stringify({
      animationHandlers: Object.keys((options.animationHandlers as Dict) || {}),
      displayHiddenClasses: options.displayHiddenClasses || [],
      durations: options.durations || {},
      exitingClass: options.exitingClass || "",
      hiddenClasses: options.hiddenClasses || [],
      instantClass: options.instantClass || "",
      motionHiddenClasses: options.motionHiddenClasses || [],
      timeline: options.timeline || null,
      timelineApplySelf: options.timelineApplySelf !== false,
      timelineCanvas: options.timelineCanvas || null,
      timelineFrameHandler: typeof options.timelineFrameHandler === "function" ? "handler" : "",
      timelineCommandHandler: typeof options.timelineCommandHandler === "function" ? "handler" : "",
      timelineCommandDurationHandler: typeof options.timelineCommandDurationHandler === "function" ? "handler" : "",
      transformOrigin: options.transformOrigin ?? "center center",
      updateClass: options.updateClass || ""
    });
    if (this.visual?.element === this.target && this.visualOptionsKey === nextVisualOptionsKey) return this.visual;
    this.visual?.cancel();
    this.visualOptionsKey = nextVisualOptionsKey;
    this.visual = PartyGameVisualObject.createCssVisualObject({
      element: this.target,
      hiddenClasses: (options.hiddenClasses as string[]) || ["stage-layout-visual-hidden"],
      motionHiddenClasses: (options.motionHiddenClasses as string[]) || (options.hiddenClasses as string[]) || ["stage-layout-visual-hidden"],
      displayHiddenClasses: options.displayHiddenClasses as string[] | undefined,
      exitingClass: (options.exitingClass as string) || "stage-layout-visual-exiting",
      updateClass: (options.updateClass as string) || "stage-layout-visual-update",
      instantClass: (options.instantClass as string) || "stage-layout-visual-instant",
      durations: options.durations as never,
      timeline: options.timeline as never,
      timelineApplySelf: options.timelineApplySelf !== false,
      timelineCanvas: options.timelineCanvas as never,
      timelineFrameHandler: options.timelineFrameHandler as never,
      timelineCommandHandler: options.timelineCommandHandler as never,
      timelineCommandDurationHandler: options.timelineCommandDurationHandler as never,
      animationHandlers: options.animationHandlers as never,
      transformOrigin: options.transformOrigin as never,
      getVisible: () => this.isVisible(),
      setVisible: (isVisible) => this.setVisible(isVisible),
      timerSink: this.timerSink || undefined
    });
    return this.visual;
  }

  visualClass(name: string, fallback: unknown): unknown {
    const value = (this.visualOptions as Dict)?.[name] ?? fallback;
    return Array.isArray(value) ? value[0] : value;
  }

  hasClass(className: unknown): boolean {
    return Boolean(className && this.target?.classList.contains(className as string));
  }

  isVisible(): boolean {
    if (!this.target) return false;
    const hiddenClass = this.visualClass("hiddenClasses", "stage-layout-visual-hidden");
    const exitingClass = this.visualClass("exitingClass", "stage-layout-visual-exiting");
    const layoutHiddenClasses = this.layoutHiddenClasses || [];
    if (isVisualLifecycleState(this.target.dataset.visualState)) {
      return isShownLifecycleState(this.target.dataset.visualState);
    }
    if (this.getVisible) return this.getVisible() === true;
    return (
      this.target.dataset.visualVisible === "true" ||
      (!this.hasClass(hiddenClass) &&
        !this.hasClass(exitingClass) &&
        !layoutHiddenClasses.some((className) => this.hasClass(className)))
    );
  }

  setVisible(isVisible: boolean): void {
    if (!this.target) return;
    this.target.dataset.visualVisible = isVisible ? "true" : "false";
    if (this.setVisibleHandler) this.setVisibleHandler(isVisible === true);
  }

  defaultVisible(): boolean | null {
    return defaultVisibleFor(this as unknown as Dict);
  }

  applyTargetVisibility(isShown: boolean): void {
    if (!this.target) return;
    const hiddenClass = this.visualClass("hiddenClasses", "stage-layout-visual-hidden") as string;
    const exitingClass = this.visualClass("exitingClass", "stage-layout-visual-exiting") as string;
    this.target.dataset.visualVisible = isShown ? "true" : "false";
    this.target.dataset.visualState = isShown ? "shown" : "hidden";
    if (isShown) {
      for (const className of this.layoutHiddenClasses || []) {
        if (className) this.target.classList.remove(className);
      }
      this.target.classList.remove(hiddenClass, exitingClass);
      return;
    }
    if (!this.hasClass(exitingClass)) {
      this.target.classList.add(hiddenClass);
    }
  }

  applyVisibilityOverride(): void {
    this.applyDefaultVisibility();
  }

  applyDefaultVisibility(): boolean {
    if (!this.target) return false;
    const animation = defaultAnimationFor(this as unknown as Dict);
    if (!animation) return false;
    this.stopAtAnimation(animation, { instant: true });
    return true;
  }

  applyVisibilityState(): void {
    if (!this.target) return;
    this.applyDefaultVisibility();
  }

  syncAuthoredHostGate(isShown: boolean): void {
    const visual = this.createVisual();
    if (visual) {
      visual.play(isShown ? lifecycleLabels.on : lifecycleLabels.off, { instant: true });
      return;
    }
    this.applyTargetVisibility(isShown);
  }

  playAuthoredAnimation(animation: string, options: Dict = {}, playbackMode: "play" | "stop" = "play"): number | null {
    const cleanAnimation = String(animation || "").trim();
    const player = playbackMode === "stop" ? this.artRenderer?.stopAtAll : this.artRenderer?.playAll;
    if (!cleanAnimation || !fn(player)) return null;
    const lifecycle = canonicalLifecycleLabel(cleanAnimation);
    const showsHost = lifecycle === lifecycleLabels.on || lifecycle === lifecycleLabels.appear || lifecycle === lifecycleLabels.update;
    const hidesHost = lifecycle === lifecycleLabels.off || lifecycle === lifecycleLabels.park || lifecycle === lifecycleLabels.disappear;
    if (showsHost) this.syncAuthoredHostGate(true);
    const externalComplete = fn(options.complete) ? (options.complete as () => void) : null;
    const finish = () => {
      if (hidesHost) this.syncAuthoredHostGate(false);
      externalComplete?.();
    };
    const playOptions = { ...options };
    if (hidesHost || externalComplete) playOptions.complete = finish;
    else delete playOptions.complete;
    return Number((player as (a: string, o: Dict) => number).call(this.artRenderer, lifecycle || cleanAnimation, playOptions) || 0);
  }

  playVisibility(isShown: boolean, options: Dict = {}): number {
    const visual = this.createVisual();
    const targetShown = visual?.isTargetShown?.() ?? visual?.isVisible?.() ?? this.isVisible();
    if (targetShown === (isShown === true)) {
      if (fn(options.complete)) (options.complete as () => void)();
      return 0;
    }
    const animation = PartyGameVisualObject.animationForVisibility(isShown === true, visual?.isVisible() ?? this.isVisible());
    visual?.setTargetShown?.(isShown === true);
    if (this.syncArtRendererOnShow && fn(this.artRenderer?.playAll)) {
      return this.playAuthoredAnimation(animation, options) || 0;
    }
    return visual ? visual.play(animation, options) : 0;
  }

  playAnimation(animation: string, options: Dict = {}): number {
    const cleanAnimation = String(animation || "").trim();
    if (!cleanAnimation) return 0;
    const authoredDuration = this.playAuthoredAnimation(cleanAnimation, options);
    if (authoredDuration !== null) return authoredDuration;
    const visual = this.createVisual();
    return visual ? Number(visual.play(cleanAnimation, options) || 0) : 0;
  }

  stopAtAnimation(animation: string, options: Dict = {}): number {
    const cleanAnimation = String(animation || "").trim();
    if (!cleanAnimation) return 0;
    const authoredDuration = this.playAuthoredAnimation(cleanAnimation, options, "stop");
    if (authoredDuration !== null) return authoredDuration;
    const visual = this.createVisual() as (VisualInstance & { stopAt?: (a: string, o: Dict) => number }) | null;
    return visual ? Number(visual.stopAt?.(cleanAnimation, options) || visual.play(cleanAnimation, { ...options, instant: true }) || 0) : 0;
  }
}

class GameObjectRegistry {
  objects = new Map<string, GameObject>();
  activeIds = new Set<string>();
  visibilityOverrides: Map<string, boolean>;
  visualOptions: Dict;

  constructor(options: Dict = {}) {
    this.visibilityOverrides = (options.visibilityOverrides as Map<string, boolean>) || new Map();
    this.visualOptions = (options.visualOptions as Dict) || {};
  }

  beginFrame(): void {
    this.activeIds.clear();
  }

  remove(id: string): void {
    if (!id) return;
    this.activeIds.delete(id);
    this.objects.delete(id);
    for (const [key, object] of Array.from(this.objects.entries())) {
      if (object?.id === id || object?.element?.id === id) {
        this.activeIds.delete(key);
        this.objects.delete(key);
      }
    }
  }

  register(options: Dict = {}): GameObject {
    const id = (options.id as string) || (options.element as HTMLElement | undefined)?.id || "";
    const registryKey = (options.registryKey as string) || id;
    const merged: Dict = {
      ...options,
      visibilityOverrides: this.visibilityOverrides,
      visualOptions: this.visualOptions,
      layoutHiddenClasses: this.visualOptions.layoutHiddenClasses
    };
    if (!id) return new GameObject(merged);
    this.activeIds.add(registryKey);
    const existing = this.objects.get(registryKey);
    if (existing) {
      existing.update(merged);
      return existing;
    }
    const object = new GameObject(merged);
    this.objects.set(registryKey, object);
    return object;
  }

  get(id: string, options: Dict = {}): GameObject | null {
    const registryKey = (options.registryKey as string) || id;
    if (!registryKey || !this.activeIds.has(registryKey)) return null;
    const object = this.objects.get(registryKey) || null;
    return object?.isActive() ? object : null;
  }
}

function createGameObject(options: Dict = {}): GameObject {
  return new GameObject(options);
}

function createGameObjectRegistry(options: Dict = {}): GameObjectRegistry {
  return new GameObjectRegistry(options);
}

function defaultVisibleFor(options: Dict = {}): boolean | null {
  const animation = defaultAnimationFor(options);
  if (!animation) return null;
  const state = animation.toLowerCase();
  if (["on", "appear", "update"].includes(state)) return true;
  if (["off", "disappear"].includes(state)) return false;
  return null;
}

function defaultAnimationFor(options: Dict = {}): string | null {
  const element = options.element as Dict | undefined;
  if (options.hidden === true || element?.hidden === true) return lifecycleLabels.off;
  const requested = String(options.defaultAnimationState ?? element?.defaultAnimationState ?? "").trim();
  const lifecycle = canonicalLifecycleLabel(requested);
  if (lifecycle === lifecycleLabels.park || lifecycle === lifecycleLabels.off) return lifecycleLabels.off;
  if (lifecycle) return lifecycle;
  if (["hidden", "hide"].includes(requested.toLowerCase())) return lifecycleLabels.off;
  if (["visible", "shown"].includes(requested.toLowerCase())) return lifecycleLabels.on;
  if (options.isArt === true || options.isDynamic === true) return lifecycleLabels.off;
  return null;
}

function createVisualForTarget(options: Dict = {}): Dict {
  const target = (options.target as HTMLElement) || null;
  const gameObjectApi = (options.gameObjectApi as Dict) || api;
  const visualAnimation = (options.visualAnimation as typeof PartyGameVisualObject) || PartyGameVisualObject;
  let gameObject = (options.gameObject as GameObject) || null;
  const legacyVisualInput = (options.legacyVisual as VisualInstance) || null;
  let legacyVisual = legacyVisualInput;
  if (target && fn(gameObjectApi?.create)) {
    const gameObjectOptions = (options.gameObjectOptions as Dict) || {};
    if (!gameObject || gameObject.target !== target || gameObject.id !== gameObjectOptions.id) {
      gameObject = (gameObjectApi.create as (o: Dict) => GameObject)({ ...gameObjectOptions, target });
    } else {
      gameObject.update(gameObjectOptions);
    }
    return { gameObject, legacyVisual, visual: gameObject.createVisual() };
  }
  if (!target || !visualAnimation) {
    return { gameObject, legacyVisual, visual: null };
  }
  if (!legacyVisual || legacyVisual.element !== target) {
    legacyVisual = visualAnimation.createLegacyCssVisualObject({
      element: target,
      ...((options.legacyVisualOptions as Dict) || {})
    });
  }
  return { gameObject, legacyVisual, visual: legacyVisual };
}

function playVisibilityForTarget(options: Dict = {}): Dict {
  const bridge = options.visual
    ? {
        gameObject: (options.gameObject as GameObject) || null,
        legacyVisual: (options.legacyVisual as VisualInstance) || null,
        visual: options.visual as VisualInstance
      }
    : createVisualForTarget(options);
  const visual = (bridge.visual as VisualInstance) || null;
  if (!visual) {
    return { ...bridge, duration: 0 };
  }
  const isShown = options.isShown !== false;
  const gameObject = (bridge.gameObject as GameObject) || null;
  if (gameObject) {
    return { ...bridge, duration: gameObject.playVisibility(isShown, (options.playOptions as Dict) || {}) };
  }
  if ((visual.isTargetShown?.() ?? visual.isVisible()) === isShown) {
    const complete = (options.playOptions as Dict | undefined)?.complete;
    if (fn(complete)) (complete as () => void)();
    return { ...bridge, duration: 0 };
  }
  const animation = PartyGameVisualObject.animationForVisibility(isShown, visual.isVisible());
  visual.setTargetShown?.(isShown);
  const duration = visual.play(animation, (options.playOptions as Dict) || {});
  return { ...bridge, duration };
}

function playAnimationForTarget(options: Dict = {}): Dict {
  const animation = String(options.animation || options.animationName || "").trim();
  const bridge = options.visual
    ? {
        gameObject: (options.gameObject as GameObject) || null,
        legacyVisual: (options.legacyVisual as VisualInstance) || null,
        visual: options.visual as VisualInstance
      }
    : createVisualForTarget(options);
  const gameObject = (bridge.gameObject as GameObject) || null;
  const visual = (bridge.visual as VisualInstance) || null;
  if (!animation || (!gameObject && !visual)) {
    return { ...bridge, duration: 0 };
  }
  const duration = gameObject
    ? gameObject.playAnimation(animation, (options.playOptions as Dict) || {})
    : visual?.play(animation, (options.playOptions as Dict) || {}) || 0;
  return { ...bridge, duration };
}

function stopAtAnimationForTarget(options: Dict = {}): Dict {
  const animation = String(options.animation || options.animationName || "").trim();
  const bridge = options.visual
    ? {
        gameObject: (options.gameObject as GameObject) || null,
        legacyVisual: (options.legacyVisual as VisualInstance) || null,
        visual: options.visual as VisualInstance
      }
    : createVisualForTarget(options);
  const gameObject = (bridge.gameObject as GameObject) || null;
  const visual = (bridge.visual as (VisualInstance & { stopAt?: (a: string, o: Dict) => number })) || null;
  if (!animation || (!gameObject && !visual)) {
    return { ...bridge, duration: 0 };
  }
  const duration = gameObject
    ? gameObject.stopAtAnimation(animation, (options.playOptions as Dict) || {})
    : visual?.stopAt?.(animation, (options.playOptions as Dict) || {}) || visual?.play(animation, { ...((options.playOptions as Dict) || {}), instant: true }) || 0;
  return { ...bridge, duration };
}

const api = {
  create: createGameObject,
  createGameObject,
  createRegistry: createGameObjectRegistry,
  createGameObjectRegistry,
  createVisualForTarget,
  defaultAnimationFor,
  defaultVisibleFor,
  playAnimationForTarget,
  stopAtAnimationForTarget,
  playVisibilityForTarget,
  GameObject,
  GameObjectRegistry,
  StageGameObject: GameObject,
  StageGameObjectRegistry: GameObjectRegistry
};

export const PartyGameGameObject = api;
export const PartyGameVisualBridge = { createVisualForTarget, playAnimationForTarget, stopAtAnimationForTarget, playVisibilityForTarget };
export type PartyGameGameObjectApi = typeof api;
export { GameObject, GameObjectRegistry };

declare global {
  interface Window {
    PartyGameGameObject?: PartyGameGameObjectApi;
    PartyGameStageGameObject?: PartyGameGameObjectApi;
    PartyGameVisualBridge?: typeof PartyGameVisualBridge;
  }
}

export function installGameObjectGlobals(target: Window | typeof globalThis = globalThis): void {
  const host = target as Window;
  host.PartyGameGameObject = api;
  host.PartyGameStageGameObject = api;
  host.PartyGameVisualBridge = PartyGameVisualBridge;
}

installGameObjectGlobals(typeof window !== "undefined" ? window : globalThis);
