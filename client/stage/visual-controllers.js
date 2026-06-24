(function attachPartyGameStageVisualControllers(global) {
  "use strict";

  function isElementParked(element, hiddenClass = "hidden", parkedClass = "text-hidden") {
    return element.classList.contains(hiddenClass) || element.classList.contains(parkedClass);
  }

  class StageTextController {
    constructor(options = {}) {
      this.visualAnimation = options.visualAnimation || global.PartyGameVisualObject;
      this.gameObjectApi = options.gameObjectApi || global.PartyGameGameObject || global.PartyGameStageGameObject;
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
      const gameObject = this.gameObjectFor(object);
      if (gameObject) return gameObject.createVisual();
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

    gameObjectFor(object) {
      if (!object?.element) return null;
      const GameObject = this.gameObjectApi?.GameObject || this.gameObjectApi?.StageGameObject;
      if (!GameObject) return null;
      if (!object.gameObject || object.gameObject.target !== object.element) {
        const id = this.normalizeTextTargetId(object.element.id || object.layoutElement?.id || "text");
        object.gameObject = new GameObject({
          id,
          element: object.layoutElement || null,
          target: object.element,
          visibilityKey: `text:${id}`,
          visualOptions: {
            hiddenClasses: ["text-hidden", "hidden"],
            motionHiddenClasses: ["text-hidden"],
            displayHiddenClasses: ["hidden"],
            updateClass: "text-update",
            instantClass: "text-instant",
            layoutHiddenClasses: ["hidden", "text-hidden"]
          },
          getVisible: () => object.visible === true || !isElementParked(object.element),
          setVisible: (isVisible) => {
            object.visible = isVisible;
            object.element.dataset.visualVisible = isVisible ? "true" : "false";
          }
        });
      }
      return object.gameObject;
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
      if (nextText || isShown) element.textContent = nextText;
      if (object.layoutElement) this.applyTextProperties(element, object.layoutElement);
      element.classList.toggle("is-long", nextText.length > 62);
      element.classList.toggle("is-extra-long", nextText.length > 104);
      object.text = nextText;
      const gameObject = this.gameObjectFor(object);
      if (gameObject) return gameObject.playVisibility(isShown, { instant, complete: options.complete });
      const animation = this.visualAnimation.animationForVisibility(isShown, this.isVisible(object));
      return this.visualFor(object)?.play(animation, { instant, complete: options.complete }) || 0;
    }
  }

  class CraftingTimerController {
    constructor(options = {}) {
      this.visualAnimation = options.visualAnimation || global.PartyGameVisualObject;
      this.gameObjectApi = options.gameObjectApi || global.PartyGameGameObject || global.PartyGameStageGameObject;
      this.element = options.element;
      this.label = options.label;
      this.timerSink = typeof options.timerSink === "function" ? options.timerSink : null;
      this.getRenderedActionKey = typeof options.getRenderedActionKey === "function" ? options.getRenderedActionKey : () => "";
      this.getCurrentStageState = typeof options.getCurrentStageState === "function" ? options.getCurrentStageState : () => null;
      this.fallbackDurationMs = typeof options.fallbackDurationMs === "function" ? options.fallbackDurationMs : () => 30000;
      this.onTick = typeof options.onTick === "function" ? options.onTick : null;
      this.visual = null;
      this.visibilityRequest = null;
      this.intervalId = null;
    }

    gameObject() {
      const GameObject = this.gameObjectApi?.GameObject || this.gameObjectApi?.StageGameObject;
      if (!this.element || !GameObject) return null;
      if (!this.visual || this.visual.target !== this.element) {
        this.visual = new GameObject({
          id: this.element.id || "craftingTimer",
          target: this.element,
          visibilityKey: `widget:${this.element.id || "craftingTimer"}`,
          visualOptions: {
            hiddenClasses: ["hidden"],
            motionHiddenClasses: ["hidden"],
            instantClass: "is-instant",
            layoutHiddenClasses: ["hidden"]
          },
          timerSink: this.timerSink
        });
      }
      return this.visual;
    }

    visualObject() {
      if (!this.element || !this.visualAnimation) return null;
      const gameObject = this.gameObject();
      if (gameObject) return gameObject.createVisual();
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
      const gameObject = this.gameObject();
      if (gameObject) return gameObject.playVisibility(isShown, { instant: options.instant === true });
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
        const label = String(Math.ceil(remainingMs / 1000));
        this.label.textContent = label;
        this.onTick?.({ label, progress, timer: nextTimer });
      };
      const visibilityDuration = this.setVisible(true, { instant: options.instant === true });
      update();
      if (nextTimer.running) {
        this.intervalId = global.setInterval(update, 100);
      }
      return visibilityDuration;
    }
  }

  class PlayerAnswerBubbleController {
    constructor(options = {}) {
      this.visualAnimation = options.visualAnimation || global.PartyGameVisualObject;
      this.gameObjectApi = options.gameObjectApi || global.PartyGameGameObject || global.PartyGameStageGameObject;
      this.host = options.host;
      this.document = options.document || global.document;
      this.renderedShown = true;
      this.animationEndsAt = 0;
    }

    gameObjectFor(bubble) {
      const GameObject = this.gameObjectApi?.GameObject || this.gameObjectApi?.StageGameObject;
      if (!bubble || !GameObject) return null;
      if (!bubble.playerAnswerBubbleGameObject || bubble.playerAnswerBubbleGameObject.target !== bubble) {
        bubble.playerAnswerBubbleGameObject = new GameObject({
          id: bubble.id || bubble.dataset.answerNonce || `answer-bubble-${Math.random().toString(36).slice(2)}`,
          target: bubble,
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
          setVisible: (isVisible) => {
            bubble.dataset.visualVisible = isVisible ? "true" : "false";
          }
        });
      } else {
        bubble.playerAnswerBubbleGameObject.update({
          visibilityKey: `answer-bubble:${bubble.dataset.answerNonce || bubble.id || ""}`
        });
      }
      return bubble.playerAnswerBubbleGameObject;
    }

    visualFor(bubble) {
      if (!bubble || !this.visualAnimation) return null;
      const gameObject = this.gameObjectFor(bubble);
      if (gameObject) return gameObject.createVisual();
      if (!bubble.playerAnswerBubbleVisual || bubble.playerAnswerBubbleVisual.element !== bubble) {
        bubble.playerAnswerBubbleVisual = this.visualAnimation.createCssVisualObject({
          element: bubble,
          hiddenClasses: ["is-hidden"],
          motionHiddenClasses: ["is-hidden"],
          exitingClass: "is-exiting",
          updateClass: "is-updating",
          instantClass: "is-instant",
          getVisible: () => !bubble.classList.contains("is-hidden") && !bubble.classList.contains("is-exiting"),
          setVisible: (isVisible) => {
            bubble.dataset.visualVisible = isVisible ? "true" : "false";
          }
        });
      }
      return bubble.playerAnswerBubbleVisual;
    }

    isVisible(bubble) {
      return this.visualFor(bubble)?.isVisible() === true;
    }

    play(bubble, animation, options = {}) {
      return this.visualFor(bubble)?.play(animation, options) || 0;
    }

    applyTextFit(bubble, text) {
      const length = String(text || "").length;
      const fontSize = length > 72 ? 14 : length > 52 ? 16 : length > 34 ? 19 : length > 22 ? 23 : 28;
      bubble.style.fontSize = `${fontSize}px`;
      bubble.classList.toggle("is-long", length > 14);
    }

    removeBubble(bubble, options = {}) {
      if (!bubble) return 0;
      const duration = this.play(bubble, this.isVisible(bubble) ? "disappear" : "park", options);
      const removalToken = bubble.dataset.visualAnimationToken || "";
      const removeBubble = () => {
        if (bubble.parentElement && bubble.dataset.visualAnimationToken === removalToken) bubble.remove();
      };
      if (duration > 0) global.setTimeout(removeBubble, duration);
      else removeBubble();
      return duration;
    }

    sync(tile, player, options = {}) {
      const displayedAnswer = player?.displayedAnswer || null;
      const answerText = displayedAnswer?.text || "";
      const answerNonce = String(displayedAnswer?.nonce || "");
      const answerHidden = displayedAnswer?.hidden === true;
      let bubble = tile?.querySelector(".player-answer-bubble");
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
        bubble = this.document.createElement("div");
        bubble.className = "player-answer-bubble is-hidden";
        tile.insertBefore(bubble, tile.firstChild);
      }

      bubble.textContent = answerText;
      bubble.dataset.answerNonce = answerNonce;
      bubble.dataset.answerText = answerText;
      bubble.dataset.answerHidden = "false";
      bubble.classList.toggle("is-correct", displayedAnswer?.correct === true);
      bubble.classList.toggle("is-wrong", displayedAnswer?.correct === false);
      this.applyTextFit(bubble, answerText);

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

    bubbles() {
      return Array.from(this.host?.querySelectorAll(".player-answer-bubble") || []);
    }

    currentShown() {
      return this.renderedShown !== false;
    }

    remaining() {
      return Math.max(0, this.animationEndsAt - Date.now());
    }

    hasParkedShownBubbles() {
      return this.currentShown() && Boolean(this.host?.querySelector(".player-answer-bubble.is-hidden, .player-answer-bubble.is-exiting"));
    }

    reset() {
      this.renderedShown = true;
      this.animationEndsAt = 0;
      this.host?.classList.remove("answers-hidden");
    }

    setShown(isShown, options = {}) {
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

  global.PartyGameStageVisualControllers = {
    CraftingTimerController,
    PlayerAnswerBubbleController,
    StageTextController,
    createCraftingTimerController: (options) => new CraftingTimerController(options),
    createPlayerAnswerBubbleController: (options) => new PlayerAnswerBubbleController(options),
    createStageTextController: (options) => new StageTextController(options)
  };
})(window);
