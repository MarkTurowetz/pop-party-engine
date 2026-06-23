(function () {
  "use strict";

  function createNodeWirePlanner(context) {
    function nodeMap(layer, selector, key) {
      return new Map(Array.from(layer?.querySelectorAll(selector) || [])
        .map((node) => [node.dataset[key], node]));
    }

    function maps(layer) {
      const actionNodes = nodeMap(layer, ".flow-node[data-action-id]", "actionId");
      return {
        actions: actionNodes,
        returnNode: actionNodes.get("return") || null,
        routes: nodeMap(layer, ".flow-node[data-route-node-id]", "routeNodeId"),
        states: nodeMap(layer, ".flow-node[data-node-id]", "nodeId")
      };
    }

    function isMissingTarget(targetId) {
      return !targetId || context.isNoFlowTarget?.(targetId);
    }

    function targetNode(nodeMaps, targetId, targetKind = "action") {
      if (isMissingTarget(targetId)) return null;
      if (targetKind === "action") return targetId === "return" ? nodeMaps.returnNode : nodeMaps.actions.get(targetId);
      if (targetKind === "state") return nodeMaps.states.get(targetId);
      if (targetKind === "momentGraph") return nodeMaps.states.get(targetId) || nodeMaps.routes.get(targetId);
      return nodeMaps.actions.get(targetId) || nodeMaps.states.get(targetId) || nodeMaps.routes.get(targetId) || null;
    }

    function branchSourceNode(layer, { branchId = "", sourceId = "", sourceKind = "action" } = {}, fallbackNode = null) {
      if (!branchId || !sourceId) return fallbackNode;
      const parentSelector = sourceKind === "routeNode"
        ? `.flow-node[data-route-node-id="${context.cssEscape?.(sourceId) || sourceId}"]`
        : `.flow-node[data-action-id="${context.cssEscape?.(sourceId) || sourceId}"]`;
      return layer?.querySelector(`${parentSelector} .flow-node-branch[data-branch-id="${context.cssEscape?.(branchId) || branchId}"]`) || fallbackNode;
    }

    function drawTargetWire(nodeMaps, descriptor) {
      const fromNode = descriptor?.fromNode || null;
      const toNode = descriptor?.toNode || targetNode(nodeMaps, descriptor?.targetId || "", descriptor?.targetKind || "action");
      if (!fromNode || !toNode) return false;
      context.drawNodeWire?.(fromNode, toNode, descriptor?.options || {});
      return true;
    }

    return {
      branchSourceNode,
      drawTargetWire,
      isMissingTarget,
      maps,
      targetNode
    };
  }

  window.PartyGameFlowNodeWirePlanner = { createNodeWirePlanner };
})();
