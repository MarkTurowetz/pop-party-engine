(function () {
  "use strict";

  function createMomentRouteGraph(context) {
    const routeNodeTypes = window.PartyGameFlowMomentRouteNodeTypes;

    function gameFlow() {
      return context.gameFlow?.() || { states: [], routeNodes: [] };
    }

    function routeNodes() {
      const flow = gameFlow();
      flow.routeNodes = Array.isArray(flow.routeNodes) ? flow.routeNodes : [];
      return flow.routeNodes;
    }

    function routeNode(routeNodeId) {
      return routeNodes().find((node) => node.id === routeNodeId) || null;
    }

    function isRouteDecisionNode(node) {
      if (routeNodeTypes?.isDecision) return routeNodeTypes.isDecision(node);
      return node?.routeNodeType === "decision" || (node?.routeNodeType === "action" && node?.type === "decision");
    }

    function routeNodeTypeName(node) {
      if (routeNodeTypes?.name) return routeNodeTypes.name(node);
      if (isRouteDecisionNode(node)) return "Decision";
      if (node?.routeNodeType === "action") return "Action";
      return "Moment Entry";
    }

    function targetName(targetId) {
      if (!targetId) return "No Target";
      if (String(targetId).toLowerCase() === "none") return "None";
      const state = context.flowState?.(targetId);
      if (state) return state.name || state.id;
      const node = routeNode(targetId);
      if (node) return node.name || node.id;
      return targetId;
    }

    function momentEntryTargetOptions(selectedStateId = "") {
      const options = [{ id: "", name: "No Target" }];
      for (const state of gameFlow().states || []) {
        options.push({ id: state.id, name: state.name || state.id });
      }
      if (selectedStateId && !options.some((option) => option.id === selectedStateId)) {
        options.push({ id: selectedStateId, name: selectedStateId });
      }
      return options;
    }

    function graphTargetOptions(selectedTargetId = "", currentNodeId = "") {
      const options = [{ id: "", name: "No Target" }, { id: "none", name: "None / Halt" }];
      for (const state of gameFlow().states || []) {
        options.push({ id: state.id, name: `Moment: ${state.name || state.id}` });
      }
      for (const node of routeNodes()) {
        if (node.id === currentNodeId) continue;
        options.push({ id: node.id, name: `${routeNodeTypeName(node)}: ${node.name || node.id}` });
      }
      if (selectedTargetId && !options.some((option) => option.id === selectedTargetId)) {
        options.push({ id: selectedTargetId, name: selectedTargetId });
      }
      return options;
    }

    function appendRouteTargets(options, currentStateId = "") {
      for (const node of routeNodes()) {
        options.push({ id: node.id, name: `${routeNodeTypeName(node)}: ${node.name || node.id}` });
      }
      if (currentStateId && !options.some((option) => option.id === currentStateId)) {
        options.push({ id: currentStateId, name: currentStateId });
      }
      return options;
    }

    function createMomentEntryNode(selectedStateId = "") {
      const nodes = routeNodes();
      const nextNumber = nodes.length + 1;
      const targetStateId = context.flowState?.(selectedStateId)?.id || gameFlow().states?.[0]?.id || "";
      return {
        id: `moment-entry-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
        routeNodeType: "momentEntry",
        name: `Moment Entry ${nextNumber}`,
        targetStateId,
        nodePosition: context.defaultNodePosition?.(nextNumber - 1, 2, 860, 80, 320, 190) || null
      };
    }

    function createRouteActionNode(point = null) {
      const nodes = routeNodes();
      const nextNumber = nodes.filter((node) => node.routeNodeType === "action").length + 1;
      return {
        id: `route-action-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
        routeNodeType: "action",
        name: `Action ${nextNumber}`,
        type: "presentText",
        timing: { mode: "E+", seconds: 0 },
        text: "Presented text",
        textTarget: "",
        instant: false,
        isShown: true,
        subActions: [],
        nextTargetNodeId: "",
        nodePosition: point || context.defaultNodePosition?.(nextNumber - 1, 2, 860, 600, 360, 220) || null
      };
    }

    function serializeRouteNode(node) {
      const base = {
        id: node.id,
        routeNodeType: node.routeNodeType || "momentEntry",
        name: node.name || "Moment Entry",
        nodePosition: node.nodePosition || null
      };
      if (node.routeNodeType === "decision") {
        return {
          ...base,
          variable: node.variable || "activePlayerCount",
          valueType: node.valueType || "int",
          branches: context.ensureDecisionBranches?.(node, { targetField: "targetNodeId" }).map((branch) => ({
            id: branch.id,
            type: branch.type,
            value: branch.value || "",
            code: branch.code || "",
            targetNodeId: branch.targetNodeId || ""
          })) || []
        };
      }
      if (node.routeNodeType === "action") {
        const serialized = {
          ...node,
          ...base,
          routeNodeType: "action",
          type: node.type || "presentText",
          timing: node.timing || { mode: "E+", seconds: 0 },
          subActions: (node.subActions || []).map((subAction) => ({ ...subAction }))
        };
        if (serialized.type === "decision") {
          serialized.nextTargetNodeId = "";
          serialized.variable = node.variable || "activePlayerCount";
          serialized.valueType = node.valueType || "int";
          serialized.branches = context.ensureDecisionBranches?.(node, { targetField: "targetNodeId" }).map((branch) => ({
            id: branch.id,
            type: branch.type,
            value: branch.value || "",
            code: branch.code || "",
            targetNodeId: branch.targetNodeId || ""
          })) || [];
          return serialized;
        }
        serialized.nextTargetNodeId = node.nextTargetNodeId || node.nextTargetActionId || "";
        return serialized;
      }
      return {
        ...base,
        targetStateId: node.targetStateId || ""
      };
    }

    function clearTargetReferences(targetIds) {
      const targetSet = new Set((Array.isArray(targetIds) ? targetIds : [targetIds]).filter(Boolean));
      if (!targetSet.size) return;
      for (const state of gameFlow().states || []) {
        if (targetSet.has(state.nextStateTargetId)) state.nextStateTargetId = "";
      }
      for (const node of routeNodes()) {
        if (targetSet.has(node.targetStateId)) node.targetStateId = "";
        if (isRouteDecisionNode(node)) {
          for (const branch of context.ensureDecisionBranches?.(node, { targetField: "targetNodeId" }) || []) {
            if (targetSet.has(branch.targetNodeId)) branch.targetNodeId = "";
          }
        }
        if (node.routeNodeType === "action" && node.type !== "decision" && targetSet.has(node.nextTargetNodeId)) node.nextTargetNodeId = "";
      }
    }

    function targetNode(stateNodes, routeNodeMap, targetId) {
      if (!targetId || String(targetId).toLowerCase() === "none") return null;
      return stateNodes.get(targetId) || routeNodeMap.get(targetId) || null;
    }

    return {
      appendRouteTargets,
      clearTargetReferences,
      createMomentEntryNode,
      createRouteActionNode,
      graphTargetOptions,
      momentEntryTargetOptions,
      routeNode,
      routeNodes,
      serializeRouteNode,
      targetName,
      targetNode
    };
  }

  window.PartyGameFlowMomentRouteGraph = { createMomentRouteGraph };
})();
