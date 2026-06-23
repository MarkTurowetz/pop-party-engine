(function () {
  "use strict";

  function createFlowNodeInspector(context) {
    function inspectorElement() {
      return context.flowNodeInspector?.() || null;
    }

    function editInListButton() {
      return context.flowActionButton?.("Edit In List View", () => {
        context.setFlowViewMode?.("list");
      });
    }

    function appendActionPropertyControls(target, state, actionRef, { includeSubActionButton = false } = {}) {
      const action = actionRef?.action;
      if (!state || !action) return;
      const softChange = () => {
        context.renderFlowListAndPublish?.();
        context.redrawFlowNodeWires?.();
      };
      context.appendActionPropertyControls?.(target, state, actionRef, {
        change: () => context.refreshFlowNodeInspectorChange?.(),
        softChange,
        refresh: () => context.refreshFlowNodeInspectorChange?.(),
        refreshAll: () => context.refreshFlowNodeInspectorChange?.(),
        decisionChange: (redrawNodeView = true) => {
          if (redrawNodeView) {
            context.refreshFlowNodeInspectorChange?.();
            return;
          }
          softChange();
        },
        includeSubActionButton,
        excludeNextActionTypes: ["voteOnAnswersInput"]
      });
    }

    function renderMomentInspector(inspector, state) {
      const title = document.createElement("h3");
      title.textContent = context.selectedFlowStateId?.() ? context.flowState?.(context.selectedFlowStateId?.())?.name || "Game Moment" : "Node View";
      const copy = document.createElement("p");
      copy.textContent = "Double-click a moment node to inspect and connect the actions inside it. Moment wires use the same Next Moment data shown in List View.";
      inspector.append(title, copy);
      if (!state) return;
      inspector.appendChild(context.flowSelect?.("Entry Action", state.entryTargetActionId || "", context.flowActionTargetOptions?.(state, state.entryTargetActionId || "") || [], (value) => {
        context.pushFlowHistory?.();
        state.entryTargetActionId = value;
        context.renderFlowListAndPublish?.();
        context.renderFlowNodeView?.();
      }));
      inspector.appendChild(context.flowSelect?.("Next Moment", state.nextStateTargetId || "", context.flowStateTargetOptions?.(state.nextStateTargetId || "", state.id) || [], (value) => {
        context.pushFlowHistory?.();
        state.nextStateTargetId = value;
        context.renderFlowListAndPublish?.();
        context.renderFlowNodeView?.();
      }));
    }

    function renderEmptyActionInspector(inspector, state) {
      const title = document.createElement("h3");
      title.textContent = state.name;
      const copy = document.createElement("p");
      copy.textContent = "Select an action node to inspect its properties and exit connections.";
      inspector.append(title, copy);
    }

    function renderBranchInspector(inspector, state, actionRef) {
      const branches = context.ensureDecisionBranches?.(actionRef.parentAction) || [];
      const branchIndex = branches.findIndex((branch) => branch.id === actionRef.action?.id);
      const action = branches[branchIndex] || actionRef.action;
      const title = document.createElement("h3");
      title.textContent = context.decisionBranchName?.(action, branchIndex) || action.name || "Branch";
      const summary = document.createElement("p");
      summary.textContent = `Branch under ${actionRef.parentAction?.name || "Decision"}.`;
      inspector.append(title, summary);
      inspector.appendChild(context.readOnlyFlowNote?.("Branches are checked in order. A branch with no connection will halt the game when it is selected."));
      context.appendDecisionBranchControls?.(inspector, state, actionRef.parentAction, action, branchIndex, (redrawNodeView = true) => {
        if (redrawNodeView) {
          context.refreshFlowNodeInspectorChange?.();
          return;
        }
        context.renderFlowListAndPublish?.();
        context.redrawFlowNodeWires?.();
      });
      inspector.appendChild(editInListButton());
    }

    function renderActionInspector(inspector, state, actionRef) {
      const action = actionRef.action;
      const title = document.createElement("h3");
      title.textContent = action.name;
      const summary = document.createElement("p");
      summary.textContent = `${actionRef.isSubAction ? `Sub-action under ${actionRef.parentAction?.name || "Action"}. ` : ""}${context.actionSummary?.(action, actionRef.isSubAction) || ""}`;
      inspector.append(title, summary);
      inspector.appendChild(context.readOnlyFlowNote?.(`${context.actionCategoryName?.(action) || "Standard"} / ${context.actionTypeMeta?.(action.type)?.name || action.type}`));
      appendActionPropertyControls(inspector, state, actionRef, {
        includeSubActionButton: !actionRef.isSubAction && action.type !== "decision" && action.type !== "jumpNode"
      });
      inspector.appendChild(editInListButton());
    }

    function render() {
      const inspector = inspectorElement();
      if (!inspector) return;
      inspector.replaceChildren();
      const state = context.flowState?.(context.selectedFlowStateId?.());
      const actionRef = state ? context.flowActionRef?.(context.selectedFlowStateId?.(), context.selectedFlowActionId?.()) : null;
      if (context.renderRouteInspector?.()) return;
      if (context.flowNodeDepth?.() === "moments" || !state) {
        renderMomentInspector(inspector, state);
        return;
      }
      if (!actionRef?.action) {
        renderEmptyActionInspector(inspector, state);
        return;
      }
      if (actionRef.isBranch) {
        renderBranchInspector(inspector, state, actionRef);
        return;
      }
      renderActionInspector(inspector, state, actionRef);
    }

    return { render };
  }

  window.PartyGameFlowNodeInspector = { createFlowNodeInspector };
})();
