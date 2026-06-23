(function () {
  "use strict";

  const CHILD_DRAG_TYPE = "application/x-flow-node-child";

  function hasDragType(event) {
    return Array.from(event.dataTransfer?.types || []).includes(CHILD_DRAG_TYPE);
  }

  function createFlowNodeChildSortController(context) {
    function canDrag(parentAction, collectionName, childId, options = {}) {
      return collectionName !== "branches";
    }

    function reorder(parentAction, collectionName, draggedId, targetId, options = {}) {
      if (collectionName === "branches") return false;
      const items = parentAction?.[collectionName] || [];
      const fromIndex = items.findIndex((item) => item.id === draggedId);
      const toIndex = items.findIndex((item) => item.id === targetId);
      if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return false;
      context.pushFlowHistory?.();
      const [moved] = items.splice(fromIndex, 1);
      const adjustedIndex = fromIndex < toIndex ? toIndex - 1 : toIndex;
      items.splice(adjustedIndex, 0, moved);
      context.renderFlowListAndPublish?.();
      context.renderFlowNodeView?.();
      return true;
    }

    function bind(item, parentAction, collectionName, childId, options = {}) {
      item.draggable = canDrag(parentAction, collectionName, childId, options);
      item.addEventListener("dragstart", (event) => {
        if (event.target?.closest?.(".flow-node-port-dot")) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        event.stopPropagation();
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData(CHILD_DRAG_TYPE, JSON.stringify({
          parentActionId: parentAction.id,
          collectionName,
          childId
        }));
      });
      item.addEventListener("dragover", (event) => {
        if (hasDragType(event)) event.preventDefault();
      });
      item.addEventListener("drop", (event) => {
        event.preventDefault();
        event.stopPropagation();
        try {
          const payload = JSON.parse(event.dataTransfer.getData(CHILD_DRAG_TYPE));
          if (payload.parentActionId === parentAction.id && payload.collectionName === collectionName) {
            reorder(parentAction, collectionName, payload.childId, childId, options);
          }
        } catch (error) {
          // Ignore malformed drag payloads from outside the tool.
        }
      });
    }

    return { bind, reorder };
  }

  window.PartyGameFlowNodeChildSort = { createFlowNodeChildSortController };
})();
