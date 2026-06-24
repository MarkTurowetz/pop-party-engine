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
      this.defaultAnimationState = "";
      this.visual = null;
      this.artRenderer = null;
      this.syncArtRendererOnShow = false;
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
      if (options.defaultAnimationState !== undefined || options.element?.defaultAnimationState !== undefined) {
        this.defaultAnimationState = String(options.defaultAnimationState ?? options.element?.defaultAnimationState ?? "");
      }
      if (options.artRenderer !== undefined) this.artRenderer = options.artRenderer || null;
      if (options.syncArtRendererOnShow !== undefined) this.syncArtRendererOnShow = options.syncArtRendererOnShow === true;
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

    defaultVisible() {
      return defaultVisibleFor(this);
    }

    applyTargetVisibility(isShown) {
      if (!this.target) return;
      const hiddenClass = this.visualClass("hiddenClasses", "stage-layout-visual-hidden");
      const exitingClass = this.visualClass("exitingClass", "stage-layout-visual-exiting");
      this.target.dataset.visualVisible = isShown ? "true" : "false";
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

    applyVisibilityOverride() {
      if (!this.target || !this.visibilityOverrides.has(this.visibilityKey)) return;
      this.applyTargetVisibility(this.visibilityOverrides.get(this.visibilityKey) !== false);
    }

    applyDefaultVisibility() {
      if (!this.target || this.visibilityOverrides.has(this.visibilityKey)) return false;
      const isShown = this.defaultVisible();
      if (isShown === null) return false;
      this.applyTargetVisibility(isShown);
      return true;
    }

    applyVisibilityState() {
      if (!this.target) return;
      if (this.visibilityOverrides.has(this.visibilityKey)) {
        this.applyVisibilityOverride();
        return;
      }
      this.applyDefaultVisibility();
    }

    playVisibility(isShown, options = {}) {
      if (!global.PartyGameVisualObject) return 0;
      if (isShown === true && this.syncArtRendererOnShow && typeof this.artRenderer?.playAll === "function") {
        this.artRenderer.playAll("on", { instant: true });
      }
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
      for (const [key, object] of Array.from(this.objects.entries())) {
        if (object?.id === id || object?.element?.id === id) {
          this.activeIds.delete(key);
          this.objects.delete(key);
        }
      }
    }

    register(options = {}) {
      const id = options.id || options.element?.id || "";
      const registryKey = options.registryKey || id;
      if (!id) return new GameObject({
        ...options,
        visibilityOverrides: this.visibilityOverrides,
        visualOptions: this.visualOptions,
        layoutHiddenClasses: this.visualOptions.layoutHiddenClasses
      });
      this.activeIds.add(registryKey);
      const existing = this.objects.get(registryKey);
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
      this.objects.set(registryKey, object);
      return object;
    }

    get(id, options = {}) {
      const registryKey = options.registryKey || id;
      if (!registryKey || !this.activeIds.has(registryKey)) return null;
      const object = this.objects.get(registryKey) || null;
      return object?.isActive() ? object : null;
    }
  }

  function createGameObject(options = {}) {
    return new GameObject(options);
  }

  function createGameObjectRegistry(options = {}) {
    return new GameObjectRegistry(options);
  }

  function defaultVisibleFor(options = {}) {
    const state = String(options.defaultAnimationState ?? options.element?.defaultAnimationState ?? "").trim().toLowerCase();
    if (["on", "appear", "update", "visible", "shown"].includes(state)) return true;
    if (["park", "off", "disappear", "hidden", "hide"].includes(state)) return false;
    if (options.isDynamic && options.isArt) return false;
    return null;
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

  function playVisibilityForTarget(options = {}) {
    const bridge = options.visual
      ? {
          gameObject: options.gameObject || null,
          legacyVisual: options.legacyVisual || null,
          visual: options.visual
        }
      : createVisualForTarget(options);
    const visual = bridge.visual || null;
    if (!visual || !global.PartyGameVisualObject) {
      return {
        ...bridge,
        duration: 0
      };
    }
    const isShown = options.isShown !== false;
    const animation = global.PartyGameVisualObject.animationForVisibility(isShown, visual.isVisible());
    const duration = visual.play(animation, options.playOptions || {});
    return {
      ...bridge,
      duration
    };
  }

  const api = {
    create: createGameObject,
    createGameObject,
    createRegistry: createGameObjectRegistry,
    createGameObjectRegistry,
    createVisualForTarget,
    defaultVisibleFor,
    playVisibilityForTarget,
    GameObject,
    GameObjectRegistry,
    StageGameObject: GameObject,
    StageGameObjectRegistry: GameObjectRegistry
  };
  global.PartyGameGameObject = api;
  global.PartyGameStageGameObject = api;
  global.PartyGameVisualBridge = {
    createVisualForTarget,
    playVisibilityForTarget
  };
})(window);
