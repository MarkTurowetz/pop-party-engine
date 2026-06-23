(function () {
  "use strict";

  function createActionNodeWires(context) {
    function selectedNodeWireMatches(sourceAction, branchId = "") {
      if (!sourceAction) return false;
      const selectedRef = context.flowActionRef?.(context.selectedFlowStateId?.(), context.selectedFlowActionId?.());
      if (branchId) {
        if (selectedRef?.isBranch) return context.flowActionIsSelected?.(branchId);
        return context.flowActionIsSelected?.(sourceAction.id);
      }
      return context.flowActionIsSelected?.(sourceAction.id);
    }

    function actionNodeMap(layer) {
      return new Map(Array.from(layer.querySelectorAll(".flow-node[data-action-id]"))
        .map((node) => [node.dataset.actionId, node]));
    }

    function drawEntryWire(state, actionNodes, startNode, returnNode) {
      const entryTargetId = state.entryTargetActionId || "";
      const fallbackEntryActionId = !entryTargetId && state.actions?.[0]?.id ? state.actions[0].id : "";
      const entryTarget = entryTargetId || fallbackEntryActionId;
      if (!entryTarget || context.isNoFlowTarget?.(entryTarget)) return;
      const toNode = entryTarget === "return" ? returnNode : actionNodes.get(entryTarget);
      if (toNode) context.drawNodeWire?.(startNode, toNode, { muted: !entryTargetId });
    }

    function drawJumpWire(action, actionNodes, returnNode, fromNode) {
      if (action.type !== "jumpNode" || !context.actionNodeIsSelected?.(action)) return;
      const targetId = action.jumpTargetActionId || "";
      if (!targetId || context.isNoFlowTarget?.(targetId)) return;
      const toNode = targetId === "return" ? returnNode : actionNodes.get(targetId);
      if (!toNode) return;
      context.drawNodeWire?.(fromNode, toNode, {
        highlighted: context.actionNodeIsSelected?.(action),
        label: "Jump",
        fromAnchor: "center"
      });
    }

    function branchSourceNode(layer, action, branch, fromNode) {
      return layer.querySelector(`.flow-node[data-action-id="${context.cssEscape?.(action.id) || action.id}"] .flow-node-branch[data-branch-id="${context.cssEscape?.(branch.id) || branch.id}"]`) || fromNode;
    }

    function drawExitWires(layer, action, actionNodes, returnNode, fromNode) {
      for (const exit of context.flowNodeExitDefinitions?.(action) || []) {
        if (exit.targetKind === "state") continue;
        const branch = exit.branchId ? context.decisionBranchById?.(action, exit.branchId) : null;
        const targetId = branch ? branch.targetActionId : action[exit.field] || "";
        if (!targetId || context.isNoFlowTarget?.(targetId)) continue;
        const sourceNode = branch ? branchSourceNode(layer, action, branch, fromNode) : fromNode;
        const highlighted = selectedNodeWireMatches(action, branch?.id || "");
        const label = branch
          ? context.decisionBranchWireLabel?.(branch, (context.ensureDecisionBranches?.(action) || []).findIndex((item) => item.id === branch.id)) || ""
          : "";
        if (targetId === "return") {
          context.drawNodeWire?.(sourceNode, returnNode, { highlighted, label });
          continue;
        }
        const toNode = actionNodes.get(targetId);
        if (toNode) context.drawNodeWire?.(sourceNode, toNode, { highlighted, label });
      }
    }

    function drawImplicitWire(action, actions, index, actionNodes, fromNode) {
      if (!context.shouldDrawImplicitActionWire?.(action)) return;
      const nextAction = actions[index + 1];
      if (nextAction) context.drawNodeWire?.(fromNode, actionNodes.get(nextAction.id), true);
    }

    function redraw() {
      const layer = context.flowNodeLayer?.();
      const state = context.flowState?.(context.selectedFlowStateId?.());
      if (!layer || !state) return;
      const actionNodes = actionNodeMap(layer);
      const startNode = layer.querySelector('.flow-node[data-node-id="start"]');
      const returnNode = actionNodes.get("return");
      drawEntryWire(state, actionNodes, startNode, returnNode);
      const actions = state.actions || [];
      for (const [index, action] of actions.entries()) {
        const fromNode = actionNodes.get(action.id);
        drawJumpWire(action, actionNodes, returnNode, fromNode);
        drawExitWires(layer, action, actionNodes, returnNode, fromNode);
        drawImplicitWire(action, actions, index, actionNodes, fromNode);
      }
      context.renderFlowNodeMinimap?.();
    }

    return { redraw };
  }

  window.PartyGameFlowActionNodeWires = { createActionNodeWires };
})();
