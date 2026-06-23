"use strict";

function createMomentRouteRuntime({
  evaluateDecisionAction,
  isNoActionTarget,
  normalizeFlowId,
  runtimeGameFlow
}) {
  function flowStateById(flow, stateId) {
    const id = normalizeFlowId(stateId, "");
    return (flow?.states || []).find((state) => normalizeFlowId(state.id, "") === id) || null;
  }

  function routeNodeById(flow, nodeId) {
    const id = normalizeFlowId(nodeId, "");
    return (flow?.routeNodes || []).find((node) => normalizeFlowId(node.id, "") === id) || null;
  }

  function resolveTargetKind(flow, target) {
    const targetId = normalizeFlowId(target, "");
    if (!targetId || isNoActionTarget(targetId)) return { targetKind: "none" };
    if (flowStateById(flow, targetId)) return { targetKind: "state", stateId: targetId };
    if (routeNodeById(flow, targetId)) return { targetKind: "routeNode", routeNodeId: targetId };
    return { targetKind: "missing", targetId };
  }

  function resolveMomentTargetInternal(room, target, context = {}, options = {}) {
    const flow = context.flow || runtimeGameFlow(room);
    const targetId = normalizeFlowId(target, "");
    const trace = context.trace || [];
    const visited = context.visited || new Set();
    if (!targetId || isNoActionTarget(targetId)) {
      return { targetKind: "none", stateId: "", haltReason: "No Target", trace };
    }
    const directState = flowStateById(flow, targetId);
    if (directState) {
      return {
        targetKind: "state",
        stateId: directState.id,
        haltReason: "",
        trace: [...trace, { kind: "state", id: directState.id, name: directState.name || directState.id }]
      };
    }
    if (visited.has(targetId)) {
      return { targetKind: "none", stateId: "", haltReason: "Route Loop", trace };
    }
    const routeNode = routeNodeById(flow, targetId);
    if (!routeNode) {
      return { targetKind: "missing", stateId: "", haltReason: "Missing Route Target", trace: [...trace, { kind: "missing", id: targetId }] };
    }
    const nextVisited = new Set(visited);
    nextVisited.add(targetId);
    if (routeNode.routeNodeType === "decision" || (routeNode.routeNodeType === "action" && routeNode.type === "decision")) {
      const decision = evaluateDecisionAction(room, routeNode, {
        targetField: "targetNodeId",
        resolveTarget: (selectedTarget) => resolveTargetKind(flow, selectedTarget)
      });
      const decisionTrace = {
        kind: "decision",
        id: routeNode.id,
        name: routeNode.name || routeNode.id,
        selectedBranch: decision.selectedBranch,
        selectedTarget: decision.selectedTarget,
        branchResults: decision.branchResults
      };
      if (isNoActionTarget(decision.selectedTarget)) {
        return {
          targetKind: "none",
          stateId: "",
          haltReason: decision.haltReason || "No Matching Branch",
          trace: [...trace, decisionTrace],
          decision
        };
      }
      return resolveMomentTargetInternal(room, decision.selectedTarget, {
        flow,
        trace: [...trace, decisionTrace],
        visited: nextVisited
      }, options);
    }
    if (routeNode.routeNodeType === "action") {
      const nextTargetNodeId = routeNode.type === "jumpNode"
        ? routeNode.jumpTargetActionId || routeNode.nextTargetNodeId || routeNode.nextTargetActionId || ""
        : routeNode.nextTargetNodeId || routeNode.nextTargetActionId || "";
      const actionTrace = {
        kind: "action",
        id: routeNode.id,
        name: routeNode.name || routeNode.id,
        type: routeNode.type || "",
        nextTargetNodeId
      };
      if (options.stopAtAction) {
        return {
          targetKind: "action",
          routeNodeId: routeNode.id,
          action: routeNode,
          nextTargetNodeId,
          stateId: "",
          haltReason: "",
          trace: [...trace, actionTrace]
        };
      }
      return resolveMomentTargetInternal(room, nextTargetNodeId, {
        flow,
        trace: [...trace, actionTrace],
        visited: nextVisited
      }, options);
    }
    const entryTrace = {
      kind: "momentEntry",
      id: routeNode.id,
      name: routeNode.name || routeNode.id,
      targetStateId: routeNode.targetStateId || ""
    };
    return resolveMomentTargetInternal(room, routeNode.targetStateId, {
      flow,
      trace: [...trace, entryTrace],
      visited: nextVisited
    }, options);
  }

  function resolveMomentRouteTarget(room, target, context = {}) {
    return resolveMomentTargetInternal(room, target, context, { stopAtAction: true });
  }

  function resolveMomentTarget(room, target, context = {}) {
    return resolveMomentTargetInternal(room, target, context, { stopAtAction: false });
  }

  function resolveMomentTargetStateId(room, target) {
    const result = resolveMomentTarget(room, target);
    if (result.trace?.some((step) => step.kind === "decision" || step.kind === "action") || result.haltReason) {
      room.lastRouteDecisionTrace = {
        selectedTarget: target || "",
        resolvedStateId: result.stateId || "",
        haltReason: result.haltReason || "",
        trace: result.trace || [],
        evaluatedAt: Date.now()
      };
    }
    return result.stateId || "";
  }

  return {
    resolveMomentTarget,
    resolveMomentRouteTarget,
    resolveMomentTargetStateId
  };
}

module.exports = { createMomentRouteRuntime };
