(function attachPartyGameStageWipe(global) {
  "use strict";

  const WipeMotionMs = 460;
  const WipeLineStaggerMs = 24;

  function transitionToken() {
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  class StageWipeController {
    constructor(options = {}) {
      this.element = options.element || null;
      this.visualAnimation = options.visualAnimation || global.PartyGameVisualObject;
      this.gameObjectApi = options.gameObjectApi || global.PartyGameGameObject || global.PartyGameStageGameObject;
      this.gameObject = null;
      this.visual = null;
      this.targetShown = false;
      this.visibilityRequest = null;
      this.activeTransitionToken = "";
    }

    lineCount() {
      return this.element?.querySelectorAll(".wipe-line").length || 7;
    }

    motionDuration(instant = false) {
      if (instant) return 0;
      return WipeMotionMs + Math.max(0, this.lineCount() - 1) * WipeLineStaggerMs;
    }

    setVisibleState(isVisible) {
      this.targetShown = isVisible === true;
      if (this.element) this.element.dataset.wipeShown = this.targetShown ? "true" : "false";
    }

    isVisuallyPresent() {
      if (!this.element || this.element.classList.contains("hidden")) return false;
      if (this.targetShown === true) return true;
      return this.element.classList.contains("is-entering")
        || this.element.classList.contains("is-covered")
        || this.element.classList.contains("is-exiting");
    }

    resetHidden() {
      if (!this.element) return;
      this.element.classList.add("hidden");
      this.element.classList.remove("is-entering", "is-covered", "is-exiting", "is-instant");
      this.setVisibleState(false);
    }

    resetCovered() {
      if (!this.element) return;
      this.element.classList.remove("hidden", "is-entering", "is-exiting", "is-instant");
      this.element.classList.add("is-covered");
      this.setVisibleState(true);
    }

    visualObject() {
      if (!this.element || !this.visualAnimation) return null;
      const visualOptions = this.visualOptions();
      const bridge = this.gameObjectApi?.createVisualForTarget?.({
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
          setVisible: (isVisible) => this.setVisibleState(isVisible)
        },
        legacyVisualOptions: {
          ...this.visualOptions(),
          getVisible: () => this.isVisuallyPresent(),
          setVisible: (isVisible) => this.setVisibleState(isVisible)
        }
      });
      this.gameObject = bridge?.gameObject || this.gameObject;
      this.visual = bridge?.visual || bridge?.legacyVisual || this.visual;
      return this.visual;
    }

    visualOptions() {
      return {
        hiddenClasses: ["hidden"],
        instantClass: "is-instant",
        durations: {
          appear: this.motionDuration(false),
          disappear: this.motionDuration(false)
        },
        animationHandlers: {
          appear: (api) => this.playAppear(api),
          disappear: (api) => this.playDisappear(api),
          off: () => this.playOff(),
          on: () => this.playOn(),
          park: () => this.playOff(),
          update: () => this.playUpdate()
        }
      };
    }

    playAppear(api) {
      if (!api.element) return 0;
      api.removeClasses(["hidden", "is-entering", "is-covered", "is-exiting"]);
      api.setVisibleState(true);
      if (api.instant) {
        this.resetCovered();
        return 0;
      }
      void api.element.offsetWidth;
      api.addClasses("is-entering");
      api.schedule(api.duration, () => {
        if (!api.tokenMatches()) return;
        this.resetCovered();
      });
      return api.duration;
    }

    playDisappear(api) {
      if (!api.element) return 0;
      if (api.instant) {
        this.resetHidden();
        return 0;
      }
      api.removeClasses("hidden");
      api.setVisibleState(false);
      api.removeClasses(["is-entering", "is-covered"]);
      api.addClasses("is-exiting");
      api.schedule(api.duration, () => {
        if (!api.tokenMatches()) return;
        this.resetHidden();
      });
      return api.duration;
    }

    playOn() {
      this.resetCovered();
      return 0;
    }

    playOff() {
      this.resetHidden();
      return 0;
    }

    playUpdate() {
      if (!this.element) return 0;
      if (this.element.classList.contains("is-entering") || this.element.classList.contains("is-covered")) {
        this.setVisibleState(true);
        return 0;
      }
      this.resetCovered();
      return 0;
    }

    setShown(isShown, options = {}) {
      const visual = this.visualObject();
      if (!visual || !this.visualAnimation) {
        this.element?.classList.toggle("hidden", isShown === false);
        this.setVisibleState(isShown !== false);
        return 0;
      }
      const nextShown = isShown !== false;
      const animation = this.visualAnimation.animationForVisibility(nextShown, visual.isVisible());
      return visual.play(animation, {
        complete: options.complete,
        instant: options.instant === true
      });
    }

    setShownForAction(action, options = {}) {
      const actionKey = options.actionKey || "";
      this.visibilityRequest = {
        actionKey,
        isShown: action?.isShown !== false
      };
      return this.setShown(action?.isShown !== false, { instant: action?.instant === true });
    }

    syncShown(isShown, options = {}) {
      const actionKey = options.actionKey || "";
      const request = this.visibilityRequest && this.visibilityRequest.actionKey === actionKey
        ? this.visibilityRequest
        : null;
      const targetShown = request ? request.isShown : isShown !== false;
      return this.setShown(targetShown, { instant: options.instant === true });
    }

    clearRequest(actionKey = "") {
      if (!this.visibilityRequest) return;
      if (!actionKey || this.visibilityRequest.actionKey !== actionKey) {
        this.visibilityRequest = null;
      }
    }

    transition(onCovered) {
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

    cancel() {
      this.visibilityRequest = null;
      this.activeTransitionToken = transitionToken();
      const visual = this.visualObject();
      if (visual) visual.play("park", { instant: true });
      else this.resetHidden();
    }
  }

  global.PartyGameStageWipe = {
    createController: (options) => new StageWipeController(options),
    WipeLineStaggerMs,
    WipeMotionMs
  };
})(window);
