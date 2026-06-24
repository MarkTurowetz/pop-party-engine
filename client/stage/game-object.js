(function attachPartyGameGameObject(global) {
  "use strict";

  class GameObject {
    constructor(options = {}) {
      this.id = "";
      this.element = null;
      this.target = null;
      this.isArt = false;
      this.isDynamic = false;
      this.isGlobal = false;
      this.visibilityKey = "";
      this.visual = null;
      this.visualOptions = options.visualOptions || {};
      this.layoutHiddenClasses = options.layoutHiddenClasses || this.visualOptions.layoutHiddenClasses || ["stage-layout-hidden"];
      this.visibilityOverrides = options.visibilityOverrides || new Map();
      this.getVisible = typeof options.getVisible === "function" ? options.getVisible : null;
      this.setVisibleHandler = typeof options.setVisible === "function" ? options.setVisible : null;
      this.timerSink = typeof options.timerSink === "function" ? options.timerSink : null;
      this.visualOptionsKey = "";
      this.update(options);
    }

    update(options = {}) {
      this.id = options.id || options.element?.id || this.id || "";
      this.element = options.element || this.element;
      this.target = options.target || this.target;
      this.isArt = options.isArt === true;
      this.isDynamic = options.isDynamic === true;
      this.isGlobal = options.isGlobal === true;
      this.visibilityKey = options.visibilityKey || this.visibilityKey || this.id;
      if (options.visualOptions) this.visualOptions = options.visualOptions;
      if (options.layoutHiddenClasses) this.layoutHiddenClasses = options.layoutHiddenClasses;
      if (options.visibilityOverrides) this.visibilityOverrides = options.visibilityOverrides;
      if (typeof options.getVisible === "function") this.getVisible = options.getVisible;
      if (typeof options.setVisible === "function") this.setVisibleHandler = options.setVisible;
      if (typeof options.timerSink === "function") this.timerSink = options.timerSink;
      return this;
    }

    isActive() {
      return this.target?.isConnected !== false;
    }

    createVisual() {
      if (!this.target || !global.PartyGameVisualObject) return null;
      const options = this.visualOptions || {};
      const nextVisualOptionsKey = JSON.stringify({
        animationHandlers: Object.keys(options.animationHandlers || {}),
        displayHiddenClasses: options.displayHiddenClasses || [],
        durations: options.durations || {},
        exitingClass: options.exitingClass || "",
        hiddenClasses: options.hiddenClasses || [],
        instantClass: options.instantClass || "",
        motionHiddenClasses: options.motionHiddenClasses || [],
        transformOrigin: options.transformOrigin ?? "center center",
        updateClass: options.updateClass || ""
      });
      if (this.visual?.element === this.target && this.visualOptionsKey === nextVisualOptionsKey) return this.visual;
      this.visualOptionsKey = nextVisualOptionsKey;
      this.visual = global.PartyGameVisualObject.createCssVisualObject({
        element: this.target,
        hiddenClasses: options.hiddenClasses || ["stage-layout-visual-hidden"],
        motionHiddenClasses: options.motionHiddenClasses || options.hiddenClasses || ["stage-layout-visual-hidden"],
        displayHiddenClasses: options.displayHiddenClasses,
        exitingClass: options.exitingClass || "stage-layout-visual-exiting",
        updateClass: options.updateClass || "stage-layout-visual-update",
        instantClass: options.instantClass || "stage-layout-visual-instant",
        durations: options.durations,
        animationHandlers: options.animationHandlers,
        transformOrigin: options.transformOrigin,
        getVisible: () => this.isVisible(),
        setVisible: (isVisible) => this.setVisible(isVisible),
        timerSink: this.timerSink
      });
      return this.visual;
    }

    visualClass(name, fallback) {
      const value = this.visualOptions?.[name] ?? fallback;
      return Array.isArray(value) ? value[0] : value;
    }

    hasClass(className) {
      return Boolean(className && this.target?.classList.contains(className));
    }

    isVisible() {
      if (!this.target) return false;
      const hiddenClass = this.visualClass("hiddenClasses", "stage-layout-visual-hidden");
      const exitingClass = this.visualClass("exitingClass", "stage-layout-visual-exiting");
      const layoutHiddenClasses = this.layoutHiddenClasses || [];
      if (this.visibilityOverrides.has(this.visibilityKey)) {
        return this.visibilityOverrides.get(this.visibilityKey) === true;
      }
      if (this.getVisible) return this.getVisible() === true;
      return this.target.dataset.visualVisible === "true"
        || (!this.hasClass(hiddenClass)
          && !this.hasClass(exitingClass)
          && !layoutHiddenClasses.some((className) => this.hasClass(className)));
    }

    setVisible(isVisible) {
      if (!this.target) return;
      this.visibilityOverrides.set(this.visibilityKey, isVisible === true);
      this.target.dataset.visualVisible = isVisible ? "true" : "false";
      if (this.setVisibleHandler) this.setVisibleHandler(isVisible === true);
    }

    applyVisibilityOverride() {
      if (!this.target || !this.visibilityOverrides.has(this.visibilityKey)) return;
      const isShown = this.visibilityOverrides.get(this.visibilityKey) !== false;
      const hiddenClass = this.visualClass("hiddenClasses", "stage-layout-visual-hidden");
      const exitingClass = this.visualClass("exitingClass", "stage-layout-visual-exiting");
      this.target.dataset.visualVisible = isShown ? "true" : "false";
      if (isShown) {
        this.target.classList.remove(hiddenClass, exitingClass);
        return;
      }
      if (!this.hasClass(exitingClass)) {
        this.target.classList.add(hiddenClass);
      }
    }

    playVisibility(isShown, options = {}) {
      if (!global.PartyGameVisualObject) return 0;
      const visual = this.createVisual();
      if (!visual) return 0;
      const animation = global.PartyGameVisualObject.animationForVisibility(isShown === true, visual.isVisible());
      return visual.play(animation, options);
    }
  }

  class GameObjectRegistry {
    constructor(options = {}) {
      this.objects = new Map();
      this.activeIds = new Set();
      this.visibilityOverrides = options.visibilityOverrides || new Map();
      this.visualOptions = options.visualOptions || {};
    }

    beginFrame() {
      this.activeIds.clear();
    }

    remove(id) {
      if (!id) return;
      this.activeIds.delete(id);
      this.objects.delete(id);
    }

    register(options = {}) {
      const id = options.id || options.element?.id || "";
      if (!id) return new GameObject({
        ...options,
        visibilityOverrides: this.visibilityOverrides,
        visualOptions: this.visualOptions,
        layoutHiddenClasses: this.visualOptions.layoutHiddenClasses
      });
      this.activeIds.add(id);
      const existing = this.objects.get(id);
      if (existing) {
        existing.update({
          ...options,
          visibilityOverrides: this.visibilityOverrides,
          visualOptions: this.visualOptions,
          layoutHiddenClasses: this.visualOptions.layoutHiddenClasses
        });
        return existing;
      }
      const object = new GameObject({
        ...options,
        visibilityOverrides: this.visibilityOverrides,
        visualOptions: this.visualOptions,
        layoutHiddenClasses: this.visualOptions.layoutHiddenClasses
      });
      this.objects.set(id, object);
      return object;
    }

    get(id) {
      if (!id || !this.activeIds.has(id)) return null;
      const object = this.objects.get(id) || null;
      return object?.isActive() ? object : null;
    }
  }

  function createGameObject(options = {}) {
    return new GameObject(options);
  }

  function createGameObjectRegistry(options = {}) {
    return new GameObjectRegistry(options);
  }

  function createVisualForTarget(options = {}) {
    const target = options.target || null;
    const gameObjectApi = options.gameObjectApi || api;
    const visualAnimation = options.visualAnimation || global.PartyGameVisualObject;
    let gameObject = options.gameObject || null;
    let legacyVisual = options.legacyVisual || null;
    if (target && typeof gameObjectApi?.create === "function") {
      const gameObjectOptions = options.gameObjectOptions || {};
      if (!gameObject || gameObject.target !== target || gameObject.id !== gameObjectOptions.id) {
        gameObject = gameObjectApi.create({
          ...gameObjectOptions,
          target
        });
      } else {
        gameObject.update(gameObjectOptions);
      }
      return {
        gameObject,
        legacyVisual,
        visual: gameObject.createVisual()
      };
    }
    if (!target || !visualAnimation) {
      return { gameObject, legacyVisual, visual: null };
    }
    if (!legacyVisual || legacyVisual.element !== target) {
      legacyVisual = visualAnimation.createLegacyCssVisualObject({
        element: target,
        ...(options.legacyVisualOptions || {})
      });
    }
    return {
      gameObject,
      legacyVisual,
      visual: legacyVisual
    };
  }

  const api = {
    create: createGameObject,
    createGameObject,
    createRegistry: createGameObjectRegistry,
    createGameObjectRegistry,
    createVisualForTarget,
    GameObject,
    GameObjectRegistry,
    StageGameObject: GameObject,
    StageGameObjectRegistry: GameObjectRegistry
  };
  global.PartyGameGameObject = api;
  global.PartyGameStageGameObject = api;
  global.PartyGameVisualBridge = {
    createVisualForTarget
  };
})(window);
