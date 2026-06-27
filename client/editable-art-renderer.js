(function attachPartyGameEditableArtRenderer(global) {
  const componentSchema = global.PartyGameArtComponentSchema;
  const artObjectRuntime = global.PartyGameArtObject;

  function cloneComponentTree(component) {
    return {
      ...component,
      children: (component.children || []).map(cloneComponentTree)
    };
  }

  function distributedContainerChildren(component, children = []) {
    if (componentSchema.componentKindFrom(component) !== "container") return children || [];
    const distribution = componentSchema.normalizeContainerDistribution?.(component.childDistribution) || "none";
    if (distribution === "none" || !Array.isArray(children) || children.length === 0) return children || [];
    const width = Math.max(1, Number(component.width || 1));
    const height = Math.max(1, Number(component.height || 1));
    return children.map((child, index) => {
      const clone = cloneComponentTree(child);
      if (distribution === "horizontal") {
        clone.x = width * ((index + 1) / (children.length + 1));
        clone.y = height / 2;
      } else if (distribution === "vertical") {
        clone.x = width / 2;
        clone.y = height * ((index + 1) / (children.length + 1));
      }
      return clone;
    });
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
    const getComposition = typeof options.getComposition === "function" ? options.getComposition : () => null;
    const referencePath = options.referencePath instanceof Set ? options.referencePath : new Set();
    const supportsImageMask = typeof options.supportsImageMask === "function" ? options.supportsImageMask : componentSchema.componentSupportsImageMask;
    const eventHasFiles = typeof options.eventHasFiles === "function" ? options.eventHasFiles : () => false;

    const node = documentRef.createElement("div");
    const imageSource = imageSourceFor(component);
    const image = documentRef.createElement("img");
    image.className = "art-component-mask-image";
    image.alt = "";
    image.draggable = false;
    node.appendChild(image);

    const label = documentRef.createElement("span");
    label.className = "art-component-label";
    node.appendChild(label);

    artObjectRuntime?.syncComponentElement?.({
      element: node,
      imageElement: image,
      labelElement: label,
      component,
      canvas,
      baseClass: "art-composition-component",
      labelText: previewText(component),
      imageSource,
      layerIndex,
      layerTotal: siblingCount,
      isRootContainer: artObjectRuntime?.isArtRootContainer?.(component, composition.components || []) === true,
      isSelected: selectedIds.has(component.id)
    });

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

    const referencedId = componentSchema.componentKindFrom(component) === "reference" ? String(component.artCompositionId || "") : "";
    const referencedComposition = referencedId && !referencePath.has(referencedId)
      ? getComposition(referencedId)
      : null;
    const childCanvas = referencedComposition?.canvas || { width: Number(component.width || 1), height: Number(component.height || 1) };
    const childComponents = referencedComposition?.components || distributedContainerChildren(component, component.children || []);
    const childReferencePath = referencedComposition ? new Set([...referencePath, referencedId]) : referencePath;
    for (const [childIndex, child] of childComponents.entries()) {
      node.appendChild(createComponentNode({
        ...options,
        component: child,
        canvas: childCanvas,
        layerIndex: childIndex,
        siblingCount: childComponents.length,
        referencePath: childReferencePath
      }));
    }

    if (selectedIds.has(component.id) && typeof options.appendTransformHandles === "function") {
      options.appendTransformHandles(node, component, { primary: component.id === primaryId });
    }

    return node;
  }

  global.PartyGameEditableArtRenderer = {
    createComponentNode
  };
})(window);
