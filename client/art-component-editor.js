(function attachPartyGameArtComponentEditor(global) {
  "use strict";

  function createArtComponentEditor(options = {}) {
    const documentRef = options.document || global.document;
    const componentTree = options.componentTree || global.PartyGameArtComponentTree;
    const colorControl = options.colorControl || global.PartyGameColorControl;

    function textField(label, value, onChange) {
      const field = documentRef.createElement("label");
      field.className = "layout-number-field";
      field.textContent = label;
      const input = documentRef.createElement("input");
      input.type = "text";
      input.value = value || "";
      input.addEventListener("change", () => onChange(input.value));
      field.appendChild(input);
      return field;
    }

    function selectField(label, value, selectOptions, onChange) {
      const field = documentRef.createElement("label");
      field.className = "layout-number-field";
      field.textContent = label;
      const select = documentRef.createElement("select");
      for (const option of selectOptions || []) {
        const item = documentRef.createElement("option");
        item.value = option.value;
        item.textContent = option.label;
        select.appendChild(item);
      }
      select.value = value;
      select.addEventListener("change", () => onChange(select.value));
      field.appendChild(select);
      return field;
    }

    function numberField(label, value, onChange, step = 1) {
      const field = documentRef.createElement("label");
      field.className = "layout-number-field";
      field.textContent = label;
      const input = documentRef.createElement("input");
      input.type = "number";
      input.step = String(step);
      input.value = Number(value || 0);
      input.addEventListener("change", () => onChange(Number(input.value)));
      field.appendChild(input);
      return field;
    }

    function toggleField(label, value, onChange) {
      const field = documentRef.createElement("label");
      field.className = "layout-number-field";
      field.textContent = label;
      const input = documentRef.createElement("input");
      input.type = "checkbox";
      input.checked = value === true;
      input.addEventListener("change", () => onChange(input.checked));
      field.appendChild(input);
      return field;
    }

    function colorField(label, value, onChange) {
      if (!colorControl?.create) {
        return textField(label, options.normalizeUiColor?.(value) || "#ffffff", (nextValue) => {
          const normalized = options.normalizeUiColor?.(nextValue) || "";
          if (normalized) onChange(normalized);
        });
      }
      return colorControl.create({
        document: documentRef,
        label,
        value,
        className: "layout-number-field layout-color-field",
        normalizeColor: colorControl.normalize,
        onChange: (normalized, meta) => {
          if (meta.captureHistory) options.onPushHistory?.();
          onChange(normalized, {
            captureHistory: false,
            colorCommit: meta.commit,
            previewOnly: meta.previewOnly
          });
        }
      });
    }

    function imageMaskField(component) {
      const field = documentRef.createElement("section");
      field.className = "art-image-mask-field";
      const label = documentRef.createElement("strong");
      label.textContent = "Image Mask";
      const status = documentRef.createElement("span");
      status.className = "art-image-mask-status";
      status.textContent = component.imageName ? `Current: ${component.imageName}` : "Drop or upload PNG, SVG, JPG, or WEBP";
      const input = documentRef.createElement("input");
      input.type = "file";
      input.accept = options.imageAccept || "";
      input.className = "art-file-input";
      const actions = documentRef.createElement("div");
      actions.className = "art-image-mask-actions";
      const uploadButton = documentRef.createElement("button");
      uploadButton.type = "button";
      uploadButton.textContent = component.imageDataUrl || component.imageAssetId ? "Replace Image" : "Upload Image";
      uploadButton.addEventListener("click", () => input.click());
      const clearButton = documentRef.createElement("button");
      clearButton.type = "button";
      clearButton.textContent = "Clear";
      clearButton.disabled = !component.imageDataUrl && !component.imageAssetId;
      clearButton.addEventListener("click", () => options.onClearImage?.(component));
      actions.append(uploadButton, clearButton);
      input.addEventListener("change", () => {
        Promise.resolve(options.onImageFile?.(component, input.files?.[0])).finally(() => {
          input.value = "";
        });
      });
      field.addEventListener("dragover", (event) => {
        if (!options.eventHasFiles?.(event)) return;
        event.preventDefault();
        event.stopPropagation();
        field.classList.add("is-dragging");
      });
      field.addEventListener("dragleave", (event) => {
        if (!field.contains(event.relatedTarget)) field.classList.remove("is-dragging");
      });
      field.addEventListener("drop", (event) => {
        event.preventDefault();
        event.stopPropagation();
        field.classList.remove("is-dragging");
        options.onImageFile?.(component, event.dataTransfer?.files?.[0]);
      });
      field.append(label, status, actions, input);
      return field;
    }

    function renderComponentList(composition, selectedIds) {
      const list = documentRef.createElement("div");
      list.className = "art-component-list";
      for (const { component, depth } of componentTree.flattenComponents(composition.components || [])) {
        const button = documentRef.createElement("button");
        button.type = "button";
        button.className = "art-component-row";
        button.classList.toggle("is-selected", selectedIds.has(component.id));
        button.innerHTML = "<span></span><small></small>";
        button.querySelector("span").textContent = component.name;
        button.querySelector("span").style.paddingLeft = `${depth * 14}px`;
        button.querySelector("small").textContent = options.artKindLabel?.(component.kind) || component.kind || "Art";
        button.addEventListener("click", (event) => options.onSelectComponent?.(composition.id, component.id, {
          additive: event.metaKey || event.ctrlKey || event.shiftKey
        }));
        list.appendChild(button);
      }
      return list;
    }

    function appendComponentFields(fields, component, data = {}) {
      const kindLabel = options.artKindLabel?.(component.kind) || "Art";
      fields.appendChild(textField("Name", component.name || kindLabel, (value) => options.onUpdateComponentValue?.("name", value || kindLabel)));
      fields.appendChild(numberField("X", component.x, (value) => options.onUpdateComponentNumber?.("x", value)));
      fields.appendChild(numberField("Y", component.y, (value) => options.onUpdateComponentNumber?.("y", value)));
      fields.appendChild(numberField("Scale", component.scale, (value) => options.onUpdateComponentNumber?.("scale", Math.max(0.05, value)), 0.05));
      fields.appendChild(numberField("Rotation", component.rotation || 0, (value) => options.onUpdateComponentNumber?.("rotation", value)));
      fields.appendChild(numberField("Width", component.width, (value) => options.onUpdateComponentNumber?.("width", Math.max(1, value))));
      fields.appendChild(numberField("Height", component.height, (value) => options.onUpdateComponentNumber?.("height", Math.max(1, value))));
      if (component.kind === "text" || component.kind === "badge") {
        fields.appendChild(textField("Text", component.defaultText || "", (value) => options.onUpdateComponentValue?.("defaultText", value)));
        fields.appendChild(numberField("Font Size", component.fontSize || 16, (value) => options.onUpdateComponentValue?.("fontSize", Math.max(6, value))));
        fields.appendChild(toggleField("Auto Fit Text", component.autoFitText !== false, (value) => options.onUpdateComponentValue?.("autoFitText", value)));
        fields.appendChild(colorField("Font Color", component.fontColor || "#17131f", (value, fieldOptions) => options.onUpdateComponentValue?.("fontColor", value, fieldOptions)));
      }
      if (component.kind === "reference") {
        const choices = data.artCompositionChoices || options.artCompositionChoices || [];
        if (choices.length) {
          fields.appendChild(selectField("Prefab", component.artCompositionId || "", choices, (value) => options.onUpdateComponentValue?.("artCompositionId", value)));
        } else {
          fields.appendChild(textField("Prefab", component.artCompositionId || "", (value) => options.onUpdateComponentValue?.("artCompositionId", value)));
        }
      }
      if (component.kind === "container") {
        fields.appendChild(selectField("Child Distribution", component.childDistribution || "none", options.containerDistributionOptions || [], (value) => options.onUpdateComponentValue?.("childDistribution", value)));
      }
      if (component.kind === "shape" || component.kind === "container" || component.kind === "badge") {
        fields.appendChild(selectField("Shape", component.shapeStyle || "rounded", options.shapeStyles || [], (value) => options.onUpdateShapeStyle?.(value)));
        fields.appendChild(colorField("Fill", component.fillColor === "transparent" ? "#fff8d6" : component.fillColor || "#fff8d6", (value, fieldOptions) => options.onUpdateComponentValue?.("fillColor", value, fieldOptions)));
        fields.appendChild(colorField("Border", component.borderColor === "transparent" ? "#17131f" : component.borderColor || "#17131f", (value, fieldOptions) => options.onUpdateComponentValue?.("borderColor", value, fieldOptions)));
        fields.appendChild(numberField("Border Width", component.borderWidth || 0, (value) => options.onUpdateComponentValue?.("borderWidth", Math.max(0, value))));
        fields.appendChild(numberField("Radius", component.borderRadius || 0, (value) => options.onUpdateComponentValue?.("borderRadius", Math.max(0, value))));
      }
      if (options.supportsImageMask?.(component)) {
        fields.appendChild(imageMaskField(component));
      }
    }

    function appendCompositionFields(fields, composition) {
      fields.appendChild(textField("Name", composition.name || "Art Asset", (value) => options.onUpdateCompositionValue?.("name", value || "Art Asset")));
      fields.appendChild(numberField("Canvas Width", composition.canvas?.width || 560, (value) => options.onUpdateCompositionCanvas?.("width", Math.max(1, value))));
      fields.appendChild(numberField("Canvas Height", composition.canvas?.height || 230, (value) => options.onUpdateCompositionCanvas?.("height", Math.max(1, value))));
    }

    function render(target, data = {}) {
      const composition = data.composition;
      if (!target || !composition) return;
      global.PartyGameToolAffordances?.bindScrollStableControls?.(target);
      const selectedIds = data.selectedComponentIds || new Set();
      target.replaceChildren();
      const fields = documentRef.createElement("div");
      fields.className = "art-component-fields";
      if (data.selectedComponent) appendComponentFields(fields, data.selectedComponent, data);
      else appendCompositionFields(fields, composition);
      target.append(renderComponentList(composition, selectedIds), fields);
    }

    return { render };
  }

  const api = { create: createArtComponentEditor };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.PartyGameArtComponentEditor = api;
})(typeof window !== "undefined" ? window : globalThis);
