// Authored Art Manager widget controller for the full-screen stage wipe. Wipe
// Widget MC is only an On/Off gate. Set Wipe Shown invokes Wipe Art MC's
// lifecycle directly and completes only from that explicitly targeted child.

type Dict = Record<string, unknown>;

interface TimelineRenderer {
  playAll?: (animation: string, options?: Dict) => number;
  playComponent?: (componentId: string, animation: string, options?: Dict) => number;
  stopAtComponent?: (componentId: string, animation: string, options?: Dict) => number;
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
const WIPE_ART_COMPONENT_ID = "wipe-art-reference";

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
  activeAnimationToken = "";
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
    if (this.desiredShown === nextShown) {
      complete?.();
      return 0;
    }
    const renderer = this.widgetRenderer();

    if (!renderer?.playComponent || !renderer.stopAtAll) {
      this.activeAnimation = "";
      return 0;
    }

    this.desiredShown = nextShown;
    const animation = nextShown ? (instant ? "On" : "Appear") : instant ? "Off" : "Disappear";
    const token = transitionToken();
    this.activeAnimation = animation;
    this.activeAnimationToken = token;
    renderer.stopAtAll("On", { instant: true });
    this.setVisibleState(true);
    let finished = false;
    const finish = () => {
      if (finished || this.activeAnimationToken !== token) return;
      finished = true;
      this.activeAnimation = "";
      if (!nextShown) renderer.stopAtAll?.("Off", { instant: true });
      this.setVisibleState(nextShown);
      complete?.();
    };
    const duration = Number(renderer.playComponent(WIPE_ART_COMPONENT_ID, animation, { instant, complete: finish }) || 0);
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
    this.activeAnimationToken = transitionToken();
    this.activeAnimation = "";
    this.desiredShown = false;
    const renderer = this.widgetRenderer();
    renderer?.stopAtComponent?.(WIPE_ART_COMPONENT_ID, "Off", { instant: true });
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
