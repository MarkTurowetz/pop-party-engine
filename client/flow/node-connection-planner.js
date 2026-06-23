(function () {
  "use strict";

  function createFlowNodeConnectionPlanner(context) {
    function sourceKind(pending) {
      return pending?.sourceKind || "action";
    }

    function escaped(value) {
      return context.cssEscape?.(value) || value;
    }

    function sourceNode(layer, pending) {
      if (!pending || !layer) return null;
      const kind = sourceKind(pending);
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

    function routeNodeSource(pending) {
      const routeNodeId = pending.routeNodeId || "";
      const routeNode = context.flowRouteNode?.(routeNodeId);
      if (!routeNode) return null;
      const field = pending.field || "nextTargetNodeId";
      const branchId = pending.branchId || "";
      const branch = branchId
        ? context.decisionBranchById?.(routeNode, branchId, { targetField: field })
        : null;
      if (branchId && !branch) return null;
      function liveRouteNode() {
        return context.flowRouteNode?.(routeNodeId) || routeNode;
      }
      function liveBranch() {
        if (!branchId) return null;
        return context.decisionBranchById?.(liveRouteNode(), branchId, { targetField: field }) || null;
      }
      return {
        kind: "routeNode",
        selfId: routeNodeId,
        currentTarget: () => {
          const currentBranch = liveBranch();
          if (branchId) return currentBranch?.[field] || "";
          return liveRouteNode()?.[field] || "";
        },
        setTarget: (targetId) => {
          const currentRouteNode = liveRouteNode();
          if (branchId) {
            const currentBranch = liveBranch();
            if (currentBranch) currentBranch[field] = targetId;
            return;
          }
          if (currentRouteNode) currentRouteNode[field] = targetId;
        }
      };
    }

    function actionSource(pending) {
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

    function connectionSource(pending) {
      if (!pending) return null;
      const kind = sourceKind(pending);
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
      if (kind === "routeNode") return routeNodeSource(pending);
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
      return actionSource(pending);
    }

    function targetIdForNode(pending, targetNode) {
      if (!targetNode) return "";
      if (pending?.targetKind === "state") return targetNode.dataset.nodeId || "";
      if (pending?.targetKind === "momentGraph") return targetNode.dataset.nodeId || targetNode.dataset.routeNodeId || "";
      return targetNode.dataset.actionId || "";
    }

    function connect(pending, targetId) {
      const source = connectionSource(pending);
      if (!source) return false;
      source.setTarget(targetId);
      return true;
    }

    function createdNodePosition(point) {
      return {
        x: Math.max(0, Math.round((point?.x || 0) - 130)),
        y: Math.max(0, Math.round((point?.y || 0) - 67))
      };
    }

    function createActionTarget(pending, point) {
      if (pending?.targetKind !== "action") return null;
      const source = connectionSource(pending);
      if (!source || (source.kind !== "start" && source.kind !== "action")) return null;
      const state = context.flowState?.(pending.stateId);
      if (!state) return null;
      state.actions = Array.isArray(state.actions) ? state.actions : [];
      const nextNumber = state.actions.length + 1;
      const node = context.createDefaultFlowAction?.(state.id, `Game Action ${nextNumber}`, false);
      if (!node) return null;
      node.nodePosition = createdNodePosition(point);
      return {
        collection: state.actions,
        node,
        selectionKind: "action",
        targetId: node.id
      };
    }

    function createMomentGraphTarget(pending, point) {
      if (pending?.targetKind !== "momentGraph") return null;
      const source = connectionSource(pending);
      if (!source || (source.kind !== "moment" && source.kind !== "routeNode")) return null;
      const collection = context.flowRouteNodes?.() || [];
      const node = context.createRouteActionNode?.(createdNodePosition(point));
      if (!node) return null;
      return {
        collection,
        node,
        selectionKind: "routeNode",
        targetId: node.id
      };
    }

    function createTarget(pending, point, flowNodeDepth) {
      if (flowNodeDepth === "moments") return createMomentGraphTarget(pending, point);
      if (flowNodeDepth === "actions") return createActionTarget(pending, point);
      return null;
    }

    return {
      connect,
      connectionSource,
      createTarget,
      sourceKind,
      sourceNode,
      targetIdForNode
    };
  }

  window.PartyGameFlowNodeConnectionPlanner = { createFlowNodeConnectionPlanner };
})();
