(function () {
  "use strict";

  function createFlowNodeMarqueeController(context) {
    function selectedItemSelector() {
      return context.flowNodeDepth?.() === "moments"
        ? ".flow-node[data-node-id]"
        : ".flow-node[data-action-id]";
    }

    function selectedItemId(node) {
      return context.flowNodeDepth?.() === "moments" ? node.dataset.nodeId : node.dataset.actionId;
    }

    function applyMomentSelection(selectedIds) {
      const layer = context.flowNodeLayer?.();
      context.setMomentMarqueeSelection?.(selectedIds);
      for (const node of layer?.querySelectorAll(".flow-node[data-node-id]") || []) {
        node.classList.toggle("is-selected", Boolean(context.flowMomentNodeIsSelected?.(node.dataset.nodeId)));
      }
    }

    function applyActionSelection(selectedIds) {
      const layer = context.flowNodeLayer?.();
      context.setFlowActionSelection?.(selectedIds);
      for (const node of layer?.querySelectorAll(".flow-node[data-action-id]") || []) {
        node.classList.toggle("is-selected", Boolean(context.flowActionIsSelected?.(node.dataset.actionId)));
      }
    }

    function start(event) {
      if (event.button !== 0 || context.flowViewMode?.() !== "node") return false;
      if (context.hasPendingConnection?.()) return false;
      const graph = context.flowNodeGraph?.();
      const layer = context.flowNodeLayer?.();
      if (!graph || !layer) return false;
      return context.startSelectionMarquee?.(event, {
        root: graph,
        itemRoot: layer,
        marqueeRoot: layer,
        className: "flow-node-selection-marquee",
        itemSelector: selectedItemSelector(),
        coordinateScale: context.flowNodeZoom?.(),
        getItemId: selectedItemId,
        shouldIgnoreTarget: (target) => Boolean(target.closest?.(".flow-node, .flow-node-port-dot")),
        onSelectionChange: (selectedIds) => {
          if (context.flowNodeDepth?.() === "moments") {
            applyMomentSelection(selectedIds);
          } else {
            applyActionSelection(selectedIds);
          }
          context.renderFlowList?.();
          context.renderFlowNodeInspector?.();
        },
        onComplete: () => context.renderFlowTool?.()
      });
    }

    return { start };
  }

  window.PartyGameFlowNodeMarquee = { createFlowNodeMarqueeController };
})();
