(function attachPartyGameArtObject(global) {
  const RUNTIME_CLASS = "art-runtime-object";
  const HIDDEN_CLASS = "art-runtime-object-hidden";
  const EXITING_CLASS = "art-runtime-object-exiting";
  const UPDATE_CLASS = "art-runtime-object-update";
  const INSTANT_CLASS = "art-runtime-object-instant";

  function componentKind(component) {
    const kind = String(component?.kind || "shape").trim().toLowerCase();
    return kind === "text" || kind === "container" || kind === "badge" ? kind : "shape";
  }

  function componentLabel(component) {
    const kind = componentKind(component);
    if (kind === "text" || kind === "badge") return String(component?.defaultText || component?.name || "");
    return "";
  }

  function componentImageMaskDataUrl(component) {
    return componentKind(component) === "shape" ? String(component?.imageDataUrl || "") : "";
  }

  function shapeStyle(component) {
    const style = String(component?.shapeStyle || "rounded").trim().toLowerCase();
    if (style === "rectangle" || style === "pill" || style === "circle") return style;
    return "rounded";
  }

  function applyComponentLayout(element, component, canvas) {
    if (!element || !component) return;
    const canvasWidth = Math.max(1, Number(canvas?.width || 1));
    const canvasHeight = Math.max(1, Number(canvas?.height || 1));
    element.style.left = `${Number(component.x || 0) / canvasWidth * 100}%`;
    element.style.top = `${Number(component.y || 0) / canvasHeight * 100}%`;
    element.style.width = `${Number(component.width || 1) / canvasWidth * 100}%`;
    element.style.height = `${Number(component.height || 1) / canvasHeight * 100}%`;
    element.style.setProperty("--component-scale", Number(component.scale || 1));
    element.style.setProperty("--component-font-size", `${Number(component.fontSize || 16)}px`);
    element.style.setProperty("--component-text-color", component.fontColor || "#17131f");
    element.style.setProperty("--component-fill-color", component.fillColor || "transparent");
    element.style.setProperty("--component-border-color", component.borderColor || "transparent");
    element.style.setProperty("--component-border-width", `${Number(component.borderWidth || 0)}px`);
    element.style.setProperty("--component-border-radius", `${Number(component.borderRadius || 0)}px`);
    element.style.setProperty("--component-image-fit", component.imageObjectFit || "cover");
  }

  class ArtObjectView {
    constructor(options = {}) {
      this.document = options.document || global.document;
      this.visualAnimation = options.visualAnimation || global.PartyGameVisualObject;
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
      this.visual = this.visualAnimation.createCssVisualObject({
        element: this.element,
        hiddenClasses: [HIDDEN_CLASS],
        motionHiddenClasses: [HIDDEN_CLASS],
        exitingClass: EXITING_CLASS,
        updateClass: UPDATE_CLASS,
        instantClass: INSTANT_CLASS
      });
      if (options.component) this.update(options.component, options.canvas);
    }

    update(component, canvas) {
      this.component = component || {};
      const kind = componentKind(this.component);
      this.element.className = `${RUNTIME_CLASS} is-${kind} is-style-${shapeStyle(this.component)}`;
      if (this.visual.isVisible() === false) this.element.classList.add(HIDDEN_CLASS);
      const imageDataUrl = componentImageMaskDataUrl(this.component);
      this.element.classList.toggle("has-image-mask", Boolean(imageDataUrl));
      this.image.hidden = !imageDataUrl;
      this.label.hidden = Boolean(imageDataUrl);
      if (imageDataUrl) {
        if (this.image.getAttribute("src") !== imageDataUrl) this.image.src = imageDataUrl;
      } else {
        this.image.removeAttribute("src");
      }
      this.label.textContent = componentLabel(this.component);
      applyComponentLayout(this.element, this.component, canvas);
      this.renderChildren(this.component.children || []);
    }

    renderChildren(children) {
      const childCanvas = {
        width: Number(this.component?.width || 1),
        height: Number(this.component?.height || 1)
      };
      const desiredIds = new Set((children || []).map((child) => child.id));
      for (const child of children || []) {
        let view = this.children.get(child.id);
        if (!view) {
          view = new ArtObjectView({
            document: this.document,
            visualAnimation: this.visualAnimation,
            component: child,
            canvas: childCanvas
          });
          this.children.set(child.id, view);
          this.element.appendChild(view.element);
          view.on({ instant: true });
        } else {
          view.update(child, childCanvas);
        }
      }
      for (const [childId, view] of Array.from(this.children.entries())) {
        if (desiredIds.has(childId)) continue;
        this.children.delete(childId);
        view.remove();
      }
    }

    play(animation, options = {}) {
      return this.visual.play(animation, options);
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
      this.views = new Map();
    }

    render(components = [], canvas, options = {}) {
      if (!this.host) return;
      const desiredIds = new Set((components || []).map((component) => component.id));
      for (const component of components || []) {
        let view = this.views.get(component.id);
        if (!view) {
          view = new ArtObjectView({
            document: this.document,
            visualAnimation: this.visualAnimation,
            component,
            canvas
          });
          this.views.set(component.id, view);
          this.host.appendChild(view.element);
          view.play(component.defaultAnimationState || options.defaultAnimation || "on", { instant: options.instant !== false });
        } else {
          view.update(component, canvas);
        }
      }
      for (const [componentId, view] of Array.from(this.views.entries())) {
        if (desiredIds.has(componentId)) continue;
        this.views.delete(componentId);
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
