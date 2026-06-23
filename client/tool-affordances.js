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

  function targetIsTextEditingControl(target, ignoreSelector = "input, textarea, select, [contenteditable='true']") {
    return Boolean(target?.closest?.(ignoreSelector));
  }

  function scrollableAncestors(element) {
    const result = [];
    let current = element?.parentElement || null;
    while (current && current !== document.body && current !== document.documentElement) {
      const style = window.getComputedStyle(current);
      const canScrollY = /(auto|scroll)/.test(style.overflowY) && current.scrollHeight > current.clientHeight;
      const canScrollX = /(auto|scroll)/.test(style.overflowX) && current.scrollWidth > current.clientWidth;
      if (canScrollY || canScrollX) result.push(current);
      current = current.parentElement;
    }
    return result;
  }

  function bindScrollStableControls(root, options = {}) {
    if (!root || root.dataset.scrollStableControlsBound === "true") return;
    root.dataset.scrollStableControlsBound = "true";
    const selector = options.selector || "input, textarea, select, button, [role='button']";
    root.addEventListener("pointerdown", (event) => {
      if (!event.target?.closest?.(selector)) return;
      const snapshot = scrollableAncestors(event.target).map((node) => ({
        node,
        left: node.scrollLeft,
        top: node.scrollTop
      }));
      if (!snapshot.length) return;
      const restore = () => {
        for (const item of snapshot) {
          item.node.scrollLeft = item.left;
          item.node.scrollTop = item.top;
        }
      };
      const stop = () => {
        requestAnimationFrame(restore);
        window.removeEventListener("pointermove", restore);
        window.removeEventListener("pointerup", stop);
        window.removeEventListener("pointercancel", stop);
        window.removeEventListener("scroll", restore, true);
      };
      requestAnimationFrame(restore);
      window.addEventListener("pointermove", restore);
      window.addEventListener("pointerup", stop, { once: true });
      window.addEventListener("pointercancel", stop, { once: true });
      window.addEventListener("scroll", restore, true);
    }, { capture: true });
  }

  function handleToolDeleteHotkey(event, options = {}) {
    if (event.key !== "Delete" && event.key !== "Backspace") return false;
    if (event.metaKey || event.ctrlKey || event.altKey) return false;
    if (typeof options.isEnabled === "function" && !options.isEnabled(event)) return false;
    if (targetIsTextEditingControl(event.target, options.ignoreSelector)) return false;
    if (typeof options.canDelete === "function" && !options.canDelete(event)) return false;
    if (typeof options.onDelete !== "function") return false;
    event.preventDefault();
    options.onDelete(event);
    return true;
  }

  function sortableDropPlacement(row, event, axis = "vertical") {
    const rect = row.getBoundingClientRect();
    if (axis === "horizontal") return event.clientX > rect.left + rect.width / 2;
    return event.clientY > rect.top + rect.height / 2;
  }

  function bindSortableRow(row, options = {}) {
    if (!row) return row;
    const dragType = options.dragType || "text/plain";
    const draggingClass = options.draggingClass || "is-dragging";
    const dropBeforeClass = options.dropBeforeClass || "is-drop-before";
    const dropAfterClass = options.dropAfterClass || "is-drop-after";
    const itemId = String(options.itemId || row.dataset?.selectionId || "");
    row.draggable = options.draggable !== false;
    row.addEventListener("dragstart", (event) => {
      if (targetIsToolControl(event.target, options.ignoreSelector, row)) {
        event.preventDefault();
        return;
      }
      if (!itemId || (typeof options.canDrag === "function" && !options.canDrag(itemId, event))) {
        event.preventDefault();
        return;
      }
      row.classList.add(draggingClass);
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData(dragType, itemId);
      if (dragType !== "text/plain") event.dataTransfer.setData("text/plain", itemId);
      options.onDragStart?.(itemId, event, row);
    });
    row.addEventListener("dragover", (event) => {
      const draggedId = String(options.getDraggedId?.(event, row) || "");
      if (!draggedId || draggedId === itemId) return;
      if (typeof options.canDrop === "function" && !options.canDrop(draggedId, itemId, event, row)) return;
      event.preventDefault();
      const placeAfter = sortableDropPlacement(row, event, options.axis);
      row.classList.toggle(dropBeforeClass, !placeAfter);
      row.classList.toggle(dropAfterClass, placeAfter);
    });
    row.addEventListener("dragleave", () => {
      row.classList.remove(dropBeforeClass, dropAfterClass);
    });
    row.addEventListener("drop", (event) => {
      const draggedId = String(options.getDraggedId?.(event, row) || event.dataTransfer.getData(dragType) || event.dataTransfer.getData("text/plain") || "");
      if (!draggedId || draggedId === itemId) return;
      if (typeof options.canDrop === "function" && !options.canDrop(draggedId, itemId, event, row)) return;
      event.preventDefault();
      const placeAfter = sortableDropPlacement(row, event, options.axis);
      row.classList.remove(dropBeforeClass, dropAfterClass);
      options.onReorder?.(draggedId, itemId, placeAfter, event, row);
    });
    row.addEventListener("dragend", (event) => {
      row.classList.remove(draggingClass, dropBeforeClass, dropAfterClass);
      options.onDragEnd?.(itemId, event, row);
    });
    return row;
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

  function pointerAngleDegrees(center, event) {
    return Math.atan2(event.clientY - center.y, event.clientX - center.x) * 180 / Math.PI;
  }

  function createRotationHandle(options = {}) {
    const handle = document.createElement("span");
    handle.className = options.className || "layout-rotation-handle";
    handle.title = options.title || "Rotate";
    handle.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const target = options.targetElement || handle.parentElement;
      const rect = target?.getBoundingClientRect?.();
      if (!rect) return;
      const origins = typeof options.origins === "function" ? options.origins(event) : [];
      if (!origins.length) return;
      const center = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      const startAngle = pointerAngleDegrees(center, event);
      options.onStart?.(event);
      capturePointer(handle, event.pointerId);
      const move = (moveEvent) => {
        const delta = pointerAngleDegrees(center, moveEvent) - startAngle;
        const snap = moveEvent.shiftKey ? 15 : 0;
        options.onRotate?.(origins.map((origin) => {
          const next = Number(origin.rotation || 0) + delta;
          return {
            ...origin,
            rotation: snap ? Math.round(next / snap) * snap : next
          };
        }), moveEvent);
      };
      const stop = (stopEvent) => {
        releasePointer(handle, stopEvent.pointerId);
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", stop);
        window.removeEventListener("pointercancel", stop);
        options.onEnd?.(stopEvent);
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", stop, { once: true });
      window.addEventListener("pointercancel", stop, { once: true });
    });
    return handle;
  }

  window.PartyGameToolAffordances = {
    bindToolRowActivation,
    bindSortableRow,
    bindScrollStableControls,
    createRotationHandle,
    createToolAccordionRow,
    createDisclosureButton,
    createToolSidebarRow,
    handleToolDeleteHotkey,
    rectsIntersect,
    startSelectionMarquee,
    targetIsTextEditingControl,
    toggleCollapsedSetForIds
  };
  window.createDisclosureButton = createDisclosureButton;
  window.rectsIntersect = rectsIntersect;
})();
