(function () {
  "use strict";

  function createFlowNodeConnectionController(context) {
    let pending = null;

    function portDots() {
      return context.flowNodeLayer?.()?.querySelectorAll(".flow-node-port-dot") || [];
    }

    function arm({ connection, dot, hint }) {
      pending = connection || null;
      portDots().forEach((item) => item.classList.remove("is-armed"));
      dot?.classList.add("is-armed");
      const hintNode = context.flowNodeHint?.();
      if (hintNode) hintNode.textContent = hint || "Release over a node to connect this exit.";
    }

    function reset() {
      pending = null;
    }

    function hasPending() {
      return Boolean(pending);
    }

    function shouldCreateAction(event) {
      return Boolean(pending?.commandCreate || event?.metaKey);
    }

    function sourceNode() {
      const layer = context.flowNodeLayer?.();
      if (!pending || !layer) return null;
      if (pending.sourceKind === "moment") {
        return layer.querySelector(`.flow-node[data-node-id="${context.cssEscape(pending.stateId)}"]`);
      }
      if (pending.sourceKind === "routeNode") {
        return layer.querySelector(`.flow-node[data-route-node-id="${context.cssEscape(pending.routeNodeId)}"]`);
      }
      if (pending.sourceKind === "start") {
        return layer.querySelector('.flow-node[data-node-id="start"]');
      }
      if (pending.branchId) {
        return layer.querySelector(`.flow-node-branch[data-branch-id="${context.cssEscape(pending.branchId)}"]`);
      }
      return layer.querySelector(`.flow-node[data-action-id="${context.cssEscape(pending.actionId)}"]`);
    }

    function redrawPreview(event) {
      if (!pending || !event?.metaKey) return;
      context.redrawFlowNodeWires?.();
      context.drawPreviewNodeWire?.(sourceNode(), context.flowNodeLocalPoint?.(event));
    }

    function handlePointerMove(event) {
      if (!pending || pending.pointerId !== event.pointerId) return;
      if (event.metaKey) {
        pending.commandCreate = true;
        redrawPreview(event);
      }
    }

    function createAction(event) {
      if (!pending || pending.targetKind !== "action" || context.flowNodeDepth?.() !== "actions") return false;
      const state = context.flowState?.(pending.stateId);
      const sourceAction = pending.sourceKind === "start" ? null : context.flowAction?.(state?.id, pending.actionId);
      if (!state || (pending.sourceKind !== "start" && !sourceAction)) return false;
      const point = context.flowNodeLocalPoint?.(event) || { x: 0, y: 0 };
      const nextNumber = state.actions.length + 1;
      const action = context.createDefaultFlowAction(state.id, `Game Action ${nextNumber}`, false);
      action.nodePosition = {
        x: Math.max(0, Math.round(point.x - 130)),
        y: Math.max(0, Math.round(point.y - 67))
      };
      context.pushFlowHistory?.();
      state.actions.push(action);
      connectSourceToTarget(sourceAction, action.id);
      pending = null;
      context.setFlowActionSelection?.([action.id]);
      context.renderFlowListAndPublish?.();
      context.renderFlowNodeView?.();
      return true;
    }

    function connectSourceToTarget(sourceAction, targetId) {
      if (!pending) return;
      if (pending.sourceKind === "start") {
        const state = context.flowState?.(pending.stateId);
        if (state) state.entryTargetActionId = targetId;
        return;
      }
      if (pending.branchId) {
        const branch = context.decisionBranchById?.(sourceAction, pending.branchId);
        if (branch) branch.targetActionId = targetId;
        return;
      }
      if (sourceAction) sourceAction[pending.field] = targetId;
    }

    function targetIdForNode(targetNode) {
      if (!targetNode) return "";
      if (pending?.targetKind === "state") return targetNode.dataset.nodeId || "";
      if (pending?.targetKind === "momentGraph") return targetNode.dataset.nodeId || targetNode.dataset.routeNodeId || "";
      return targetNode.dataset.actionId || "";
    }

    function complete(targetNode) {
      if (!pending) return false;
      if (pending.sourceKind === "routeNode") {
        const routeNode = context.flowRouteNode?.(pending.routeNodeId);
        const targetId = targetIdForNode(targetNode);
        if (!routeNode || !targetId || targetId === routeNode.targetStateId) return false;
        if (targetId === routeNode.id) return false;
        if (pending.branchId) {
          const branch = context.decisionBranchById?.(routeNode, pending.branchId, { targetField: pending.field });
          if (!branch) return false;
          context.pushFlowHistory?.();
          branch[pending.field] = targetId;
        } else {
          context.pushFlowHistory?.();
          routeNode[pending.field] = targetId;
        }
        pending = null;
        context.renderFlowListAndPublish?.();
        context.renderFlowNodeView?.();
        return true;
      }
      const state = context.flowState?.(pending.stateId);
      if (!state) return false;
      const action = pending.sourceKind === "moment" || pending.sourceKind === "start"
        ? null
        : context.flowAction?.(state.id, pending.actionId);
      if (pending.sourceKind !== "moment" && pending.sourceKind !== "start" && !action) return false;
      const targetId = targetIdForNode(targetNode);
      if (!targetId) return false;
      if (pending.sourceKind === "moment") {
        if (targetId === state.id) return false;
        context.pushFlowHistory?.();
        state[pending.field] = targetId;
        pending = null;
        context.renderFlowListAndPublish?.();
        context.renderFlowNodeView?.();
        return true;
      }
      if (pending.sourceKind !== "start" && targetId === action.id) return false;
      context.pushFlowHistory?.();
      connectSourceToTarget(action, targetId);
      pending = null;
      context.renderFlowListAndPublish?.();
      context.renderFlowNodeView?.();
      return true;
    }

    function clear() {
      portDots().forEach((item) => item.classList.remove("is-armed"));
      pending = null;
      context.redrawFlowNodeWires?.();
      const hintNode = context.flowNodeHint?.();
      if (hintNode) hintNode.textContent = "Drag from an exit dot to another node to create a connection.";
    }

    return {
      arm,
      clear,
      complete,
      createAction,
      handlePointerMove,
      hasPending,
      reset,
      shouldCreateAction
    };
  }

  window.PartyGameFlowNodeConnections = { createFlowNodeConnectionController };
})();
