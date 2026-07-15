// Typed port of the legacy client/stage/visual-controllers.js IIFE — the stage text
// and crafting timer controllers. Installs
// window.PartyGameStageVisualControllers for the legacy stage runtime. All PartyGame*
// + artComposition deps are read lazily via globalThis at call time (they install on
// window before bootLegacySurface loads the legacy consumers).

type Dict = Record<string, unknown>;
type El = HTMLElement;

interface LayoutTextRuntime {
  setStageText?: (element: El, text: string) => void;
}
interface VisualBridgeApi {
  createVisualForTarget?: (options: Dict) => Dict | undefined;
  playVisibilityForTarget?: (options: Dict) => { duration?: number } | undefined;
}

declare global {
  interface Window {
    PartyGameStageVisualControllers?: typeof PartyGameStageVisualControllers;
  }
}

const w = () => globalThis as typeof globalThis & Window;
const layoutText = (): LayoutTextRuntime | undefined => w().PartyGameLayoutText as unknown as LayoutTextRuntime | undefined;
const visualBridge = (): VisualBridgeApi | undefined => w().PartyGameVisualBridge as unknown as VisualBridgeApi | undefined;

function isElementParked(element: El, hiddenClass = "hidden", parkedClass = "text-hidden"): boolean {
  return element.classList.contains(hiddenClass) || element.classList.contains(parkedClass);
}

function renderStageTextBox(target: El, text: unknown, spec: Dict = {}, options: Dict = {}): Dict | null {
  return (w().PartyGameStageTextRenderer?.renderStageTextBox?.(target, text, spec, options) as Dict) || null;
}

function fn<T = (...args: never[]) => unknown>(value: unknown): value is T {
  return typeof value === "function";
}

class StageTextController {
  visualAnimation: unknown;
  gameObjectApi: unknown;
  queryTextElements: () => El[];
  normalizeTextTargetId: (value: unknown) => string;
  applyTextProperties: (element: El, layoutElement: Dict) => void;
  timerSink: ((id: number) => void) | null;
  setObjects: (objects: Dict) => void;
  defaultElements: Record<string, El>;
  objects: Record<string, Dict>;

  constructor(options: Dict = {}) {
    this.visualAnimation = options.visualAnimation || w().PartyGameVisualObject;
    this.gameObjectApi = options.gameObjectApi || w().PartyGameGameObject || w().PartyGameStageGameObject;
    this.queryTextElements = fn<() => El[]>(options.queryTextElements) ? (options.queryTextElements as () => El[]) : () => [];
    this.normalizeTextTargetId = fn(options.normalizeTextTargetId)
      ? (options.normalizeTextTargetId as (v: unknown) => string)
      : (value) => String(value || "");
    this.applyTextProperties = fn(options.applyTextProperties) ? (options.applyTextProperties as (e: El, l: Dict) => void) : () => {};
    this.timerSink = fn(options.timerSink) ? (options.timerSink as (id: number) => void) : null;
    this.setObjects = fn(options.setObjects) ? (options.setObjects as (o: Dict) => void) : () => {};
    this.defaultElements = (options.defaultElements as Record<string, El>) || {};
    this.objects = (options.objects as Record<string, Dict>) || {};
  }

  createObject(element: El, extra: Dict = {}): Dict {
    return { element, visible: false, text: "", ...extra };
  }

  init(): void {
    const objects: Record<string, Dict> = {};
    for (const element of this.queryTextElements()) {
      const target = this.normalizeTextTargetId(element.id);
      if (target) objects[target] = this.createObject(element);
    }
    for (const [alias, element] of Object.entries(this.defaultElements)) {
      const target = this.normalizeTextTargetId(element?.id || alias);
      objects[alias] = objects[target] || this.createObject(element);
    }
    this.objects = objects;
    this.setObjects(objects);
    for (const object of Object.values(objects)) {
      object.text = "";
      const visual = this.visualFor(object) as { stopAt?: (animation: string, options?: Dict) => number } | null;
      visual?.stopAt?.("Off", { instant: true });
    }
  }

  objectFor(target: string): Dict | null {
    const normalized = this.normalizeTextTargetId(target);
    return this.objects[normalized] || this.objects[target] || this.objects.presentation || null;
  }

  visualFor(object: Dict | null): Dict | null {
    const element = object?.element as El | undefined;
    if (!element || !this.visualAnimation) return null;
    const id = this.normalizeTextTargetId(element.id || (object?.layoutElement as Dict)?.id || "text");
    const bridge = visualBridge()?.createVisualForTarget?.({
      gameObjectApi: this.gameObjectApi,
      visualAnimation: this.visualAnimation,
      target: element,
      gameObject: object?.gameObject,
      legacyVisual: object?.visual,
      gameObjectOptions: {
        id,
        element: object?.layoutElement || null,
        visibilityKey: `text:${id}`,
        visualOptions: {
          hiddenClasses: ["text-hidden", "hidden"],
          motionHiddenClasses: ["text-hidden"],
          displayHiddenClasses: ["hidden"],
          updateClass: "text-update",
          instantClass: "text-instant",
          layoutHiddenClasses: ["hidden", "text-hidden"]
        },
        getVisible: () => object!.visible === true || !isElementParked(element),
        setVisible: (isVisible: boolean) => {
          object!.visible = isVisible;
          element.dataset.visualVisible = isVisible ? "true" : "false";
        }
      },
      legacyVisualOptions: {
        hiddenClasses: ["text-hidden", "hidden"],
        motionHiddenClasses: ["text-hidden"],
        displayHiddenClasses: ["hidden"],
        updateClass: "text-update",
        instantClass: "text-instant",
        getVisible: () => object!.visible === true || !isElementParked(element),
        setVisible: (isVisible: boolean) => {
          object!.visible = isVisible;
          element.dataset.visualVisible = isVisible ? "true" : "false";
        },
        timerSink: this.timerSink
      }
    });
    if (object) {
      object.gameObject = bridge?.gameObject || object.gameObject;
      object.visual = bridge?.visual || bridge?.legacyVisual || object.visual;
    }
    return (object?.visual as Dict) || null;
  }

  isVisible(object: Dict): boolean {
    return (this.visualFor(object) as { isVisible?: () => boolean } | null)?.isVisible?.() === true;
  }

  set(target: string, options: Dict = {}): number {
    const object = this.objectFor(target);
    if (!object) return 0;
    const element = object.element as El;
    const nextText = String((options.text ?? object.text ?? "") as string);
    const isShown = options.isShown !== false;
    const instant = options.instant === true;
    if (nextText || isShown) {
      if (object.layoutElement && fn(layoutText()?.setStageText)) {
        layoutText()!.setStageText!(element, nextText);
      } else {
        renderStageTextBox(
          element,
          nextText,
          {
            width: element.clientWidth || 980,
            height: element.clientHeight || 132,
            fontSize: Number.parseFloat(w().getComputedStyle?.(element)?.fontSize as string) || 58,
            autoFitText: true,
            applySize: false
          },
          { minSize: 10, lineHeight: 1.02 }
        );
      }
    }
    if (object.layoutElement && !fn(layoutText()?.setStageText)) {
      this.applyTextProperties(element, object.layoutElement as Dict);
    }
    element.classList.toggle("is-long", nextText.length > 62);
    element.classList.toggle("is-extra-long", nextText.length > 104);
    object.text = nextText;
    const visual = this.visualFor(object);
    const result = visualBridge()?.playVisibilityForTarget?.({
      visual,
      isShown,
      playOptions: { instant, complete: options.complete }
    });
    return result?.duration || 0;
  }
}

class CraftingTimerController {
  visualAnimation: unknown;
  gameObjectApi: unknown;
  element?: El;
  label?: El;
  timerSink: ((id: number) => void) | null;
  getRenderedActionKey: () => string;
  getCurrentStageState: () => Dict | null;
  fallbackDurationMs: () => number;
  onTick: ((info: Dict) => void) | null;
  renderArt: ((info: Dict) => Dict | null) | null;
  gameObjectInstance: Dict | null = null;
  legacyVisual: Dict | null = null;
  timelineRenderer: { playAll?: (animation: string, options?: Dict) => number; stopAtAll?: (animation: string, options?: Dict) => number } | null = null;
  visibilityRequest: { actionKey: string; isShown: boolean } | null = null;
  intervalId: number | null = null;
  targetShown = false;
  desiredShown = false;
  activeAnimation = "";
  activeAnimationToken = "";

  constructor(options: Dict = {}) {
    this.visualAnimation = options.visualAnimation || w().PartyGameVisualObject;
    this.gameObjectApi = options.gameObjectApi || w().PartyGameGameObject || w().PartyGameStageGameObject;
    this.element = options.element as El | undefined;
    this.label = options.label as El | undefined;
    this.timerSink = fn(options.timerSink) ? (options.timerSink as (id: number) => void) : null;
    this.getRenderedActionKey = fn(options.getRenderedActionKey) ? (options.getRenderedActionKey as () => string) : () => "";
    this.getCurrentStageState = fn(options.getCurrentStageState) ? (options.getCurrentStageState as () => Dict | null) : () => null;
    this.fallbackDurationMs = fn(options.fallbackDurationMs) ? (options.fallbackDurationMs as () => number) : () => 30000;
    this.onTick = fn(options.onTick) ? (options.onTick as (i: Dict) => void) : null;
    this.renderArt = fn(options.renderArt) ? (options.renderArt as (i: Dict) => Dict | null) : null;
  }

  renderWidget(context: Dict = {}): { playAll?: (animation: string, options?: Dict) => number; stopAtAll?: (animation: string, options?: Dict) => number } | null {
    const result = this.renderArt?.(context) || null;
    this.timelineRenderer = (result?.renderer as { playAll?: (animation: string, options?: Dict) => number; stopAtAll?: (animation: string, options?: Dict) => number }) || this.timelineRenderer;
    return this.timelineRenderer;
  }

  visualObject(): Dict | null {
    if (!this.element || !this.visualAnimation) return null;
    const bridge = visualBridge()?.createVisualForTarget?.({
      gameObjectApi: this.gameObjectApi,
      visualAnimation: this.visualAnimation,
      target: this.element,
      gameObject: this.gameObjectInstance,
      legacyVisual: this.legacyVisual,
      gameObjectOptions: {
        id: this.element.id || "craftingTimer",
        visibilityKey: `widget:${this.element.id || "craftingTimer"}`,
        visualOptions: {
          hiddenClasses: ["hidden"],
          motionHiddenClasses: ["hidden"],
          instantClass: "is-instant",
          layoutHiddenClasses: ["hidden"]
        },
        timerSink: this.timerSink
      },
      legacyVisualOptions: {
        hiddenClasses: ["hidden"],
        motionHiddenClasses: ["hidden"],
        instantClass: "is-instant",
        timerSink: this.timerSink
      }
    });
    this.gameObjectInstance = (bridge?.gameObject as Dict) || this.gameObjectInstance;
    this.legacyVisual = (bridge?.legacyVisual as Dict) || this.legacyVisual;
    if (bridge?.visual) return bridge.visual as Dict;
    return this.legacyVisual;
  }

  clearRequest(actionKey = ""): void {
    if (!this.visibilityRequest) return;
    if (!actionKey || this.visibilityRequest.actionKey !== actionKey) this.visibilityRequest = null;
  }

  clearInterval(): void {
    if (this.intervalId !== null) clearInterval(this.intervalId);
    this.intervalId = null;
  }

  reset(): number {
    this.clearInterval();
    this.visibilityRequest = null;
    this.activeAnimation = "";
    this.targetShown = false;
    this.desiredShown = false;
    const renderer = this.timelineRenderer || this.renderWidget({});
    renderer?.stopAtAll?.("Off", { instant: true });
    if (this.element) {
      this.element.dataset.timerShown = "false";
      this.element.setAttribute("aria-hidden", "true");
    }
    return 0;
  }

  payloadWithVisibilityRequest(timer: Dict = {}): Dict {
    if (!this.visibilityRequest || this.visibilityRequest.actionKey !== this.getRenderedActionKey()) return timer;
    if (this.visibilityRequest.isShown === false) {
      return { ...timer, shown: false, running: false };
    }
    const durationMs = Math.max(1, Number(timer.durationMs || 0) || this.fallbackDurationMs());
    return {
      ...timer,
      shown: true,
      running: false,
      durationMs,
      remainingMs: Math.max(0, Number(timer.remainingMs || 0)) || durationMs,
      startedAt: 0,
      endsAt: 0
    };
  }

  setVisible(isShown: boolean, options: Dict = {}): number {
    const nextShown = isShown !== false;
    const instant = options.instant === true;
    const complete = typeof options.complete === "function" ? (options.complete as () => void) : null;
    const renderer = this.timelineRenderer || this.renderWidget((options.context as Dict) || {});
    if (renderer?.playAll) {
      this.element?.classList.remove("hidden", "is-instant");
      if (this.element) {
        this.element.dataset.timerShown = nextShown ? "true" : "false";
        this.element.setAttribute("aria-hidden", nextShown ? "false" : "true");
      }
      const animation = nextShown ? (instant ? "On" : "Appear") : instant ? "Off" : "Disappear";
      const token = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      this.activeAnimation = animation;
      this.activeAnimationToken = token;
      this.desiredShown = nextShown;
      let finished = false;
      const finish = () => {
        if (finished || this.activeAnimationToken !== token) return;
        finished = true;
        this.activeAnimation = "";
        this.targetShown = nextShown;
        complete?.();
      };
      const duration = Number(renderer.playAll(animation, { instant, complete: finish }) || 0);
      return duration;
    }
    return 0;
  }

  setShownForAction(action: Dict, options: Dict = {}): number {
    const actionKey = (options.actionKey as string) || this.getRenderedActionKey();
    this.visibilityRequest = { actionKey, isShown: action?.isShown !== false };
    const timer = this.payloadWithVisibilityRequest((this.getCurrentStageState()?.craftingTimer as Dict) || {});
    this.render(timer, { deferVisibility: true });
    return this.setVisible(action?.isShown !== false, { instant: action?.instant === true, complete: options.complete, context: timer });
  }

  render(timer: Dict, _options: Dict = {}): number {
    const nextTimer = this.payloadWithVisibilityRequest(timer || {});
    this.clearInterval();
    if (!this.element || !this.label || !nextTimer?.shown) {
      this.renderWidget({ label: this.label?.dataset.timerValue || "", progress: 0, timer: nextTimer });
      return 0;
    }
    const durationMs = Math.max(1, Number(nextTimer.durationMs || 1));
    const currentStageState = this.getCurrentStageState();
    const clockOffset = (Number(nextTimer.serverNow || currentStageState?.serverNow) || Date.now()) - Date.now();
    const update = () => {
      const now = Date.now() + clockOffset;
      const remainingMs = nextTimer.running
        ? Math.max(0, Number(nextTimer.endsAt || now) - now)
        : Math.max(0, Number(nextTimer.remainingMs || 0));
      const progress = Math.max(0, Math.min(1, remainingMs / durationMs));
      this.element!.style.setProperty("--timer-progress", progress.toFixed(4));
      const label = String(Math.ceil(remainingMs / 1000));
      this.renderLabel(label);
      this.renderWidget({ label, progress, timer: nextTimer });
      this.onTick?.({ label, progress, timer: nextTimer });
    };
    update();
    if (nextTimer.running) {
      this.intervalId = setInterval(update, 100) as unknown as number;
    }
    return 0;
  }

  renderLabel(label: string): void {
    if (!this.label) return;
    const text = String(label ?? "");
    this.label.dataset.timerValue = text;
    renderStageTextBox(
      this.label,
      text,
      { width: 130, height: 86, fontSize: 74, autoFitText: true, applySize: false },
      { maxSize: 74, minSize: 12, lineHeight: 0.9 }
    );
  }
}

export const PartyGameStageVisualControllers = {
  CraftingTimerController,
  StageTextController,
  createCraftingTimerController: (options?: Dict) => new CraftingTimerController(options),
  createStageTextController: (options?: Dict) => new StageTextController(options)
};

export function installStageVisualControllersGlobals(target: Window | typeof globalThis = globalThis): void {
  (target as Window).PartyGameStageVisualControllers = PartyGameStageVisualControllers;
}

installStageVisualControllersGlobals(typeof window !== "undefined" ? window : globalThis);
