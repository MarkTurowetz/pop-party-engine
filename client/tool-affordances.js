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
    createDisclosureButton,
    rectsIntersect,
    startSelectionMarquee,
    toggleCollapsedSetForIds
  };
  window.createDisclosureButton = createDisclosureButton;
  window.rectsIntersect = rectsIntersect;
})();
