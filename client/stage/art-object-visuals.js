(function attachPartyGameArtObject(global) {
  const RUNTIME_CLASS = "art-runtime-object";
  const HIDDEN_CLASS = "art-runtime-object-hidden";
  const EXITING_CLASS = "art-runtime-object-exiting";
  const UPDATE_CLASS = "art-runtime-object-update";
  const INSTANT_CLASS = "art-runtime-object-instant";
  const componentSchema = global.PartyGameArtComponentSchema;
  let artTreeInstanceCounter = 1;

  function applyComponentLayout(element, component, canvas, options = {}) {
    if (!element || !component) return;
    const kind = componentSchema.normalizeComponentKind(component.kind);
    const canvasWidth = Math.max(1, Number(canvas?.width || 1));
    const canvasHeight = Math.max(1, Number(canvas?.height || 1));
    const labelText = Object.prototype.hasOwnProperty.call(options, "labelText")
      ? String(options.labelText || "")
      : componentSchema.componentLabel(component);
    element.style.left = `${Number(component.x || 0) / canvasWidth * 100}%`;
    element.style.top = `${Number(component.y || 0) / canvasHeight * 100}%`;
    element.style.width = `${Number(component.width || 1) / canvasWidth * 100}%`;
    element.style.height = `${Number(component.height || 1) / canvasHeight * 100}%`;
    element.style.setProperty("--component-scale", Number(component.scale || 1));
    element.style.setProperty("--component-rotation", `${Number(component.rotation || 0)}deg`);
    const fontScale = Number.isFinite(Number(options.fontScale)) && Number(options.fontScale) > 0
      ? Number(options.fontScale)
      : 1;
    const textLayout = isTextBearingComponentKind(kind) ? componentTextLayout(component, labelText) : null;
    element.__partyGameTextLayout = textLayout;
    element.style.setProperty("--component-font-size", `${(textLayout?.fontSize || Number(component.fontSize || 16)) * fontScale}px`);
    element.style.setProperty("--component-text-color", component.fontColor || "#17131f");
    element.style.setProperty("--component-fill-color", component.fillColor || "transparent");
    element.style.setProperty("--component-fill-css", componentSchema.normalizeFillCss(component.fillCss) || component.fillColor || "transparent");
    element.style.setProperty("--component-border-color", component.borderColor || "transparent");
    element.style.setProperty("--component-border-width", `${Number(component.borderWidth || 0)}px`);
    element.style.setProperty("--component-border-radius", `${Number(component.borderRadius || 0)}px`);
    element.style.setProperty("--component-image-fit", componentSchema.normalizeImageObjectFit(component.imageObjectFit));
  }

  function componentFontSize(component, labelText = componentSchema.componentLabel(component)) {
    return componentTextLayout(component, labelText).fontSize;
  }

  function componentTextLayout(component, labelText = componentSchema.componentLabel(component)) {
    const baseSize = Number(component?.fontSize || 16);
    const measuredLayout = global.PartyGameTextFit?.measureGameText?.({
      text: labelText,
      element: component,
      fallbackSize: baseSize
    });
    if (measuredLayout) return measuredLayout;
    const lineHeight = global.PartyGameTextFit?.constants?.lineHeight || 1.15;
    const fontSize = Math.max(8, baseSize);
    return {
      fontSize,
      lineHeight,
      lineBoxHeight: fontSize * lineHeight,
      inkHeight: fontSize * 0.9,
      lineGap: Math.max(fontSize * (lineHeight - 1), 0),
      lines: String(labelText ?? "").split("\n"),
      baselineShift: 0,
      boxWidth: Math.max(1, Number(component?.width || 1)),
      boxHeight: Math.max(1, Number(component?.height || 1))
    };
  }

  function componentImageSource(component) {
    return componentSchema.componentImageMaskDataUrl(component) || global.artAssetUrl?.(component?.imageAssetId) || "";
  }

  function syncComponentElement(options = {}) {
    const element = options.element;
    const component = options.component || {};
    if (!element) return;
    const kind = componentSchema.normalizeComponentKind(component.kind);
    const baseClass = options.baseClass || RUNTIME_CLASS;
    const labelText = Object.prototype.hasOwnProperty.call(options, "labelText")
      ? String(options.labelText || "")
      : componentSchema.componentLabel(component);
    const imageSource = Object.prototype.hasOwnProperty.call(options, "imageSource")
      ? String(options.imageSource || "")
      : componentImageSource(component);
    element.className = `${baseClass} is-${kind} is-style-${componentSchema.normalizeShapeStyle(component.shapeStyle, kind)}`;
    element.classList.toggle("is-art-root-container", Boolean(options.isRootContainer));
    element.classList.toggle("is-selected", Boolean(options.isSelected));
    element.classList.toggle("has-image-mask", Boolean(imageSource));
    element.classList.toggle("has-tinted-image-mask", Boolean(imageSource && component.imageTint === "currentColor"));
    element.dataset.artComponentId = component.id || "";
    element.dataset.componentId = component.id || "";
    element.style.zIndex = String(componentLayerIndex(options.layerIndex, options.layerTotal));
    if (imageSource) element.style.setProperty("--component-mask-url", `url('${String(imageSource).replaceAll("'", "%27")}')`);
    else element.style.removeProperty("--component-mask-url");
    applyComponentLayout(element, component, options.canvas, { labelText });

    const image = options.imageElement;
    if (image) {
      image.hidden = !imageSource;
      if (imageSource) {
        if (image.getAttribute("src") !== imageSource) image.src = imageSource;
      } else {
        image.removeAttribute("src");
      }
    }
    const label = options.labelElement;
    if (label) {
      const hasLabelText = isTextBearingComponentKind(kind) && Boolean(String(labelText || "").trim());
      label.hidden = Boolean(imageSource) || !hasLabelText;
      if (hasLabelText) {
        setLabelText(label, component, labelText);
      } else {
        label.replaceChildren();
      }
    }
  }

  function setLabelText(label, component, labelText) {
    if (global.PartyGameTextFit?.renderLayoutTextField) {
      const baseSize = Number(component?.fontSize || 16);
      const layout = global.PartyGameTextFit.renderLayoutTextField(label, component, {
        text: labelText,
        defaults: {
          defaultText: componentSchema.componentLabel(component),
          fontSize: baseSize,
          fontColor: component?.fontColor || "#17131f"
        },
        fallbackSize: baseSize
      });
      label.style.setProperty("--component-font-size", `${layout?.fontSize || baseSize}px`);
    } else {
      label.textContent = labelText;
    }
  }

  function renderComponentText(target, component, labelText = componentSchema.componentLabel(component)) {
    if (!target || !component) return null;
    const text = String(labelText ?? "");
    const baseSize = Number(component?.fontSize || 16);
    const layout = global.PartyGameTextFit?.renderLayoutTextField
      ? global.PartyGameTextFit.renderLayoutTextField(target, component, {
        text,
        defaults: {
          defaultText: componentSchema.componentLabel(component),
          fontSize: baseSize,
          fontColor: component?.fontColor || "#17131f"
        },
        fallbackSize: baseSize
      })
      : componentTextLayout(component, text);
    if (!global.PartyGameTextFit?.renderLayoutTextField) {
      target.textContent = text;
    }
    target.style.setProperty("--component-font-size", `${layout.fontSize}px`);
    return layout;
  }

  function componentLayerIndex(index, siblingCount) {
    return Math.max(1, Number(siblingCount || 1) - Number(index || 0));
  }

  function isTextBearingComponentKind(kind) {
    return kind === "text" || kind === "badge";
  }

  function artComponentViewKey(component, index, counts) {
    const rawId = String(component?.id || "").trim();
    const baseKey = rawId || `component-${Number(index || 0)}`;
    const count = Number(counts?.get(baseKey) || 0);
    counts?.set(baseKey, count + 1);
    return count > 0 ? `${baseKey}::${count}` : baseKey;
  }

  function isArtRootContainer(component, parentComponents) {
    if (!component || componentSchema.normalizeComponentKind(component.kind) !== "container") return false;
    const siblings = Array.isArray(parentComponents) ? parentComponents : [];
    if (siblings.length !== 1 || siblings[0] !== component) return false;
    return String(component.name || "").trim().toLowerCase() === "art root" || String(component.id || "").startsWith("root-");
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
      const wasVisible = this.visual ? this.isVisible() : true;
      if (!wasVisible) this.element.classList.add(HIDDEN_CLASS);
      syncComponentElement({
        element: this.element,
        imageElement: this.image,
        labelElement: this.label,
        component: this.component,
        canvas,
        layerIndex: layer.index,
        layerTotal: layer.total,
        isRootContainer: layer.isRootContainer
      });
      if (!wasVisible) this.element.classList.add(HIDDEN_CLASS);
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
          view.play(child.defaultAnimationState || "on", { instant: true });
        } else {
          view.update(child, childCanvas, { index, total: (children || []).length, isRootContainer: false });
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
      const defaultAnimation = options.defaultAnimation || "on";
      const respectDefaultAnimationState = options.respectDefaultAnimationState !== false;
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
            layer: { index, total: (components || []).length, isRootContainer: isArtRootContainer(component, components) }
          });
          this.views.set(key, view);
          view.play(
            respectDefaultAnimationState
              ? component.defaultAnimationState || defaultAnimation
              : defaultAnimation,
            { instant: options.instant !== false }
          );
        } else {
          view.update(component, canvas, { index, total: (components || []).length, isRootContainer: isArtRootContainer(component, components) });
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
    applyComponentLayout,
    componentFontSize,
    componentTextLayout,
    isArtRootContainer,
    renderComponentText,
    syncComponentElement
  };
})(window);
