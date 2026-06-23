(function () {
  "use strict";

  function createFlowNodeMinimap(context) {
    const graph = () => context.flowNodeGraph?.() || null;
    const layer = () => context.flowNodeLayer?.() || null;
    const minimap = () => context.flowNodeMinimap?.() || null;
    const stage = () => context.flowNodeStage?.() || null;
    const viewport = () => context.flowNodeMinimapViewport?.() || null;
    const zoom = () => Number(context.flowNodeZoom?.() || 1) || 1;
    const bounds = () => context.flowGraphNodeBounds?.() || { minX: 0, minY: 0, width: 1, height: 1, nodes: [] };

    function position() {
      const map = minimap();
      const viewStage = stage();
      if (!map || !viewStage) return;
      map.style.left = `${viewStage.scrollLeft + viewStage.clientWidth - map.offsetWidth - 14}px`;
      map.style.top = `${viewStage.scrollTop + 14}px`;
    }

    function render() {
      const map = minimap();
      const view = viewport();
      const viewStage = stage();
      const nodeLayer = layer();
      if (!map || !view || !viewStage || !nodeLayer) return;
      const graphBounds = bounds();
      const width = map.clientWidth || 190;
      const height = map.clientHeight || 132;
      const scale = Math.min(width / Math.max(1, graphBounds.width), height / Math.max(1, graphBounds.height));
      Array.from(map.querySelectorAll(".flow-node-minimap-node")).forEach((item) => item.remove());
      for (const item of graphBounds.nodes) {
        const mini = document.createElement("div");
        const id = context.flowNodeDepth?.() === "moments"
          ? item.node.dataset.nodeId || item.node.dataset.routeNodeId
          : item.node.dataset.actionId || item.node.dataset.nodeId;
        const selectedRouteNodeId = context.selectedFlowRouteNodeId?.() || "";
        const selected = context.flowNodeDepth?.() === "moments"
          ? Boolean(id && (selectedRouteNodeId ? selectedRouteNodeId === id : context.selectedFlowStateId?.() === id || context.flowActionIsSelected?.(id)))
          : Boolean(id && (context.flowActionIsSelected?.(id) || context.selectedFlowStateId?.() === id));
        mini.className = `flow-node-minimap-node${context.flowNodeDepth?.() === "actions" ? " is-action" : ""}${selected ? " is-selected" : ""}`;
        mini.style.left = `${(item.x - graphBounds.minX) * scale}px`;
        mini.style.top = `${(item.y - graphBounds.minY) * scale}px`;
        mini.style.width = `${Math.max(4, (item.right - item.x) * scale)}px`;
        mini.style.height = `${Math.max(4, (item.bottom - item.y) * scale)}px`;
        map.insertBefore(mini, view);
      }
      const viewLeft = viewStage.scrollLeft / zoom();
      const viewTop = viewStage.scrollTop / zoom();
      const rawViewWidth = (viewStage.clientWidth / zoom()) * scale;
      const rawViewHeight = (viewStage.clientHeight / zoom()) * scale;
      const viewportWidth = Math.min(width, Math.max(8, rawViewWidth));
      const viewportHeight = Math.min(height, Math.max(8, rawViewHeight));
      const viewportLeft = Math.max(0, Math.min(width - viewportWidth, (viewLeft - graphBounds.minX) * scale));
      const viewportTop = Math.max(0, Math.min(height - viewportHeight, (viewTop - graphBounds.minY) * scale));
      view.style.left = `${viewportLeft}px`;
      view.style.top = `${viewportTop}px`;
      view.style.width = `${viewportWidth}px`;
      view.style.height = `${viewportHeight}px`;
      position();
    }

    function centerOnGraphPoint(graphX, graphY) {
      const viewStage = stage();
      const root = graph();
      if (!viewStage || !root) return;
      const maxLeft = Math.max(0, root.offsetWidth - viewStage.clientWidth);
      const maxTop = Math.max(0, root.offsetHeight - viewStage.clientHeight);
      viewStage.scrollLeft = Math.max(0, Math.min(maxLeft, graphX * zoom() - viewStage.clientWidth / 2));
      viewStage.scrollTop = Math.max(0, Math.min(maxTop, graphY * zoom() - viewStage.clientHeight / 2));
      render();
    }

    function graphPoint(event) {
      const map = minimap();
      if (!map) return { x: 0, y: 0 };
      const rect = map.getBoundingClientRect();
      const graphBounds = bounds();
      const scale = Math.min(rect.width / Math.max(1, graphBounds.width), rect.height / Math.max(1, graphBounds.height));
      const localX = Math.max(0, Math.min(rect.width, event.clientX - rect.left));
      const localY = Math.max(0, Math.min(rect.height, event.clientY - rect.top));
      return {
        x: graphBounds.minX + localX / Math.max(0.0001, scale),
        y: graphBounds.minY + localY / Math.max(0.0001, scale)
      };
    }

    function jump(event) {
      if (!stage() || !minimap()) return;
      event.preventDefault();
      event.stopPropagation();
      const point = graphPoint(event);
      centerOnGraphPoint(point.x, point.y);
    }

    function startDrag(event) {
      const map = minimap();
      if (!map || event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      map.setPointerCapture?.(event.pointerId);
      const move = (moveEvent) => {
        if (moveEvent.pointerId !== event.pointerId) return;
        const point = graphPoint(moveEvent);
        centerOnGraphPoint(point.x, point.y);
      };
      const stop = (stopEvent) => {
        if (stopEvent.pointerId !== event.pointerId) return;
        map.releasePointerCapture?.(stopEvent.pointerId);
        map.removeEventListener("pointermove", move);
        map.removeEventListener("pointerup", stop);
        map.removeEventListener("pointercancel", stop);
      };
      move(event);
      map.addEventListener("pointermove", move);
      map.addEventListener("pointerup", stop);
      map.addEventListener("pointercancel", stop);
    }

    return {
      centerOnGraphPoint,
      graphPoint,
      jump,
      position,
      render,
      startDrag
    };
  }

  window.PartyGameFlowNodeMinimap = { createFlowNodeMinimap };
})();
