// Typed port of the legacy client/stage/visual-controllers.js IIFE — the stage text,
// crafting timer, and player-answer-bubble controllers. Installs
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
    for (const target of Object.keys(objects)) {
      this.set(target, { text: "", isShown: false, instant: true, complete: null });
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
  gameObjectInstance: Dict | null = null;
  legacyVisual: Dict | null = null;
  visibilityRequest: { actionKey: string; isShown: boolean } | null = null;
  intervalId: number | null = null;

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
    return this.setVisible(false, { instant: true });
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
    const visual = this.visualObject();
    if (!visual) {
      this.element?.classList.toggle("hidden", !isShown);
      return 0;
    }
    const result = visualBridge()?.playVisibilityForTarget?.({
      visual,
      isShown,
      playOptions: { instant: options.instant === true }
    });
    return result?.duration || 0;
  }

  setShownForAction(action: Dict, options: Dict = {}): number {
    const actionKey = (options.actionKey as string) || this.getRenderedActionKey();
    this.visibilityRequest = { actionKey, isShown: action?.isShown !== false };
    const timer = this.payloadWithVisibilityRequest((this.getCurrentStageState()?.craftingTimer as Dict) || {});
    return this.render(timer, { instant: action?.instant === true });
  }

  render(timer: Dict, options: Dict = {}): number {
    const nextTimer = this.payloadWithVisibilityRequest(timer || {});
    this.clearInterval();
    if (!this.element || !this.label || !nextTimer?.shown) {
      return this.setVisible(false, { instant: options.instant === true });
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
      this.onTick?.({ label, progress, timer: nextTimer });
    };
    const visibilityDuration = this.setVisible(true, { instant: options.instant === true });
    update();
    if (nextTimer.running) {
      this.intervalId = setInterval(update, 100) as unknown as number;
    }
    return visibilityDuration;
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

type BubbleEl = HTMLElement & {
  playerAnswerBubbleGameObject?: Dict;
  playerAnswerBubbleVisual?: Dict;
};

class PlayerAnswerBubbleController {
  visualAnimation: unknown;
  gameObjectApi: unknown;
  host?: El;
  document: Document;
  getComposition: (id: string) => Dict | null;
  artRenderers = new WeakMap<El, { render: (components: Dict[], canvas: Dict, options: Dict) => void }>();
  renderedShown = true;
  animationEndsAt = 0;

  constructor(options: Dict = {}) {
    this.visualAnimation = options.visualAnimation || w().PartyGameVisualObject;
    this.gameObjectApi = options.gameObjectApi || w().PartyGameGameObject || w().PartyGameStageGameObject;
    this.host = options.host as El | undefined;
    this.document = (options.document as Document) || globalThis.document;
    this.getComposition = fn(options.getComposition)
      ? (options.getComposition as (id: string) => Dict | null)
      : (id: string) => w().artComposition?.(id) || null;
  }

  visualFor(bubble: BubbleEl | null): Dict | null {
    if (!bubble || !this.visualAnimation) return null;
    const id = bubble.id || bubble.dataset.answerNonce || `answer-bubble-${Math.random().toString(36).slice(2)}`;
    const bridge = visualBridge()?.createVisualForTarget?.({
      gameObjectApi: this.gameObjectApi,
      visualAnimation: this.visualAnimation,
      target: bubble,
      gameObject: bubble.playerAnswerBubbleGameObject,
      legacyVisual: bubble.playerAnswerBubbleVisual,
      gameObjectOptions: {
        id,
        visibilityKey: `answer-bubble:${bubble.dataset.answerNonce || bubble.id || ""}`,
        visualOptions: {
          hiddenClasses: ["is-hidden"],
          motionHiddenClasses: ["is-hidden"],
          exitingClass: "is-exiting",
          updateClass: "is-updating",
          instantClass: "is-instant",
          layoutHiddenClasses: ["is-hidden", "is-exiting"]
        },
        getVisible: () => !bubble.classList.contains("is-hidden") && !bubble.classList.contains("is-exiting"),
        setVisible: (isVisible: boolean) => {
          bubble.dataset.visualVisible = isVisible ? "true" : "false";
        }
      },
      legacyVisualOptions: {
        hiddenClasses: ["is-hidden"],
        motionHiddenClasses: ["is-hidden"],
        exitingClass: "is-exiting",
        updateClass: "is-updating",
        instantClass: "is-instant",
        getVisible: () => !bubble.classList.contains("is-hidden") && !bubble.classList.contains("is-exiting"),
        setVisible: (isVisible: boolean) => {
          bubble.dataset.visualVisible = isVisible ? "true" : "false";
        }
      }
    });
    bubble.playerAnswerBubbleGameObject = (bridge?.gameObject as Dict) || bubble.playerAnswerBubbleGameObject;
    bubble.playerAnswerBubbleVisual = (bridge?.visual as Dict) || (bridge?.legacyVisual as Dict) || bubble.playerAnswerBubbleVisual;
    return bubble.playerAnswerBubbleVisual || null;
  }

  isVisible(bubble: BubbleEl): boolean {
    return (this.visualFor(bubble) as { isVisible?: () => boolean } | null)?.isVisible?.() === true;
  }

  play(bubble: BubbleEl, animation: string, options: Dict = {}): number {
    return (this.visualFor(bubble) as { play?: (a: string, o: Dict) => number } | null)?.play?.(animation, options) || 0;
  }

  clonePrefabComponent(component: Dict, overrides: Dict = {}): Dict {
    const clone: Dict = {
      ...component,
      children: ((component.children as Dict[]) || []).map((child) => this.clonePrefabComponent(child, overrides))
    };
    const text = (overrides.text as Dict)?.[clone.id as string];
    if (text !== undefined && (clone.kind === "text" || clone.kind === "badge")) clone.defaultText = String(text ?? "");
    if ((overrides.props as Dict)?.[clone.id as string]) Object.assign(clone, (overrides.props as Dict)[clone.id as string]);
    return clone;
  }

  renderBubblePrefab(bubble: BubbleEl, text: unknown, displayedAnswer: Dict = {}): boolean {
    const composition = this.getComposition?.("player-answer-bubble");
    const artRuntime = w().PartyGameArtObject as { ArtObjectTreeRenderer?: new (o: Dict) => { render: (c: Dict[], canvas: Dict, o: Dict) => void } } | undefined;
    if (!bubble || !composition || !artRuntime?.ArtObjectTreeRenderer) return false;
    bubble.classList.add("has-prefab-art");
    bubble.querySelector(":scope > .player-answer-bubble-text")?.remove();
    const canvas = (composition.canvas as Dict) || { width: 300, height: 180 };
    bubble.style.width = `${Math.max(1, Number(canvas.width || 1))}px`;
    bubble.style.height = `${Math.max(1, Number(canvas.height || 1))}px`;
    const fillColor = displayedAnswer?.correct === true ? "#60d394" : displayedAnswer?.correct === false ? "#d7d3c7" : "";
    const textColor = displayedAnswer?.correct === false ? "rgba(23, 19, 31, 0.68)" : "";
    const props: Dict = {};
    if (fillColor) {
      props["answer-bubble-card"] = { fillColor };
      props["answer-bubble-tail"] = { fillColor };
    }
    if (textColor) props["answer-text"] = { fontColor: textColor };
    const components = ((composition.components as Dict[]) || []).map((component) =>
      this.clonePrefabComponent(component, { text: { "answer-text": text }, props })
    );
    let renderer = this.artRenderers.get(bubble);
    if (!renderer) {
      renderer = new artRuntime.ArtObjectTreeRenderer({
        host: bubble,
        document: this.document,
        instanceId: `answer-bubble:${bubble.dataset.answerNonce || Math.random().toString(36).slice(2)}`,
        gameObjectApi: this.gameObjectApi,
        visualAnimation: this.visualAnimation,
        getComposition: this.getComposition
      });
      this.artRenderers.set(bubble, renderer);
    }
    renderer.render(components, canvas, { defaultAnimation: "on", instant: true, respectDefaultAnimationState: false });
    return true;
  }

  applyTextFit(bubble: BubbleEl, text: unknown, displayedAnswer: Dict = {}): void {
    if (this.renderBubblePrefab(bubble, text, displayedAnswer)) return;
    const value = String(text ?? "");
    const length = value.length;
    const isLong = length > 14;
    const textWidth = isLong ? 234 : Math.max(72, Math.min(234, length * 18));
    const textHeight = isLong ? 92 : 34;
    const textSpec = { width: textWidth, height: textHeight, fontSize: 28, autoFitText: true };
    const textNode = this.ensureTextNode(bubble);
    bubble.classList.toggle("is-long", isLong);
    bubble.style.width = `${textWidth}px`;
    bubble.style.setProperty("--player-answer-text-height", `${textHeight}px`);
    const renderedLayout = renderStageTextBox(textNode, value, { ...textSpec, applySize: false }, { lineHeight: 1.02, maxSize: 28, minSize: 12 });
    bubble.style.setProperty("--player-answer-text-font-size", `${renderedLayout?.fontSize || 28}px`);
  }

  ensureTextNode(bubble: BubbleEl): El {
    let textNode = bubble.querySelector(":scope > .player-answer-bubble-text") as El | null;
    if (!textNode) {
      textNode = this.document.createElement("span");
      textNode.className = "player-answer-bubble-text";
      bubble.replaceChildren(textNode);
    }
    return textNode;
  }

  removeBubble(bubble: BubbleEl | null, options: Dict = {}): number {
    if (!bubble) return 0;
    const duration = this.play(bubble, this.isVisible(bubble) ? "disappear" : "park", options);
    const removalToken = bubble.dataset.visualAnimationToken || "";
    const removeBubble = () => {
      if (bubble.parentElement && bubble.dataset.visualAnimationToken === removalToken) bubble.remove();
    };
    if (duration > 0) setTimeout(removeBubble, duration);
    else removeBubble();
    return duration;
  }

  sync(tile: El | null, player: Dict | null, options: Dict = {}): number {
    const displayedAnswer = (player?.displayedAnswer as Dict) || null;
    const answerText = (displayedAnswer?.text as string) || "";
    const answerNonce = String(displayedAnswer?.nonce || "");
    const answerHidden = displayedAnswer?.hidden === true;
    let bubble = tile?.querySelector(".player-answer-bubble") as BubbleEl | null;
    if (!answerText || answerHidden) {
      if (bubble) {
        bubble.dataset.answerHidden = "true";
        return this.removeBubble(bubble, options);
      }
      return 0;
    }

    const hadBubble = Boolean(bubble);
    const previousNonce = bubble?.dataset.answerNonce || "";
    const previousText = bubble?.dataset.answerText || "";
    if (!bubble) {
      bubble = this.document.createElement("div") as BubbleEl;
      bubble.className = "player-answer-bubble is-hidden";
      tile!.insertBefore(bubble, tile!.firstChild);
    }

    bubble.dataset.answerNonce = answerNonce;
    bubble.dataset.answerText = answerText;
    bubble.dataset.answerHidden = "false";
    bubble.classList.toggle("is-correct", displayedAnswer?.correct === true);
    bubble.classList.toggle("is-wrong", displayedAnswer?.correct === false);
    this.applyTextFit(bubble, answerText, displayedAnswer);

    if (this.renderedShown === false) {
      return this.play(bubble, "park", { instant: true });
    }
    if (!hadBubble || !this.isVisible(bubble)) {
      return this.play(bubble, "appear", options);
    }
    if (previousNonce !== answerNonce || previousText !== answerText) {
      return this.play(bubble, "update", options);
    }
    return 0;
  }

  bubbles(): BubbleEl[] {
    return Array.from(this.host?.querySelectorAll(".player-answer-bubble") || []) as BubbleEl[];
  }

  currentShown(): boolean {
    return this.renderedShown !== false;
  }

  remaining(): number {
    return Math.max(0, this.animationEndsAt - Date.now());
  }

  hasParkedShownBubbles(): boolean {
    return this.currentShown() && Boolean(this.host?.querySelector(".player-answer-bubble.is-hidden, .player-answer-bubble.is-exiting"));
  }

  reset(): void {
    this.renderedShown = true;
    this.animationEndsAt = 0;
    this.host?.classList.remove("answers-hidden");
  }

  setShown(isShown: boolean, options: Dict = {}): number {
    const instant = options.instant === true;
    const remainingDuration = this.remaining();
    const wasShown = this.currentShown();
    this.renderedShown = isShown;
    this.host?.classList.toggle("answers-hidden", !isShown);
    const bubbles = this.bubbles();
    if (!bubbles.length) {
      this.animationEndsAt = 0;
      return 0;
    }
    if (!instant && wasShown === isShown && remainingDuration > 0) {
      return remainingDuration;
    }
    let duration = 0;
    if (isShown) {
      for (const bubble of bubbles) {
        if (bubble.dataset.answerHidden === "true") continue;
        if (!this.isVisible(bubble)) {
          duration = Math.max(duration, this.play(bubble, "appear", { instant }));
        }
      }
    } else {
      for (const bubble of bubbles) {
        const animation = this.isVisible(bubble) ? "disappear" : "park";
        duration = Math.max(duration, this.play(bubble, animation, { instant }));
      }
    }
    this.animationEndsAt = duration > 0 ? Date.now() + duration : 0;
    return duration;
  }
}

export const PartyGameStageVisualControllers = {
  CraftingTimerController,
  PlayerAnswerBubbleController,
  StageTextController,
  createCraftingTimerController: (options?: Dict) => new CraftingTimerController(options),
  createPlayerAnswerBubbleController: (options?: Dict) => new PlayerAnswerBubbleController(options),
  createStageTextController: (options?: Dict) => new StageTextController(options)
};

export function installStageVisualControllersGlobals(target: Window | typeof globalThis = globalThis): void {
  (target as Window).PartyGameStageVisualControllers = PartyGameStageVisualControllers;
}

installStageVisualControllersGlobals(typeof window !== "undefined" ? window : globalThis);
