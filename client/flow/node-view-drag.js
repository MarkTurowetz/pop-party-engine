(function () {
  "use strict";

  function createFlowNodeDragController(context) {
    function getZoom() {
      return Number(context.flowNodeZoom?.() || 1) || 1;
    }

    function nodeForItem(item) {
      const layer = context.flowNodeLayer?.();
      if (!layer || !item?.id) return null;
      const id = context.cssEscape(item.id);
      return layer.querySelector(`.flow-node[data-action-id="${id}"], .flow-node[data-node-id="${id}"]`);
    }

    function selectedMovingItems(item) {
      if (context.flowNodeDepth?.() === "actions" && item?.type) {
        const selectedActions = context.selectedPrimaryFlowActions?.() || [];
        return selectedActions.some((action) => action.id === item.id) ? selectedActions : [item];
      }
      if (context.flowNodeDepth?.() === "moments" && !item?.type) {
        const selectedStates = context.selectedFlowMomentStates?.() || [];
        return selectedStates.some((state) => state.id === item.id) ? selectedStates : [item];
      }
      return [item];
    }

    function dragOriginFor(node, item) {
      const itemNode = nodeForItem(item);
      const fallbackNode = itemNode || node;
      const fallback = {
        x: Number(fallbackNode?.dataset.x || 0),
        y: Number(fallbackNode?.dataset.y || 0)
      };
      return context.savedNodePosition?.(item, fallback) || fallback;
    }

    function bind(node, item, { afterDrag = null } = {}) {
      let drag = null;

      node.addEventListener("click", (event) => {
        if (node.dataset.skipClick !== "true") return;
        event.preventDefault();
        event.stopImmediatePropagation();
        delete node.dataset.skipClick;
      }, true);

      node.addEventListener("pointerdown", (event) => {
        if (event.target.closest(".flow-node-port-dot") || event.target.closest(".flow-node-subaction")) return;
        const movingItems = selectedMovingItems(item);
        drag = {
          pointerId: event.pointerId,
          startX: event.clientX,
          startY: event.clientY,
          nodeX: Number(node.dataset.x || 0),
          nodeY: Number(node.dataset.y || 0),
          movingItems,
          origins: new Map(movingItems.map((movingItem) => [movingItem.id, dragOriginFor(node, movingItem)])),
          moved: false,
          lockAxis: ""
        };
        node.setPointerCapture?.(event.pointerId);
      });

      node.addEventListener("pointermove", (event) => {
        if (!drag || drag.pointerId !== event.pointerId) return;
        let dx = (event.clientX - drag.startX) / getZoom();
        let dy = (event.clientY - drag.startY) / getZoom();
        if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
        if (event.shiftKey) {
          if (!drag.lockAxis && Math.abs(dx) + Math.abs(dy) > 4) {
            drag.lockAxis = Math.abs(dx) >= Math.abs(dy) ? "x" : "y";
          }
          if (drag.lockAxis === "x") dy = 0;
          if (drag.lockAxis === "y") dx = 0;
        } else {
          drag.lockAxis = "";
        }
        let x = drag.nodeX + dx;
        let y = drag.nodeY + dy;
        if (event.shiftKey && event.metaKey) {
          x = Math.round(x / 10) * 10;
          y = Math.round(y / 10) * 10;
        }
        for (const movingItem of drag.movingItems) {
          const origin = drag.origins.get(movingItem.id) || { x: drag.nodeX, y: drag.nodeY };
          let itemX = origin.x + (x - drag.nodeX);
          let itemY = origin.y + (y - drag.nodeY);
          if (event.shiftKey && event.metaKey) {
            itemX = Math.round(itemX / 10) * 10;
            itemY = Math.round(itemY / 10) * 10;
          }
          const movingNode = nodeForItem(movingItem);
          if (movingNode) {
            movingNode.dataset.x = String(itemX);
            movingNode.dataset.y = String(itemY);
            movingNode.style.left = `${itemX}px`;
            movingNode.style.top = `${itemY}px`;
          }
        }
        context.redrawFlowNodeWires?.();
        context.renderFlowNodeMinimap?.();
      });

      const finish = (event) => {
        if (!drag || drag.pointerId !== event.pointerId) return;
        node.releasePointerCapture?.(event.pointerId);
        if (drag.moved) {
          context.pushFlowHistory?.();
          node.dataset.skipClick = "true";
          window.setTimeout(() => delete node.dataset.skipClick, 0);
          for (const movingItem of drag.movingItems) {
            const movingNode = nodeForItem(movingItem);
            if (movingNode) {
              movingItem.nodePosition = {
                x: Math.round(Number(movingNode.dataset.x || 0)),
                y: Math.round(Number(movingNode.dataset.y || 0))
              };
            }
          }
          context.renderFlowListAndPublish?.();
          afterDrag?.();
          context.renderFlowNodeView?.();
        }
        drag = null;
      };

      node.addEventListener("pointerup", finish);
      node.addEventListener("pointercancel", finish);
    }

    return { bind };
  }

  window.PartyGameFlowNodeDrag = { createFlowNodeDragController };
})();
