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

    function pendingSourceKind() {
      return pending?.sourceKind || "action";
    }

    function escaped(value) {
      return context.cssEscape?.(value) || value;
    }

    function shouldCreateAction(event) {
      return Boolean(pending?.commandCreate || event?.metaKey);
    }

    function sourceNode() {
      const layer = context.flowNodeLayer?.();
      if (!pending || !layer) return null;
      const kind = pendingSourceKind();
      if (pending.branchId) {
        const parentSelector = kind === "routeNode"
          ? `.flow-node[data-route-node-id="${escaped(pending.routeNodeId)}"]`
          : `.flow-node[data-action-id="${escaped(pending.actionId)}"]`;
        const branchNode = layer.querySelector(`${parentSelector} .flow-node-branch[data-branch-id="${escaped(pending.branchId)}"]`);
        if (branchNode) return branchNode;
      }
      if (kind === "moment") {
        return layer.querySelector(`.flow-node[data-node-id="${escaped(pending.stateId)}"]`);
      }
      if (kind === "routeNode") {
        return layer.querySelector(`.flow-node[data-route-node-id="${escaped(pending.routeNodeId)}"]`);
      }
      if (kind === "start") {
        return layer.querySelector('.flow-node[data-node-id="start"]');
      }
      return layer.querySelector(`.flow-node[data-action-id="${escaped(pending.actionId)}"]`);
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

    function connectionSource() {
      if (!pending) return null;
      const kind = pendingSourceKind();
      if (kind === "moment") {
        const state = context.flowState?.(pending.stateId);
        if (!state) return null;
        const field = pending.field || "nextStateTargetId";
        return {
          kind,
          selfId: state.id,
          currentTarget: () => state[field] || "",
          setTarget: (targetId) => { state[field] = targetId; }
        };
      }
      if (kind === "routeNode") {
        const routeNode = context.flowRouteNode?.(pending.routeNodeId);
        if (!routeNode) return null;
        const field = pending.field || "nextTargetNodeId";
        const branch = pending.branchId
          ? context.decisionBranchById?.(routeNode, pending.branchId, { targetField: field })
          : null;
        if (pending.branchId && !branch) return null;
        return {
          kind,
          selfId: routeNode.id,
          currentTarget: () => branch ? branch[field] || "" : routeNode[field] || "",
          setTarget: (targetId) => {
            if (branch) branch[field] = targetId;
            else routeNode[field] = targetId;
          }
        };
      }
      if (kind === "start") {
        const state = context.flowState?.(pending.stateId);
        if (!state) return null;
        const field = pending.field || "entryTargetActionId";
        return {
          kind,
          selfId: "",
          currentTarget: () => state[field] || "",
          setTarget: (targetId) => { state[field] = targetId; }
        };
      }
      const state = context.flowState?.(pending.stateId);
      const action = context.flowAction?.(state?.id, pending.actionId);
      if (!state || !action) return null;
      const field = pending.field || "targetActionId";
      const branch = pending.branchId
        ? context.decisionBranchById?.(action, pending.branchId, { targetField: field })
        : null;
      if (pending.branchId && !branch) return null;
      return {
        kind: "action",
        selfId: action.id,
        currentTarget: () => branch ? branch[field] || "" : action[field] || "",
        setTarget: (targetId) => {
          if (branch) branch[field] = targetId;
          else action[field] = targetId;
        }
      };
    }

    function connectPendingSourceToTarget(targetId) {
      const source = connectionSource();
      if (!source) return false;
      source.setTarget(targetId);
      return true;
    }

    function createAction(event) {
      if (pending?.targetKind === "momentGraph" && context.flowNodeDepth?.() === "moments") {
        return createMomentGraphAction(event);
      }
      if (!pending || pending.targetKind !== "action" || context.flowNodeDepth?.() !== "actions") return false;
      const source = connectionSource();
      if (!source || (source.kind !== "start" && source.kind !== "action")) return false;
      const state = context.flowState?.(pending.stateId);
      if (!state) return false;
      const point = context.flowNodeLocalPoint?.(event) || { x: 0, y: 0 };
      const nextNumber = state.actions.length + 1;
      const action = context.createDefaultFlowAction(state.id, `Game Action ${nextNumber}`, false);
      action.nodePosition = {
        x: Math.max(0, Math.round(point.x - 130)),
        y: Math.max(0, Math.round(point.y - 67))
      };
      context.pushFlowHistory?.();
      state.actions.push(action);
      connectPendingSourceToTarget(action.id);
      pending = null;
      context.setFlowActionSelection?.([action.id]);
      context.renderFlowListAndPublish?.();
      context.renderFlowNodeView?.();
      return true;
    }

    function createMomentGraphAction(event) {
      if (!pending) return false;
      const source = connectionSource();
      if (!source || (source.kind !== "moment" && source.kind !== "routeNode")) return false;
      const point = context.flowNodeLocalPoint?.(event) || { x: 0, y: 0 };
      const nodePosition = {
        x: Math.max(0, Math.round(point.x - 130)),
        y: Math.max(0, Math.round(point.y - 67))
      };
      const node = context.createRouteActionNode?.(nodePosition);
      if (!node) return false;
      const routeNodes = context.flowRouteNodes?.() || [];
      context.pushFlowHistory?.();
      routeNodes.push(node);
      connectPendingSourceToTarget(node.id);
      pending = null;
      context.selectFlowRouteNode?.(node.id);
      context.renderFlowListAndPublish?.();
      context.renderFlowNodeView?.();
      return true;
    }

    function targetIdForNode(targetNode) {
      if (!targetNode) return "";
      if (pending?.targetKind === "state") return targetNode.dataset.nodeId || "";
      if (pending?.targetKind === "momentGraph") return targetNode.dataset.nodeId || targetNode.dataset.routeNodeId || "";
      return targetNode.dataset.actionId || "";
    }

    function complete(targetNode) {
      if (!pending) return false;
      const source = connectionSource();
      if (!source) return false;
      const targetId = targetIdForNode(targetNode);
      if (!targetId) return false;
      if (source.selfId && targetId === source.selfId) return false;
      if (targetId === source.currentTarget()) return false;
      context.pushFlowHistory?.();
      source.setTarget(targetId);
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
