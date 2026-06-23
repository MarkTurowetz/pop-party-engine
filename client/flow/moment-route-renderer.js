(function () {
  "use strict";

  function createMomentRouteRenderer(context) {
    function renderRouteNodes() {
      const routeNodes = context.flowRouteNodes?.() || [];
      const layer = context.flowNodeLayer?.();
      if (!layer) return;
      for (const [index, routeNode] of routeNodes.entries()) {
        const isDecision = routeNode.routeNodeType === "decision";
        const { x, y } = context.savedNodePosition?.(
          routeNode,
          context.defaultNodePosition?.(index, 2, 860, isDecision ? 360 : 80, 360, 240) || { x: 860, y: isDecision ? 360 : 80 }
        ) || { x: 860, y: isDecision ? 360 : 80 };
        const branches = isDecision ? context.ensureDecisionBranches?.(routeNode, { targetField: "targetNodeId" }) || [] : [];
        const missingBranchTarget = branches.some((branch) => !branch.targetNodeId || context.isNoFlowTarget?.(branch.targetNodeId));
        const targetName = routeNode.targetStateId ? context.flowStateName?.(routeNode.targetStateId) : "No target";
        const node = context.createFlowNode?.({
          id: routeNode.id,
          title: routeNode.name || (isDecision ? "Route Decision" : "Moment Entry"),
          subtitle: isDecision ? `Route Decision / ${context.decisionVariableName?.(routeNode.variable) || routeNode.variable || ""}` : `Moment Entry -> ${targetName}`,
          x,
          y,
          width: isDecision ? 320 : 260,
          height: isDecision ? 134 : 120,
          className: isDecision ? "is-decision is-route-decision" : "is-moment-entry",
          selected: context.selectedFlowRouteNodeId?.() === routeNode.id,
          valueBadge: isDecision
            ? (missingBranchTarget ? { text: "Needs Target", className: "is-warning" } : null)
            : (routeNode.targetStateId ? null : { text: "Needs Target", className: "is-warning" })
        });
        if (!node) continue;
        node.dataset.routeNodeId = routeNode.id;
        delete node.dataset.nodeId;
        const childList = isDecision
          ? context.createFlowNodeBranches?.(null, routeNode, {
              sourceKind: "routeNode",
              targetField: "targetNodeId",
              targetKind: "momentGraph",
              targetName: context.flowRouteTargetName
            })
          : null;
        if (childList) node.appendChild(childList);
        if (!isDecision) node.querySelector(".flow-node-main")?.appendChild(context.createFlowMomentRoutePorts?.(routeNode));
        context.bindFlowNodeDrag?.(node, routeNode);
        node.addEventListener("click", () => {
          context.selectFlowRouteNode?.(routeNode.id);
          context.renderFlowTool?.();
        });
        layer.appendChild(node);
      }
    }

    function renderInspector() {
      if (context.flowNodeDepth?.() !== "moments") return false;
      const routeNode = context.selectedFlowRouteNode?.();
      const inspector = context.flowNodeInspector?.();
      if (!routeNode || !inspector) return false;
      const isRouteDecision = routeNode.routeNodeType === "decision";
      const title = document.createElement("h3");
      title.textContent = routeNode.name || (isRouteDecision ? "Route Decision" : "Moment Entry");
      const copy = document.createElement("p");
      copy.textContent = isRouteDecision
        ? "Route Decisions use the same branch logic as action decisions, but their branch targets live on the moment graph."
        : "Moment Entry nodes are reusable routing anchors on the moment graph. Later decision paths can target these anchors instead of hard-coding a moment jump.";
      inspector.append(title, copy);
      if (!isRouteDecision && !routeNode.targetStateId) {
        inspector.appendChild(context.readOnlyFlowNote?.("Warning: this Moment Entry needs a target or any future path that reaches it will hang."));
      }
      if (isRouteDecision && (context.ensureDecisionBranches?.(routeNode, { targetField: "targetNodeId" }) || []).some((branch) => !branch.targetNodeId || context.isNoFlowTarget?.(branch.targetNodeId))) {
        inspector.appendChild(context.readOnlyFlowNote?.("Warning: every route decision branch should target a moment-layer node, or that branch will halt."));
      }
      inspector.appendChild(context.flowField?.("Name", routeNode.name || (isRouteDecision ? "Route Decision" : "Moment Entry"), (value) => {
        context.pushFlowHistory?.();
        routeNode.name = value || (isRouteDecision ? "Route Decision" : "Moment Entry");
        context.renderFlowListAndPublish?.();
        context.renderFlowNodeView?.();
      }));
      if (isRouteDecision) {
        context.appendDecisionControls?.(inspector, null, routeNode, (redrawNodeView = true) => {
          if (redrawNodeView) {
            context.refreshFlowNodeInspectorChange?.();
            return;
          }
          context.renderFlowListAndPublish?.();
          context.redrawFlowNodeWires?.();
        }, {
          targetField: "targetNodeId",
          targetOptions: (stateForOptions, actionForOptions, branch) => context.flowRouteGraphTargetOptions?.(branch.targetNodeId || "", actionForOptions.id) || []
        });
        inspector.appendChild(context.flowActionButton?.("Delete Route Decision", () => {
          context.deleteSelectedFlowRouteNode?.();
        }));
        return true;
      }
      inspector.appendChild(context.flowSelect?.("Target Moment", routeNode.targetStateId || "", context.flowMomentEntryTargetOptions?.(routeNode.targetStateId || "") || [], (value) => {
        context.pushFlowHistory?.();
        routeNode.targetStateId = value;
        context.renderFlowListAndPublish?.();
        context.renderFlowNodeView?.();
      }));
      inspector.appendChild(context.flowActionButton?.("Delete Moment Entry", () => {
        context.deleteSelectedFlowRouteNode?.();
      }));
      return true;
    }

    return {
      renderInspector,
      renderRouteNodes
    };
  }

  window.PartyGameFlowMomentRouteRenderer = { createMomentRouteRenderer };
})();
