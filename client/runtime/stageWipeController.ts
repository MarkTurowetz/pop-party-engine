// Typed port of the legacy client/stage/wipe-controller.js IIFE — the stage transition
// wipe. Installs window.PartyGameStageWipe for the legacy stage runtime. PartyGame*
// deps are read lazily via globalThis at call time.

type Dict = Record<string, unknown>;

interface VisualBridgeApi {
  createVisualForTarget?: (options: Dict) => Dict | undefined;
  playVisibilityForTarget?: (options: Dict) => { duration?: number } | undefined;
}
interface AnimationApi {
  element?: HTMLElement;
  instant?: boolean;
  duration: number;
  addClasses: (classes: unknown) => void;
  removeClasses: (classes: unknown) => void;
  setVisibleState: (isVisible: boolean) => void;
  schedule: (delay: number, callback?: () => void) => number | null;
  tokenMatches: () => boolean;
}

declare global {
  interface Window {
    PartyGameStageWipe?: typeof PartyGameStageWipe;
  }
}

const w = () => globalThis as typeof globalThis & Window;
const visualBridge = (): VisualBridgeApi | undefined => w().PartyGameVisualBridge as unknown as VisualBridgeApi | undefined;

const WipeMotionMs = 460;
const WipeLineStaggerMs = 24;

function transitionToken(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

class StageWipeController {
  element: HTMLElement | null;
  visualAnimation: unknown;
  gameObjectApi: unknown;
  gameObject: Dict | null = null;
  visual: (Dict & { play?: (a: string, o: Dict) => number }) | null = null;
  targetShown = false;
  visibilityRequest: { actionKey: string; isShown: boolean } | null = null;
  activeTransitionToken = "";

  constructor(options: Dict = {}) {
    this.element = (options.element as HTMLElement) || null;
    this.visualAnimation = options.visualAnimation || w().PartyGameVisualObject;
    this.gameObjectApi = options.gameObjectApi || w().PartyGameGameObject || w().PartyGameStageGameObject;
  }

  lineCount(): number {
    return this.element?.querySelectorAll(".wipe-line").length || 7;
  }

  motionDuration(instant = false): number {
    if (instant) return 0;
    return WipeMotionMs + Math.max(0, this.lineCount() - 1) * WipeLineStaggerMs;
  }

  waitForMotionEnd(callback: () => void): void {
    const line = Array.from(this.element?.querySelectorAll(".wipe-line") || []).at(-1) as HTMLElement | undefined;
    if (!line) {
      queueMicrotask(callback);
      return;
    }
    let completed = false;
    const finish = (event?: Event) => {
      if (completed) return;
      if (event && event.target !== line) return;
      completed = true;
      line.removeEventListener("transitionend", finish);
      line.removeEventListener("transitioncancel", finish);
      callback();
    };
    line.addEventListener("transitionend", finish);
    line.addEventListener("transitioncancel", finish);
  }

  setVisibleState(isVisible: boolean): void {
    this.targetShown = isVisible === true;
    if (this.element) this.element.dataset.wipeShown = this.targetShown ? "true" : "false";
  }

  isVisuallyPresent(): boolean {
    if (!this.element || this.element.classList.contains("hidden")) return false;
    if (this.targetShown === true) return true;
    return (
      this.element.classList.contains("is-entering") ||
      this.element.classList.contains("is-covered") ||
      this.element.classList.contains("is-exiting")
    );
  }

  resetHidden(): void {
    if (!this.element) return;
    this.element.classList.add("hidden");
    this.element.classList.remove("is-entering", "is-covered", "is-exiting", "is-instant");
    this.setVisibleState(false);
  }

  resetCovered(): void {
    if (!this.element) return;
    this.element.classList.remove("hidden", "is-entering", "is-exiting", "is-instant");
    this.element.classList.add("is-covered");
    this.setVisibleState(true);
  }

  visualObject(): (Dict & { play?: (a: string, o: Dict) => number }) | null {
    if (!this.element || !this.visualAnimation) return null;
    const visualOptions = this.visualOptions();
    const bridge = visualBridge()?.createVisualForTarget?.({
      gameObjectApi: this.gameObjectApi,
      visualAnimation: this.visualAnimation,
      target: this.element,
      gameObject: this.gameObject,
      legacyVisual: this.visual,
      gameObjectOptions: {
        id: "global:wipe",
        visibilityKey: "global:wipe",
        isArt: true,
        isGlobal: true,
        visualOptions,
        getVisible: () => this.isVisuallyPresent(),
        setVisible: (isVisible: boolean) => this.setVisibleState(isVisible)
      },
      legacyVisualOptions: {
        ...this.visualOptions(),
        getVisible: () => this.isVisuallyPresent(),
        setVisible: (isVisible: boolean) => this.setVisibleState(isVisible)
      }
    });
    this.gameObject = (bridge?.gameObject as Dict) || this.gameObject;
    this.visual = (bridge?.visual as Dict) || (bridge?.legacyVisual as Dict) || this.visual;
    return this.visual;
  }

  visualOptions(): Dict {
    return {
      hiddenClasses: ["hidden"],
      instantClass: "is-instant",
      durations: { appear: this.motionDuration(false), disappear: this.motionDuration(false) },
      animationHandlers: {
        appear: (api: AnimationApi) => this.playAppear(api),
        disappear: (api: AnimationApi) => this.playDisappear(api),
        off: () => this.playOff(),
        on: () => this.playOn(),
        park: () => this.playOff(),
        update: () => this.playUpdate()
      }
    };
  }

  playAppear(api: AnimationApi): number {
    if (!api.element) return 0;
    api.removeClasses(["hidden", "is-entering", "is-covered", "is-exiting"]);
    api.setVisibleState(true);
    if (api.instant) {
      this.resetCovered();
      return 0;
    }
    void api.element.offsetWidth;
    api.addClasses("is-entering");
    this.waitForMotionEnd(() => {
      if (!api.tokenMatches()) return;
      this.resetCovered();
    });
    return api.duration;
  }

  playDisappear(api: AnimationApi): number {
    if (!api.element) return 0;
    if (api.instant) {
      this.resetHidden();
      return 0;
    }
    api.removeClasses("hidden");
    api.setVisibleState(true);
    api.removeClasses(["is-entering", "is-covered"]);
    api.addClasses("is-exiting");
    this.waitForMotionEnd(() => {
      if (!api.tokenMatches()) return;
      this.resetHidden();
    });
    return api.duration;
  }

  playOn(): number {
    this.resetCovered();
    return 0;
  }

  playOff(): number {
    this.resetHidden();
    return 0;
  }

  playUpdate(): number {
    if (!this.element) return 0;
    if (this.element.classList.contains("is-entering") || this.element.classList.contains("is-covered")) {
      this.setVisibleState(true);
      return 0;
    }
    this.resetCovered();
    return 0;
  }

  setShown(isShown: boolean, options: Dict = {}): number {
    const visual = this.visualObject();
    if (!visual || !this.visualAnimation) {
      this.element?.classList.toggle("hidden", isShown === false);
      this.setVisibleState(isShown !== false);
      if (typeof options.complete === "function") queueMicrotask(options.complete as () => void);
      return 0;
    }
    const nextShown = isShown !== false;
    if (options.instant !== true && typeof options.complete === "function") {
      this.waitForMotionEnd(options.complete as () => void);
    }
    const result = visualBridge()?.playVisibilityForTarget?.({
      visual,
      isShown: nextShown,
      playOptions: { complete: options.instant === true ? options.complete : undefined, instant: options.instant === true }
    });
    return result?.duration || 0;
  }

  setShownForAction(action: Dict, options: Dict = {}): number {
    const actionKey = (options.actionKey as string) || "";
    this.visibilityRequest = { actionKey, isShown: action?.isShown !== false };
    return this.setShown(action?.isShown !== false, { instant: action?.instant === true, complete: options.complete });
  }

  syncShown(isShown: boolean, options: Dict = {}): number {
    const actionKey = (options.actionKey as string) || "";
    const request = this.visibilityRequest && this.visibilityRequest.actionKey === actionKey ? this.visibilityRequest : null;
    const targetShown = request ? request.isShown : isShown !== false;
    return this.setShown(targetShown, { instant: options.instant === true });
  }

  clearRequest(actionKey = ""): void {
    if (!this.visibilityRequest) return;
    if (!actionKey || this.visibilityRequest.actionKey !== actionKey) this.visibilityRequest = null;
  }

  transition(onCovered?: () => void): number {
    this.visibilityRequest = null;
    this.activeTransitionToken = transitionToken();
    const token = this.activeTransitionToken;
    const enterDuration = this.setShown(true, {
      complete: () => {
        if (this.activeTransitionToken !== token) return;
        if (typeof onCovered === "function") onCovered();
        this.setShown(false);
      }
    });
    return enterDuration + this.motionDuration(false);
  }

  cancel(): void {
    this.visibilityRequest = null;
    this.activeTransitionToken = transitionToken();
    const visual = this.visualObject();
    if (visual) visual.play?.("off", { instant: true });
    else this.resetHidden();
  }
}

export const PartyGameStageWipe = {
  createController: (options?: Dict) => new StageWipeController(options),
  WipeLineStaggerMs,
  WipeMotionMs
};

export function installStageWipeGlobals(target: Window | typeof globalThis = globalThis): void {
  (target as Window).PartyGameStageWipe = PartyGameStageWipe;
}

installStageWipeGlobals(typeof window !== "undefined" ? window : globalThis);
