(function attachPartyGameStageVisualControllers(global) {
  "use strict";

  function isElementParked(element, hiddenClass = "hidden", parkedClass = "text-hidden") {
    return element.classList.contains(hiddenClass) || element.classList.contains(parkedClass);
  }

  class StageTextController {
    constructor(options = {}) {
      this.visualAnimation = options.visualAnimation || global.PartyGameVisualObject;
      this.queryTextElements = typeof options.queryTextElements === "function" ? options.queryTextElements : () => [];
      this.normalizeTextTargetId = typeof options.normalizeTextTargetId === "function" ? options.normalizeTextTargetId : (value) => String(value || "");
      this.applyTextProperties = typeof options.applyTextProperties === "function" ? options.applyTextProperties : () => {};
      this.timerSink = typeof options.timerSink === "function" ? options.timerSink : null;
      this.setObjects = typeof options.setObjects === "function" ? options.setObjects : () => {};
      this.defaultElements = options.defaultElements || {};
      this.objects = options.objects || {};
    }

    createObject(element, extra = {}) {
      return {
        element,
        visible: false,
        text: "",
        ...extra
      };
    }

    init() {
      const objects = {};
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

    objectFor(target) {
      const normalized = this.normalizeTextTargetId(target);
      return this.objects[normalized] || this.objects[target] || this.objects.presentation || null;
    }

    visualFor(object) {
      if (!object?.element || !this.visualAnimation) return null;
      if (!object.visual || object.visual.element !== object.element) {
        object.visual = this.visualAnimation.createCssVisualObject({
          element: object.element,
          hiddenClasses: ["text-hidden", "hidden"],
          motionHiddenClasses: ["text-hidden"],
          displayHiddenClasses: ["hidden"],
          updateClass: "text-update",
          instantClass: "text-instant",
          getVisible: () => object.visible === true || !isElementParked(object.element),
          setVisible: (isVisible) => {
            object.visible = isVisible;
            object.element.dataset.visualVisible = isVisible ? "true" : "false";
          },
          timerSink: this.timerSink
        });
      }
      return object.visual;
    }

    isVisible(object) {
      return this.visualFor(object)?.isVisible() === true;
    }

    set(target, options = {}) {
      const object = this.objectFor(target);
      if (!object) return 0;
      const element = object.element;
      const nextText = options.text ?? object.text ?? "";
      const isShown = options.isShown !== false;
      const instant = options.instant === true;
      const animation = this.visualAnimation.animationForVisibility(isShown, this.isVisible(object));
      if (nextText || isShown) element.textContent = nextText;
      if (object.layoutElement) this.applyTextProperties(element, object.layoutElement);
      element.classList.toggle("is-long", nextText.length > 62);
      element.classList.toggle("is-extra-long", nextText.length > 104);
      object.text = nextText;
      return this.visualFor(object)?.play(animation, { instant, complete: options.complete }) || 0;
    }
  }

  class CraftingTimerController {
    constructor(options = {}) {
      this.visualAnimation = options.visualAnimation || global.PartyGameVisualObject;
      this.element = options.element;
      this.label = options.label;
      this.timerSink = typeof options.timerSink === "function" ? options.timerSink : null;
      this.getRenderedActionKey = typeof options.getRenderedActionKey === "function" ? options.getRenderedActionKey : () => "";
      this.getCurrentStageState = typeof options.getCurrentStageState === "function" ? options.getCurrentStageState : () => null;
      this.fallbackDurationMs = typeof options.fallbackDurationMs === "function" ? options.fallbackDurationMs : () => 30000;
      this.visual = null;
      this.visibilityRequest = null;
      this.intervalId = null;
    }

    visualObject() {
      if (!this.element || !this.visualAnimation) return null;
      if (!this.visual) {
        this.visual = this.visualAnimation.createCssVisualObject({
          element: this.element,
          hiddenClasses: ["hidden"],
          motionHiddenClasses: ["hidden"],
          instantClass: "is-instant",
          timerSink: this.timerSink
        });
      }
      return this.visual;
    }

    clearRequest(actionKey = "") {
      if (!this.visibilityRequest) return;
      if (!actionKey || this.visibilityRequest.actionKey !== actionKey) {
        this.visibilityRequest = null;
      }
    }

    clearInterval() {
      global.clearInterval(this.intervalId);
      this.intervalId = null;
    }

    reset() {
      this.clearInterval();
      this.visibilityRequest = null;
      return this.setVisible(false, { instant: true });
    }

    payloadWithVisibilityRequest(timer = {}) {
      if (!this.visibilityRequest || this.visibilityRequest.actionKey !== this.getRenderedActionKey()) return timer;
      if (this.visibilityRequest.isShown === false) {
        return {
          ...timer,
          shown: false,
          running: false
        };
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

    setVisible(isShown, options = {}) {
      const visual = this.visualObject();
      if (!visual) {
        this.element?.classList.toggle("hidden", !isShown);
        return 0;
      }
      const animation = this.visualAnimation.animationForVisibility(isShown, visual.isVisible());
      return visual.play(animation, { instant: options.instant === true });
    }

    setShownForAction(action, options = {}) {
      const actionKey = options.actionKey || this.getRenderedActionKey();
      this.visibilityRequest = {
        actionKey,
        isShown: action?.isShown !== false
      };
      const timer = this.payloadWithVisibilityRequest(this.getCurrentStageState()?.craftingTimer || {});
      return this.render(timer, { instant: action?.instant === true });
    }

    render(timer, options = {}) {
      const nextTimer = this.payloadWithVisibilityRequest(timer || {});
      this.clearInterval();
      if (!this.element || !this.label || !nextTimer?.shown) {
        return this.setVisible(false, { instant: options.instant === true });
      }
      const durationMs = Math.max(1, Number(nextTimer.durationMs || 1));
      const currentStageState = this.getCurrentStageState();
      const clockOffset = (nextTimer.serverNow || currentStageState?.serverNow || Date.now()) - Date.now();
      const update = () => {
        const now = Date.now() + clockOffset;
        const remainingMs = nextTimer.running
          ? Math.max(0, Number(nextTimer.endsAt || now) - now)
          : Math.max(0, Number(nextTimer.remainingMs || 0));
        const progress = Math.max(0, Math.min(1, remainingMs / durationMs));
        this.element.style.setProperty("--timer-progress", progress.toFixed(4));
        this.label.textContent = String(Math.ceil(remainingMs / 1000));
      };
      const visibilityDuration = this.setVisible(true, { instant: options.instant === true });
      update();
      if (nextTimer.running) {
        this.intervalId = global.setInterval(update, 100);
      }
      return visibilityDuration;
    }
  }

  global.PartyGameStageVisualControllers = {
    CraftingTimerController,
    StageTextController,
    createCraftingTimerController: (options) => new CraftingTimerController(options),
    createStageTextController: (options) => new StageTextController(options)
  };
})(window);
