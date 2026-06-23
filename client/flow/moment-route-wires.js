(function () {
  "use strict";

  function createMomentRouteWires(context) {
    function selectedActionIds() {
      return context.selectedFlowActionIds?.() || new Set();
    }

    function stateNodeMap(layer) {
      return new Map(Array.from(layer.querySelectorAll(".flow-node[data-node-id]"))
        .map((node) => [node.dataset.nodeId, node]));
    }

    function routeNodeMap(layer) {
      return new Map(Array.from(layer.querySelectorAll(".flow-node[data-route-node-id]"))
        .map((node) => [node.dataset.routeNodeId, node]));
    }

    function branchNode(layer, routeNode, branch) {
      return layer.querySelector(`.flow-node[data-route-node-id="${context.cssEscape?.(routeNode.id) || routeNode.id}"] .flow-node-branch[data-branch-id="${context.cssEscape?.(branch.id) || branch.id}"]`);
    }

    function drawStateWires(stateNodes, routeNodes) {
      const selectedIds = selectedActionIds();
      for (const state of context.gameStates?.() || []) {
        const fromNode = stateNodes.get(state.id);
        const toNode = context.targetNode?.(stateNodes, routeNodes, state.nextStateTargetId);
        if (!fromNode || !toNode) continue;
        context.drawNodeWire?.(fromNode, toNode, {
          highlighted: context.selectedFlowStateId?.() === state.id || selectedIds.has(state.id)
        });
      }
    }

    function drawRouteDecisionWires(layer, stateNodes, routeNodes, routeNode, fromNode) {
      const branches = context.ensureDecisionBranches?.(routeNode, { targetField: "targetNodeId" }) || [];
      for (const [index, branch] of branches.entries()) {
        const toNode = context.targetNode?.(stateNodes, routeNodes, branch.targetNodeId);
        if (!toNode) continue;
        const sourceNode = branchNode(layer, routeNode, branch) || fromNode;
        context.drawNodeWire?.(sourceNode, toNode, {
          highlighted: context.selectedFlowRouteNodeId?.() === routeNode.id,
          label: context.decisionBranchWireLabel?.(branch, index) || ""
        });
      }
    }

    function drawMomentEntryWire(stateNodes, routeNode, fromNode) {
      const toNode = routeNode.targetStateId ? stateNodes.get(routeNode.targetStateId) : null;
      if (!toNode) return;
      context.drawNodeWire?.(fromNode, toNode, {
        highlighted: context.selectedFlowRouteNodeId?.() === routeNode.id,
        label: "Entry"
      });
    }

    function drawRouteWires(layer, stateNodes, routeNodes) {
      for (const routeNode of context.flowRouteNodes?.() || []) {
        const fromNode = routeNodes.get(routeNode.id);
        if (!fromNode) continue;
        if (routeNode.routeNodeType === "decision") {
          drawRouteDecisionWires(layer, stateNodes, routeNodes, routeNode, fromNode);
          continue;
        }
        drawMomentEntryWire(stateNodes, routeNode, fromNode);
      }
    }

    function redraw() {
      const layer = context.flowNodeLayer?.();
      if (!layer) return;
      const stateNodes = stateNodeMap(layer);
      const routeNodes = routeNodeMap(layer);
      drawStateWires(stateNodes, routeNodes);
      drawRouteWires(layer, stateNodes, routeNodes);
      context.renderFlowNodeMinimap?.();
    }

    return { redraw };
  }

  window.PartyGameFlowMomentRouteWires = { createMomentRouteWires };
})();
