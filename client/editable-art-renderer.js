(function attachPartyGameEditableArtRenderer(global) {
  const componentSchema = global.PartyGameArtComponentSchema;
  const artObjectRuntime = global.PartyGameArtObject;

  function componentLayerIndex(index, siblingCount) {
    return Math.max(1, Number(siblingCount || 1) - Number(index || 0));
  }

  function cssUrlValue(url) {
    if (typeof global.cssUrl === "function") return global.cssUrl(url);
    return `url("${String(url || "").replaceAll('"', "%22")}")`;
  }

  function createComponentNode(options = {}) {
    const documentRef = options.document || global.document;
    const composition = options.composition || {};
    const component = options.component || {};
    const canvas = options.canvas || { width: 1, height: 1 };
    const layerIndex = Number(options.layerIndex || 0);
    const siblingCount = Number(options.siblingCount || 1);
    const selectedIds = options.selectedIds || new Set();
    const primaryId = String(options.primaryId || "");
    const previewText = typeof options.previewText === "function" ? options.previewText : () => componentSchema.componentLabel(component);
    const imageSourceFor = typeof options.imageSource === "function" ? options.imageSource : () => "";
    const supportsImageMask = typeof options.supportsImageMask === "function" ? options.supportsImageMask : componentSchema.componentSupportsImageMask;
    const eventHasFiles = typeof options.eventHasFiles === "function" ? options.eventHasFiles : () => false;

    const kind = componentSchema.normalizeComponentKind(component.kind);
    const node = documentRef.createElement("div");
    node.className = `art-composition-component is-${kind} is-style-${componentSchema.normalizeShapeStyle(component.shapeStyle, component.kind)}`;
    node.classList.toggle("is-art-root-container", artObjectRuntime?.isArtRootContainer?.(component, composition.components || []) === true);
    node.classList.toggle("is-selected", selectedIds.has(component.id));
    node.classList.toggle("has-image-mask", componentSchema.componentHasImageMask(component));
    node.classList.toggle("has-tinted-image-mask", componentSchema.componentHasImageMask(component) && component.imageTint === "currentColor");
    node.dataset.componentId = component.id || "";
    node.style.zIndex = String(componentLayerIndex(layerIndex, siblingCount));
    artObjectRuntime?.applyComponentLayout?.(node, component, canvas, {
      labelText: previewText(component)
    });

    const imageSource = imageSourceFor(component);
    if (imageSource) node.style.setProperty("--component-mask-url", cssUrlValue(imageSource));
    else node.style.removeProperty("--component-mask-url");

    if (typeof options.onPointerDown === "function") {
      node.addEventListener("pointerdown", (event) => options.onPointerDown(event, component));
    }

    if (supportsImageMask(component)) {
      node.addEventListener("dragover", (event) => {
        if (!eventHasFiles(event)) return;
        event.preventDefault();
        event.stopPropagation();
        node.classList.add("is-image-drop-target");
      });
      node.addEventListener("dragleave", (event) => {
        if (!node.contains(event.relatedTarget)) node.classList.remove("is-image-drop-target");
      });
      node.addEventListener("drop", (event) => {
        event.preventDefault();
        event.stopPropagation();
        node.classList.remove("is-image-drop-target");
        options.onImageDrop?.(event, component);
      });
    }

    if (imageSource) {
      const image = component.imageTint === "currentColor" ? documentRef.createElement("span") : documentRef.createElement("img");
      image.className = "art-component-mask-image";
      if (image.tagName === "IMG") {
        image.alt = "";
        image.draggable = false;
        image.src = imageSource;
      }
      node.appendChild(image);
    }

    const label = documentRef.createElement("span");
    label.className = "art-component-label";
    label.textContent = previewText(component);
    node.appendChild(label);

    const childCanvas = { width: Number(component.width || 1), height: Number(component.height || 1) };
    for (const [childIndex, child] of (component.children || []).entries()) {
      node.appendChild(createComponentNode({
        ...options,
        component: child,
        canvas: childCanvas,
        layerIndex: childIndex,
        siblingCount: (component.children || []).length
      }));
    }

    if (selectedIds.has(component.id) && typeof options.appendTransformHandles === "function") {
      options.appendTransformHandles(node, component, { primary: component.id === primaryId });
    }

    return node;
  }

  global.PartyGameEditableArtRenderer = {
    createComponentNode,
    componentLayerIndex
  };
})(window);
