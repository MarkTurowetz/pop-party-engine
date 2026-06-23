(function () {
  "use strict";

  function createMomentRouteWires(context) {
    function selectedActionIds() {
      return context.selectedFlowActionIds?.() || new Set();
    }

    function drawStateWires(planner, nodeMaps) {
      const selectedIds = selectedActionIds();
      for (const state of context.gameStates?.() || []) {
        const fromNode = nodeMaps.states.get(state.id);
        planner.drawTargetWire(nodeMaps, {
          fromNode,
          targetId: state.nextStateTargetId,
          targetKind: "momentGraph",
          options: {
            highlighted: context.selectedFlowStateId?.() === state.id || selectedIds.has(state.id)
          }
        });
      }
    }

    function drawRouteDecisionWires(planner, nodeMaps, layer, routeNode, fromNode) {
      const branches = context.ensureDecisionBranches?.(routeNode, { targetField: "targetNodeId" }) || [];
      for (const [index, branch] of branches.entries()) {
        const sourceNode = planner.branchSourceNode(layer, {
          branchId: branch.id,
          sourceId: routeNode.id,
          sourceKind: "routeNode"
        }, fromNode);
        planner.drawTargetWire(nodeMaps, {
          fromNode: sourceNode,
          targetId: branch.targetNodeId,
          targetKind: "momentGraph",
          options: {
            highlighted: context.selectedFlowRouteNodeId?.() === routeNode.id,
            label: context.decisionBranchWireLabel?.(branch, index) || ""
          }
        });
      }
    }

    function drawMomentEntryWire(planner, nodeMaps, routeNode, fromNode) {
      planner.drawTargetWire(nodeMaps, {
        fromNode,
        targetId: routeNode.targetStateId,
        targetKind: "state",
        options: {
          highlighted: context.selectedFlowRouteNodeId?.() === routeNode.id,
          label: "Entry"
        }
      });
    }

    function drawRouteActionWire(planner, nodeMaps, routeNode, fromNode) {
      planner.drawTargetWire(nodeMaps, {
        fromNode,
        targetId: routeNode.nextTargetNodeId,
        targetKind: "momentGraph",
        options: {
          highlighted: context.selectedFlowRouteNodeId?.() === routeNode.id,
          label: "Next"
        }
      });
    }

    function drawRouteWires(planner, nodeMaps, layer) {
      for (const routeNode of context.flowRouteNodes?.() || []) {
        const fromNode = nodeMaps.routes.get(routeNode.id);
        if (!fromNode) continue;
        if (routeNode.routeNodeType === "decision") {
          drawRouteDecisionWires(planner, nodeMaps, layer, routeNode, fromNode);
          continue;
        }
        if (routeNode.routeNodeType === "action") {
          drawRouteActionWire(planner, nodeMaps, routeNode, fromNode);
          continue;
        }
        drawMomentEntryWire(planner, nodeMaps, routeNode, fromNode);
      }
    }

    function redraw() {
      const layer = context.flowNodeLayer?.();
      if (!layer) return;
      const planner = context.nodeWirePlanner?.();
      if (!planner) return;
      const nodeMaps = planner.maps(layer);
      drawStateWires(planner, nodeMaps);
      drawRouteWires(planner, nodeMaps, layer);
      context.renderFlowNodeMinimap?.();
    }

    return { redraw };
  }

  window.PartyGameFlowMomentRouteWires = { createMomentRouteWires };
})();
