(function attachPartyGameArtObject(global) {
  const RUNTIME_CLASS = "art-runtime-object";
  const HIDDEN_CLASS = "art-runtime-object-hidden";
  const EXITING_CLASS = "art-runtime-object-exiting";
  const UPDATE_CLASS = "art-runtime-object-update";
  const INSTANT_CLASS = "art-runtime-object-instant";
  const componentSchema = global.PartyGameArtComponentSchema;
  let artTreeInstanceCounter = 1;

  function applyComponentLayout(element, component, canvas) {
    if (!element || !component) return;
    const canvasWidth = Math.max(1, Number(canvas?.width || 1));
    const canvasHeight = Math.max(1, Number(canvas?.height || 1));
    element.style.left = `${Number(component.x || 0) / canvasWidth * 100}%`;
    element.style.top = `${Number(component.y || 0) / canvasHeight * 100}%`;
    element.style.width = `${Number(component.width || 1) / canvasWidth * 100}%`;
    element.style.height = `${Number(component.height || 1) / canvasHeight * 100}%`;
    element.style.setProperty("--component-scale", Number(component.scale || 1));
    element.style.setProperty("--component-rotation", `${Number(component.rotation || 0)}deg`);
    element.style.setProperty("--component-font-size", `${componentFontSize(component)}px`);
    element.style.setProperty("--component-text-color", component.fontColor || "#17131f");
    element.style.setProperty("--component-fill-color", component.fillColor || "transparent");
    element.style.setProperty("--component-fill-css", componentSchema.normalizeFillCss(component.fillCss) || component.fillColor || "transparent");
    element.style.setProperty("--component-border-color", component.borderColor || "transparent");
    element.style.setProperty("--component-border-width", `${Number(component.borderWidth || 0)}px`);
    element.style.setProperty("--component-border-radius", `${Number(component.borderRadius || 0)}px`);
    element.style.setProperty("--component-image-fit", componentSchema.normalizeImageObjectFit(component.imageObjectFit));
  }

  function componentFontSize(component) {
    const baseSize = Number(component?.fontSize || 16);
    if (component?.autoFitText !== true || typeof global.fittedLayoutTextSize !== "function") return baseSize;
    return global.fittedLayoutTextSize(component, componentSchema.componentLabel(component), baseSize);
  }

  function componentImageSource(component) {
    return componentSchema.componentImageMaskDataUrl(component) || global.artAssetUrl?.(component?.imageAssetId) || "";
  }

  function componentLayerIndex(index, siblingCount) {
    return Math.max(1, Number(siblingCount || 1) - Number(index || 0));
  }

  function artComponentViewKey(component, index, counts) {
    const rawId = String(component?.id || "").trim();
    const baseKey = rawId || `component-${Number(index || 0)}`;
    const count = Number(counts?.get(baseKey) || 0);
    counts?.set(baseKey, count + 1);
    return count > 0 ? `${baseKey}::${count}` : baseKey;
  }

  class ArtObjectView {
    constructor(options = {}) {
      this.document = options.document || global.document;
      this.visualAnimation = options.visualAnimation || global.PartyGameVisualObject;
      this.gameObjectApi = options.gameObjectApi || global.PartyGameGameObject || global.PartyGameStageGameObject;
      this.instanceId = String(options.instanceId || "");
      this.component = null;
      this.children = new Map();
      this.element = this.document.createElement("div");
      this.image = this.document.createElement("img");
      this.image.className = "art-runtime-object-image";
      this.image.alt = "";
      this.image.draggable = false;
      this.label = this.document.createElement("span");
      this.label.className = "art-runtime-object-label";
      this.element.appendChild(this.image);
      this.element.appendChild(this.label);
      this.gameObject = null;
      this.visual = null;
      if (options.component) this.update(options.component, options.canvas, options.layer);
    }

    gameObjectId() {
      const componentId = this.component?.id || this.element.dataset.artComponentId || "";
      return `art-component:${this.instanceId || "default"}:${componentId}`;
    }

    createVisual() {
      const id = this.gameObjectId();
      const bridge = global.PartyGameVisualBridge?.createVisualForTarget?.({
        gameObjectApi: this.gameObjectApi,
        visualAnimation: this.visualAnimation,
        target: this.element,
        gameObject: this.gameObject,
        legacyVisual: this.visual,
        gameObjectOptions: {
          id,
          visibilityKey: id,
          isArt: true,
          visualOptions: {
            hiddenClasses: [HIDDEN_CLASS],
            motionHiddenClasses: [HIDDEN_CLASS],
            exitingClass: EXITING_CLASS,
            updateClass: UPDATE_CLASS,
            instantClass: INSTANT_CLASS,
            layoutHiddenClasses: [HIDDEN_CLASS, EXITING_CLASS]
          }
        },
        legacyVisualOptions: {
          hiddenClasses: [HIDDEN_CLASS],
          motionHiddenClasses: [HIDDEN_CLASS],
          exitingClass: EXITING_CLASS,
          updateClass: UPDATE_CLASS,
          instantClass: INSTANT_CLASS
        }
      });
      this.gameObject = bridge?.gameObject || this.gameObject;
      this.visual = bridge?.visual || bridge?.legacyVisual || this.visual;
      return this.visual;
    }

    isVisible() {
      return this.createVisual()?.isVisible() === true;
    }

    update(component, canvas, layer = {}) {
      this.component = component || {};
      const kind = componentSchema.normalizeComponentKind(this.component.kind);
      const wasVisible = this.visual ? this.isVisible() : true;
      this.element.className = `${RUNTIME_CLASS} is-${kind} is-style-${componentSchema.normalizeShapeStyle(this.component.shapeStyle, kind)}`;
      this.element.dataset.artComponentId = this.component.id || "";
      if (!wasVisible) this.element.classList.add(HIDDEN_CLASS);
      this.element.style.zIndex = String(componentLayerIndex(layer.index, layer.total));
      const imageSource = componentImageSource(this.component);
      this.element.classList.toggle("has-image-mask", Boolean(imageSource));
      this.element.classList.toggle("has-tinted-image-mask", Boolean(imageSource && this.component.imageTint === "currentColor"));
      this.image.hidden = !imageSource;
      this.label.hidden = Boolean(imageSource);
      if (imageSource) {
        if (this.image.getAttribute("src") !== imageSource) this.image.src = imageSource;
        this.element.style.setProperty("--component-mask-url", `url('${String(imageSource).replaceAll("'", "%27")}')`);
      } else {
        this.image.removeAttribute("src");
        this.element.style.removeProperty("--component-mask-url");
      }
      this.label.textContent = componentSchema.componentLabel(this.component);
      applyComponentLayout(this.element, this.component, canvas);
      this.renderChildren(this.component.children || []);
    }

    renderChildren(children) {
      const childCanvas = {
        width: Number(this.component?.width || 1),
        height: Number(this.component?.height || 1)
      };
      const counts = new Map();
      const keyedChildren = (children || []).map((child, index) => ({
        child,
        index,
        key: artComponentViewKey(child, index, counts)
      }));
      const desiredKeys = new Set(keyedChildren.map((child) => child.key));
      for (const { child, index, key } of keyedChildren) {
        let view = this.children.get(key);
        if (!view) {
          view = new ArtObjectView({
            document: this.document,
            visualAnimation: this.visualAnimation,
            gameObjectApi: this.gameObjectApi,
            instanceId: `${this.instanceId}/${key}`,
            component: child,
            canvas: childCanvas,
            layer: { index, total: (children || []).length }
          });
          this.children.set(key, view);
          view.on({ instant: true });
        } else {
          view.update(child, childCanvas, { index, total: (children || []).length });
        }
        this.element.appendChild(view.element);
      }
      for (const [childKey, view] of Array.from(this.children.entries())) {
        if (desiredKeys.has(childKey)) continue;
        this.children.delete(childKey);
        view.remove();
      }
    }

    play(animation, options = {}) {
      return this.createVisual()?.play(animation, options) || 0;
    }

    park(options = {}) {
      return this.play("park", options);
    }

    on(options = {}) {
      return this.play("on", options);
    }

    off(options = {}) {
      return this.play("off", options);
    }

    appear(options = {}) {
      return this.play("appear", options);
    }

    disappear(options = {}) {
      return this.play("disappear", options);
    }

    updateVisual(options = {}) {
      return this.play("update", options);
    }

    remove(options = {}) {
      const duration = this.disappear(options);
      const element = this.element;
      const token = element.dataset.visualAnimationToken || "";
      const removeElement = () => {
        if (element.parentElement && element.dataset.visualAnimationToken === token) element.remove();
      };
      if (duration > 0) global.setTimeout(removeElement, duration);
      else removeElement();
      return duration;
    }
  }

  class ArtObjectTreeRenderer {
    constructor(options = {}) {
      this.host = options.host;
      this.document = options.document || global.document;
      this.visualAnimation = options.visualAnimation || global.PartyGameVisualObject;
      this.gameObjectApi = options.gameObjectApi || global.PartyGameGameObject || global.PartyGameStageGameObject;
      this.instanceId = String(options.instanceId || `art-tree:${artTreeInstanceCounter++}`);
      this.views = new Map();
    }

    render(components = [], canvas, options = {}) {
      if (!this.host) return;
      const counts = new Map();
      const keyedComponents = (components || []).map((component, index) => ({
        component,
        index,
        key: artComponentViewKey(component, index, counts)
      }));
      const desiredKeys = new Set(keyedComponents.map((component) => component.key));
      for (const { component, index, key } of keyedComponents) {
        let view = this.views.get(key);
        if (!view) {
          view = new ArtObjectView({
            document: this.document,
            visualAnimation: this.visualAnimation,
            gameObjectApi: this.gameObjectApi,
            instanceId: `${this.instanceId}/${key}`,
            component,
            canvas,
            layer: { index, total: (components || []).length }
          });
          this.views.set(key, view);
          view.play(component.defaultAnimationState || options.defaultAnimation || "on", { instant: options.instant !== false });
        } else {
          view.update(component, canvas, { index, total: (components || []).length });
        }
        this.host.appendChild(view.element);
      }
      for (const [componentKey, view] of Array.from(this.views.entries())) {
        if (desiredKeys.has(componentKey)) continue;
        this.views.delete(componentKey);
        view.remove({ instant: options.instant === true });
      }
    }

    playAll(animation, options = {}) {
      let duration = 0;
      for (const view of this.views.values()) {
        duration = Math.max(duration, view.play(animation, options));
      }
      return duration;
    }

    clear(options = {}) {
      let duration = 0;
      for (const [, view] of Array.from(this.views.entries())) {
        duration = Math.max(duration, view.remove(options));
      }
      this.views.clear();
      return duration;
    }
  }

  global.PartyGameArtObject = {
    ArtObjectTreeRenderer,
    ArtObjectView,
    applyComponentLayout
  };
})(window);
