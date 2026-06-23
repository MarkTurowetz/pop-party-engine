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

    function drawEntryWire(planner, nodeMaps, state, startNode) {
      const entryTargetId = state.entryTargetActionId || "";
      const fallbackEntryActionId = !entryTargetId && state.actions?.[0]?.id ? state.actions[0].id : "";
      const entryTarget = entryTargetId || fallbackEntryActionId;
      if (planner.isMissingTarget(entryTarget)) return;
      planner.drawTargetWire(nodeMaps, {
        fromNode: startNode,
        targetId: entryTarget,
        targetKind: "action",
        options: { muted: !entryTargetId }
      });
    }

    function drawJumpWire(planner, nodeMaps, action, fromNode) {
      if (action.type !== "jumpNode" || !context.actionNodeIsSelected?.(action)) return;
      const targetId = action.jumpTargetActionId || "";
      if (planner.isMissingTarget(targetId)) return;
      planner.drawTargetWire(nodeMaps, {
        fromNode,
        targetId,
        targetKind: "action",
        options: {
          highlighted: context.actionNodeIsSelected?.(action),
          label: "Jump",
          fromAnchor: "center"
        }
      });
    }

    function drawExitWires(planner, nodeMaps, layer, action, fromNode) {
      for (const exit of context.flowNodeExitDefinitions?.(action) || []) {
        if (exit.targetKind === "state") continue;
        const branchDescriptor = exit.branchId
          ? context.flowNodeBranchDescriptors?.()?.descriptorsFor(null, action, {
            targetField: exit.field || "targetActionId",
            targetKind: exit.targetKind || "action"
          }).find((item) => item.branch.id === exit.branchId)
          : null;
        const branch = branchDescriptor?.branch || null;
        const targetId = branchDescriptor ? branchDescriptor.targetId : action[exit.field] || "";
        if (planner.isMissingTarget(targetId)) continue;
        const sourceNode = branch
          ? planner.branchSourceNode(layer, {
            branchId: branch.id,
            sourceId: action.id,
            sourceKind: "action"
          }, fromNode)
          : fromNode;
        const highlighted = selectedNodeWireMatches(action, branch?.id || "");
        const label = branch
          ? context.decisionBranchWireLabel?.(branch, branchDescriptor?.index ?? (context.ensureDecisionBranches?.(action) || []).findIndex((item) => item.id === branch.id)) || ""
          : "";
        planner.drawTargetWire(nodeMaps, {
          fromNode: sourceNode,
          targetId,
          targetKind: branchDescriptor?.targetKind || "action",
          options: { highlighted, label }
        });
      }
    }

    function drawImplicitWire(planner, nodeMaps, action, actions, index, fromNode) {
      if (!context.shouldDrawImplicitActionWire?.(action)) return;
      const nextAction = actions[index + 1];
      if (nextAction) {
        planner.drawTargetWire(nodeMaps, {
          fromNode,
          targetId: nextAction.id,
          targetKind: "action",
          options: { muted: true }
        });
      }
    }

    function redraw() {
      const layer = context.flowNodeLayer?.();
      const state = context.flowState?.(context.selectedFlowStateId?.());
      if (!layer || !state) return;
      const planner = context.nodeWirePlanner?.();
      if (!planner) return;
      const nodeMaps = planner.maps(layer);
      const startNode = layer.querySelector('.flow-node[data-node-id="start"]');
      drawEntryWire(planner, nodeMaps, state, startNode);
      const actions = state.actions || [];
      for (const [index, action] of actions.entries()) {
        const fromNode = nodeMaps.actions.get(action.id);
        drawJumpWire(planner, nodeMaps, action, fromNode);
        drawExitWires(planner, nodeMaps, layer, action, fromNode);
        drawImplicitWire(planner, nodeMaps, action, actions, index, fromNode);
      }
      context.renderFlowNodeMinimap?.();
    }

    return { redraw };
  }

  window.PartyGameFlowActionNodeWires = { createActionNodeWires };
})();
