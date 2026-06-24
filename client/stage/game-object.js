(function attachPartyGameStageGameObject(global) {
  "use strict";

  class StageGameObject {
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
      this.visibilityOverrides = options.visibilityOverrides || new Map();
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
      if (options.visibilityOverrides) this.visibilityOverrides = options.visibilityOverrides;
      return this;
    }

    isActive() {
      return this.target?.isConnected !== false;
    }

    createVisual() {
      if (this.visual?.element === this.target) return this.visual;
      if (!this.target || !global.PartyGameVisualObject) return null;
      const options = this.visualOptions || {};
      this.visual = global.PartyGameVisualObject.createCssVisualObject({
        element: this.target,
        hiddenClasses: options.hiddenClasses || ["stage-layout-visual-hidden"],
        motionHiddenClasses: options.motionHiddenClasses || options.hiddenClasses || ["stage-layout-visual-hidden"],
        exitingClass: options.exitingClass || "stage-layout-visual-exiting",
        updateClass: options.updateClass || "stage-layout-visual-update",
        instantClass: options.instantClass || "stage-layout-visual-instant",
        getVisible: () => this.isVisible(),
        setVisible: (isVisible) => this.setVisible(isVisible)
      });
      return this.visual;
    }

    isVisible() {
      if (!this.target) return false;
      if (this.visibilityOverrides.has(this.visibilityKey)) {
        return this.visibilityOverrides.get(this.visibilityKey) === true;
      }
      return this.target.dataset.visualVisible === "true"
        || (!this.target.classList.contains("stage-layout-visual-hidden")
          && !this.target.classList.contains("stage-layout-visual-exiting")
          && !this.target.classList.contains("stage-layout-hidden"));
    }

    setVisible(isVisible) {
      if (!this.target) return;
      this.visibilityOverrides.set(this.visibilityKey, isVisible === true);
      this.target.dataset.visualVisible = isVisible ? "true" : "false";
    }

    applyVisibilityOverride() {
      if (!this.target || !this.visibilityOverrides.has(this.visibilityKey)) return;
      const isShown = this.visibilityOverrides.get(this.visibilityKey) !== false;
      this.target.dataset.visualVisible = isShown ? "true" : "false";
      if (isShown) {
        this.target.classList.remove("stage-layout-visual-hidden", "stage-layout-visual-exiting");
        return;
      }
      if (!this.target.classList.contains("stage-layout-visual-exiting")) {
        this.target.classList.add("stage-layout-visual-hidden");
      }
    }

    playVisibility(isShown, options = {}) {
      if (!global.PartyGameVisualObject) return 0;
      this.visibilityOverrides.set(this.visibilityKey, isShown === true);
      const visual = this.createVisual();
      if (!visual) return 0;
      const animation = global.PartyGameVisualObject.animationForVisibility(isShown === true, visual.isVisible());
      return visual.play(animation, options);
    }
  }

  class StageGameObjectRegistry {
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
      if (!id) return new StageGameObject({
        ...options,
        visibilityOverrides: this.visibilityOverrides,
        visualOptions: this.visualOptions
      });
      this.activeIds.add(id);
      const existing = this.objects.get(id);
      if (existing) {
        existing.update({
          ...options,
          visibilityOverrides: this.visibilityOverrides,
          visualOptions: this.visualOptions
        });
        return existing;
      }
      const object = new StageGameObject({
        ...options,
        visibilityOverrides: this.visibilityOverrides,
        visualOptions: this.visualOptions
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

  global.PartyGameStageGameObject = {
    StageGameObject,
    StageGameObjectRegistry
  };
})(window);
