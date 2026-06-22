(function () {
  "use strict";

  function rectsIntersect(a, b) {
    return a.left <= b.right && a.right >= b.left && a.top <= b.bottom && a.bottom >= b.top;
  }

  function createDisclosureButton(id, collapsedSet, onToggle = () => {}, onMetaToggle = null) {
    const button = document.createElement("span");
    button.setAttribute("role", "button");
    button.tabIndex = 0;
    button.className = "disclosure-button";
    button.classList.toggle("is-collapsed", collapsedSet.has(id));
    button.setAttribute("aria-label", collapsedSet.has(id) ? "Expand" : "Collapse");
    const toggle = (event) => {
      event.stopPropagation();
      event.preventDefault();
      if (onMetaToggle && (event.metaKey || event.ctrlKey)) {
        onMetaToggle(id);
        return;
      }
      if (collapsedSet.has(id)) {
        collapsedSet.delete(id);
      } else {
        collapsedSet.add(id);
      }
      onToggle(id);
    };
    button.addEventListener("click", toggle);
    button.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") toggle(event);
    });
    return button;
  }

  function toggleCollapsedSetForIds(collapsedSet, ids) {
    const cleanIds = [...new Set((ids || []).filter(Boolean))];
    const allCollapsed = cleanIds.length > 0 && cleanIds.every((id) => collapsedSet.has(id));
    if (allCollapsed) {
      for (const id of cleanIds) collapsedSet.delete(id);
    } else {
      for (const id of cleanIds) collapsedSet.add(id);
    }
    return !allCollapsed;
  }

  function targetIsToolControl(target, ignoreSelector = "input, textarea, button, select, a", root = null) {
    const control = target?.closest?.(ignoreSelector);
    return Boolean(control && control !== root);
  }

  function bindToolRowActivation(row, onActivate, options = {}) {
    if (typeof onActivate !== "function") return row;
    const ignoreSelector = options.ignoreSelector;
    const activate = (event) => {
      if (targetIsToolControl(event.target, ignoreSelector, row)) return;
      onActivate(event);
    };
    row.addEventListener("click", activate);
    if (options.activateOnDoubleClick) row.addEventListener("dblclick", activate);
    row.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      if (targetIsToolControl(event.target, ignoreSelector, row)) return;
      event.preventDefault();
      onActivate(event);
    });
    return row;
  }

  function applyToolDataset(element, dataset = {}) {
    for (const [key, value] of Object.entries(dataset || {})) {
      if (value !== undefined && value !== null) element.dataset[key] = String(value);
    }
  }

  function createToolSidebarRow(options = {}) {
    const row = document.createElement(options.tagName || "div");
    row.className = options.className || "tool-sidebar-row";
    if (row.tagName === "BUTTON") row.type = options.type || "button";
    row.setAttribute("role", options.role || "button");
    row.tabIndex = options.tabIndex ?? 0;
    row.classList.toggle("is-selected", Boolean(options.selected));
    applyToolDataset(row, options.dataset);
    appendToolNodes(row, options.leadingNodes);

    const copy = document.createElement(options.copyTagName || "span");
    copy.className = options.copyClassName || "tool-sidebar-row-copy";
    const title = options.titleNode || document.createElement(options.titleTagName || "strong");
    if (options.titleClassName) title.className = options.titleClassName;
    if (!options.titleNode) title.textContent = options.title || "";
    const summary = document.createElement(options.summaryTagName || "span");
    summary.className = options.summaryClassName || "tool-sidebar-row-summary";
    summary.textContent = options.summary || "";
    copy.append(title, summary);
    row.appendChild(copy);

    let pill = null;
    if (options.pill !== undefined && options.pill !== null) {
      pill = document.createElement(options.pillTagName || "span");
      pill.className = options.pillClassName || "flow-pill";
      pill.textContent = options.pill;
      row.appendChild(pill);
    }

    bindToolRowActivation(row, options.onActivate, {
      activateOnDoubleClick: options.activateOnDoubleClick,
      ignoreSelector: options.ignoreSelector
    });
    return { row, copy, title, summary, pill };
  }

  function appendToolNodes(target, nodes = []) {
    for (const node of nodes || []) {
      if (node) target.appendChild(node);
    }
  }

  function createToolAccordionRow(options = {}) {
    const row = document.createElement(options.tagName || "div");
    row.className = options.className || "tool-accordion-row";
    row.classList.toggle("is-selected", Boolean(options.expanded || options.selected));
    row.setAttribute("aria-expanded", String(Boolean(options.expanded)));
    row.tabIndex = options.tabIndex ?? 0;
    row.draggable = Boolean(options.draggable);
    applyToolDataset(row, options.dataset);

    const header = document.createElement("div");
    header.className = options.headerClassName || "tool-accordion-row-header";
    const copy = document.createElement("div");
    copy.className = options.copyClassName || "tool-accordion-row-copy";
    const title = document.createElement(options.titleTagName || "strong");
    title.textContent = options.title || "";
    const summary = document.createElement(options.summaryTagName || "span");
    summary.className = options.summaryClassName || "tool-accordion-row-summary";
    summary.textContent = options.summary || "";
    copy.append(title, summary);
    const actions = document.createElement("div");
    actions.className = options.actionsClassName || "tool-accordion-row-actions";
    appendToolNodes(actions, options.actions);
    header.append(copy, actions);

    const fields = document.createElement("div");
    fields.className = options.fieldsClassName || "tool-accordion-row-fields";
    appendToolNodes(fields, options.fields);

    row.append(header, fields);
    bindToolRowActivation(row, options.onActivate, { ignoreSelector: options.ignoreSelector });
    return { row, header, copy, title, summary, actions, fields };
  }

  function capturePointer(element, pointerId) {
    try {
      element.setPointerCapture?.(pointerId);
    } catch {
      // Pointer capture is an enhancement; marquee selection still works without it.
    }
  }

  function releasePointer(element, pointerId) {
    try {
      if (!element.hasPointerCapture || element.hasPointerCapture(pointerId)) {
        element.releasePointerCapture?.(pointerId);
      }
    } catch {
      // Ignore stale pointer releases from cancelled drags.
    }
  }

  function startSelectionMarquee(event, options = {}) {
    if (event.button !== 0) return false;
    const root = options.root;
    const itemRoot = options.itemRoot || root;
    if (!root || !itemRoot || !root.contains(event.target)) return false;
    if (typeof options.shouldIgnoreTarget === "function" && options.shouldIgnoreTarget(event.target, event)) return false;

    event.preventDefault();
    const coordinateScale = Number(options.coordinateScale || 1);
    const rootRect = root.getBoundingClientRect();
    const startX = (event.clientX - rootRect.left) / coordinateScale;
    const startY = (event.clientY - rootRect.top) / coordinateScale;
    const marquee = document.createElement("div");
    marquee.className = options.className || "tool-selection-marquee";
    (options.marqueeRoot || root).appendChild(marquee);
    capturePointer(root, event.pointerId);

    const updateMarquee = (moveEvent) => {
      const currentX = (moveEvent.clientX - rootRect.left) / coordinateScale;
      const currentY = (moveEvent.clientY - rootRect.top) / coordinateScale;
      const left = Math.min(startX, currentX);
      const top = Math.min(startY, currentY);
      const width = Math.abs(currentX - startX);
      const height = Math.abs(currentY - startY);
      marquee.style.left = `${left}px`;
      marquee.style.top = `${top}px`;
      marquee.style.width = `${width}px`;
      marquee.style.height = `${height}px`;

      const selectionRect = { left, top, right: left + width, bottom: top + height };
      const selectedIds = [];
      for (const node of itemRoot.querySelectorAll(options.itemSelector || "[data-selection-id]")) {
        const id = typeof options.getItemId === "function" ? options.getItemId(node) : node.dataset.selectionId;
        if (!id) continue;
        const nodeRect = node.getBoundingClientRect();
        const localRect = {
          left: (nodeRect.left - rootRect.left) / coordinateScale,
          top: (nodeRect.top - rootRect.top) / coordinateScale,
          right: (nodeRect.right - rootRect.left) / coordinateScale,
          bottom: (nodeRect.bottom - rootRect.top) / coordinateScale
        };
        if (rectsIntersect(selectionRect, localRect)) selectedIds.push(id);
      }
      options.onSelectionChange?.(selectedIds, selectionRect, moveEvent);
    };

    const stopMarquee = (stopEvent) => {
      releasePointer(root, stopEvent.pointerId);
      marquee.remove();
      window.removeEventListener("pointermove", updateMarquee);
      window.removeEventListener("pointerup", stopMarquee);
      window.removeEventListener("pointercancel", stopMarquee);
      options.onComplete?.(stopEvent);
    };

    updateMarquee(event);
    window.addEventListener("pointermove", updateMarquee);
    window.addEventListener("pointerup", stopMarquee, { once: true });
    window.addEventListener("pointercancel", stopMarquee, { once: true });
    return true;
  }

  window.PartyGameToolAffordances = {
    bindToolRowActivation,
    createToolAccordionRow,
    createDisclosureButton,
    createToolSidebarRow,
    rectsIntersect,
    startSelectionMarquee,
    toggleCollapsedSetForIds
  };
  window.createDisclosureButton = createDisclosureButton;
  window.rectsIntersect = rectsIntersect;
})();
