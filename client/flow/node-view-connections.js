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
      return context.connectionPlanner?.()?.sourceNode(context.flowNodeLayer?.(), pending) || null;
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

    function targetNodeSummary(targetNode) {
      if (!targetNode) return "";
      return targetNode.dataset?.actionId
        || targetNode.dataset?.routeNodeId
        || targetNode.dataset?.nodeId
        || targetNode.dataset?.branchId
        || "";
    }

    function debugDrop(status, reason, targetNode = null, targetId = "") {
      context.showConnectionDebug?.({
        pending,
        reason,
        status,
        targetId,
        targetNode: targetNodeSummary(targetNode)
      });
    }

    function connectPendingSourceToTarget(targetId) {
      return Boolean(context.connectionPlanner?.()?.connect(pending, targetId));
    }

    function createAction(event) {
      if (!pending) {
        debugDrop("blocked", "no pending connection");
        return false;
      }
      const point = context.flowNodeLocalPoint?.(event) || { x: 0, y: 0 };
      const creation = context.connectionPlanner?.()?.createTarget(pending, point, context.flowNodeDepth?.());
      if (!creation?.collection || !creation.node || !creation.targetId) {
        debugDrop("blocked", "could not create target");
        return false;
      }
      context.pushFlowHistory?.();
      creation.collection.push(creation.node);
      connectPendingSourceToTarget(creation.targetId);
      debugDrop("connected", "created target", null, creation.targetId);
      pending = null;
      if (creation.selectionKind === "routeNode") {
        context.selectFlowRouteNode?.(creation.targetId);
      } else {
        context.setFlowActionSelection?.([creation.targetId]);
      }
      context.renderFlowListAndPublish?.();
      context.renderFlowNodeView?.();
      return true;
    }

    function complete(targetNode) {
      if (!pending) {
        debugDrop("blocked", "no pending connection", targetNode);
        return false;
      }
      const planner = context.connectionPlanner?.();
      const source = planner?.connectionSource(pending);
      if (!source) {
        debugDrop("blocked", "missing source", targetNode);
        return false;
      }
      const targetId = planner.targetIdForNode(pending, targetNode);
      if (!targetId) {
        debugDrop("blocked", "missing target id", targetNode);
        return false;
      }
      if (source.selfId && targetId === source.selfId) {
        debugDrop("blocked", "cannot target itself", targetNode, targetId);
        return false;
      }
      if (targetId === source.currentTarget()) {
        debugDrop("blocked", "already connected", targetNode, targetId);
        return false;
      }
      context.pushFlowHistory?.();
      source.setTarget(targetId);
      debugDrop("connected", "set target", targetNode, targetId);
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
