// Authored Art Manager widget controller for the full-screen stage wipe. The
// Wipe Widget MC parent timeline is the only lifecycle callback target; its
// command frames start the nested Wipe Art MC without letting child callbacks
// advance the game flow.

type Dict = Record<string, unknown>;

interface TimelineRenderer {
  playAll?: (animation: string, options?: Dict) => number;
  stopAtAll?: (animation: string, options?: Dict) => number;
}

declare global {
  interface Window {
    PartyGameStageWipe?: typeof PartyGameStageWipe;
  }
}

// Compatibility metadata only. Runtime flow completion comes exclusively from
// the authored parent timeline callback, never from these values.
const WipeMotionMs = 667;
const WipeLineStaggerMs = 33;

function transitionToken(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

class StageWipeController {
  element: HTMLElement | null;
  renderArt: (() => Dict | null) | null;
  timelineRenderer: TimelineRenderer | null = null;
  targetShown = false;
  desiredShown = false;
  activeAnimation = "";
  visibilityRequest: { actionKey: string; isShown: boolean } | null = null;
  activeTransitionToken = "";

  constructor(options: Dict = {}) {
    this.element = (options.element as HTMLElement) || null;
    this.renderArt = typeof options.renderArt === "function" ? (options.renderArt as () => Dict | null) : null;
  }

  motionDuration(instant = false): number {
    return instant ? 0 : WipeMotionMs;
  }

  widgetRenderer(): TimelineRenderer | null {
    if (this.timelineRenderer) return this.timelineRenderer;
    const result = this.renderArt?.() || null;
    this.timelineRenderer = (result?.renderer as TimelineRenderer) || null;
    if (this.timelineRenderer && this.element) {
      this.element.classList.remove("hidden", "is-entering", "is-covered", "is-exiting", "is-instant");
    }
    return this.timelineRenderer;
  }

  setVisibleState(isVisible: boolean): void {
    this.targetShown = isVisible === true;
    if (!this.element) return;
    this.element.dataset.wipeShown = this.targetShown ? "true" : "false";
    this.element.setAttribute("aria-hidden", this.targetShown ? "false" : "true");
  }

  isVisuallyPresent(): boolean {
    return this.targetShown || this.activeAnimation === "Appear" || this.activeAnimation === "Disappear";
  }

  setShown(isShown: boolean, options: Dict = {}): number {
    const nextShown = isShown !== false;
    const instant = options.instant === true;
    const complete = typeof options.complete === "function" ? (options.complete as () => void) : null;
    const renderer = this.widgetRenderer();
    this.desiredShown = nextShown;

    if (!renderer?.playAll) {
      this.activeAnimation = "";
      return 0;
    }

    const animation = nextShown ? (instant ? "On" : "Appear") : instant ? "Off" : "Disappear";
    this.activeAnimation = animation;
    if (nextShown) this.setVisibleState(true);
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      this.activeAnimation = "";
      this.setVisibleState(nextShown);
      complete?.();
    };
    const duration = Number(renderer.playAll(animation, { instant, complete: finish }) || 0);
    return duration;
  }

  setShownForAction(action: Dict, options: Dict = {}): number {
    const actionKey = (options.actionKey as string) || "";
    this.visibilityRequest = { actionKey, isShown: action?.isShown !== false };
    return this.setShown(action?.isShown !== false, { instant: action?.instant === true, complete: options.complete });
  }

  clearRequest(actionKey = ""): void {
    if (!this.visibilityRequest) return;
    if (!actionKey || this.visibilityRequest.actionKey !== actionKey) this.visibilityRequest = null;
  }

  transition(onCovered?: () => void, complete?: () => void): number {
    this.visibilityRequest = null;
    this.activeTransitionToken = transitionToken();
    const token = this.activeTransitionToken;
    return this.setShown(true, {
      complete: () => {
        if (this.activeTransitionToken !== token) return;
        if (typeof onCovered === "function") onCovered();
        this.setShown(false, { complete });
      }
    });
  }

  cancel(): void {
    this.visibilityRequest = null;
    this.activeTransitionToken = transitionToken();
    this.activeAnimation = "";
    this.desiredShown = false;
    const renderer = this.widgetRenderer();
    if (renderer?.stopAtAll) renderer.stopAtAll("Off", { instant: true });
    else this.element?.classList.add("hidden");
    this.setVisibleState(false);
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
