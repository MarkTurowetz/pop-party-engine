(function () {
  "use strict";

  function createMomentRouteWires(context) {
    const routeNodeTypes = window.PartyGameFlowMomentRouteNodeTypes;

    function isRouteDecisionNode(routeNode) {
      if (routeNodeTypes?.isDecision) return routeNodeTypes.isDecision(routeNode);
      return routeNode?.routeNodeType === "decision" || (routeNode?.routeNodeType === "action" && routeNode?.type === "decision");
    }

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
      const descriptors = context.flowNodeBranchDescriptors?.()?.descriptorsFor(null, routeNode, {
        sourceKind: "routeNode",
        targetField: "targetNodeId",
        targetKind: "momentGraph"
      }) || [];
      for (const descriptor of descriptors) {
        const { branch } = descriptor;
        const sourceNode = planner.branchSourceNode(layer, {
          branchId: branch.id,
          sourceId: routeNode.id,
          sourceKind: "routeNode"
        }, fromNode);
        planner.drawTargetWire(nodeMaps, {
          fromNode: sourceNode,
          targetId: descriptor.targetId,
          targetKind: descriptor.targetKind,
          options: {
            highlighted: context.selectedFlowRouteNodeId?.() === routeNode.id
              && (!context.selectedFlowRouteBranchId?.() || context.selectedFlowRouteBranchId?.() === branch.id),
            label: context.decisionBranchWireLabel?.(branch, descriptor.index) || ""
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
        if (isRouteDecisionNode(routeNode)) {
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
