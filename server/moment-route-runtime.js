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

  function resolveMomentTarget(room, target, context = {}) {
    const flow = context.flow || runtimeGameFlow(room);
    const targetId = normalizeFlowId(target, "");
    const trace = context.trace || [];
    const visited = context.visited || new Set();
    if (!targetId || isNoActionTarget(targetId)) {
      return { stateId: "", haltReason: "No Target", trace };
    }
    const directState = flowStateById(flow, targetId);
    if (directState) {
      return {
        stateId: directState.id,
        haltReason: "",
        trace: [...trace, { kind: "state", id: directState.id, name: directState.name || directState.id }]
      };
    }
    if (visited.has(targetId)) {
      return { stateId: "", haltReason: "Route Loop", trace };
    }
    const routeNode = routeNodeById(flow, targetId);
    if (!routeNode) {
      return { stateId: "", haltReason: "Missing Route Target", trace: [...trace, { kind: "missing", id: targetId }] };
    }
    const nextVisited = new Set(visited);
    nextVisited.add(targetId);
    if (routeNode.routeNodeType === "decision") {
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
          stateId: "",
          haltReason: decision.haltReason || "No Matching Branch",
          trace: [...trace, decisionTrace],
          decision
        };
      }
      return resolveMomentTarget(room, decision.selectedTarget, {
        flow,
        trace: [...trace, decisionTrace],
        visited: nextVisited
      });
    }
    const entryTrace = {
      kind: "momentEntry",
      id: routeNode.id,
      name: routeNode.name || routeNode.id,
      targetStateId: routeNode.targetStateId || ""
    };
    return resolveMomentTarget(room, routeNode.targetStateId, {
      flow,
      trace: [...trace, entryTrace],
      visited: nextVisited
    });
  }

  function resolveMomentTargetStateId(room, target) {
    const result = resolveMomentTarget(room, target);
    if (result.trace?.some((step) => step.kind === "decision") || result.haltReason) {
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
    resolveMomentTargetStateId
  };
}

module.exports = { createMomentRouteRuntime };
