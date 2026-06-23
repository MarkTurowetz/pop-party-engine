(function () {
  "use strict";

  function createMomentRouteRenderer(context) {
    const routeNodeTypes = window.PartyGameFlowMomentRouteNodeTypes;
    const nodeGraphSchema = window.PartyGameFlowNodeGraphSchema;

    function routeBranchOptions(options = {}) {
      if (nodeGraphSchema?.branchOptions) return nodeGraphSchema.branchOptions({ depth: "moments", ...options });
      return {
        sourceKind: "routeNode",
        targetField: "targetNodeId",
        targetKind: "momentGraph",
        targetName: options.targetName || null
      };
    }

    function routeBranchTargetField() {
      return routeBranchOptions().targetField;
    }

    function routeDecisionBranches(routeNode) {
      return context.ensureDecisionBranches?.(routeNode, { targetField: routeBranchTargetField() }) || [];
    }

    function routeBranchTarget(branch) {
      return branch?.[routeBranchTargetField()] || "";
    }

    function isRouteDecisionNode(routeNode) {
      if (routeNodeTypes?.isDecision) return routeNodeTypes.isDecision(routeNode);
      return routeNode?.routeNodeType === "decision" || (routeNode?.routeNodeType === "action" && routeNode?.type === "decision");
    }

    function isRouteActionNode(routeNode) {
      if (routeNodeTypes?.isAction) return routeNodeTypes.isAction(routeNode);
      return routeNode?.routeNodeType === "action";
    }

    function renderRouteNodes() {
      const routeNodes = context.flowRouteNodes?.() || [];
      const layer = context.flowNodeLayer?.();
      if (!layer) return;
      for (const [index, routeNode] of routeNodes.entries()) {
        const isDecision = isRouteDecisionNode(routeNode);
        const isAction = isRouteActionNode(routeNode);
        const isOrdinaryAction = isAction && !isDecision;
        const { x, y } = context.savedNodePosition?.(
          routeNode,
          context.defaultNodePosition?.(index, 2, 860, isDecision ? 360 : isOrdinaryAction ? 600 : 80, 360, 240) || { x: 860, y: isDecision ? 360 : isOrdinaryAction ? 600 : 80 }
        ) || { x: 860, y: isDecision ? 360 : isAction ? 600 : 80 };
        const branches = isDecision ? routeDecisionBranches(routeNode) : [];
        const missingBranchTarget = branches.some((branch) => !routeBranchTarget(branch) || context.isNoFlowTarget?.(routeBranchTarget(branch)));
        const targetName = routeNode.targetStateId ? context.flowStateName?.(routeNode.targetStateId) : "No target";
        const node = context.createFlowNode?.({
          id: routeNode.id,
          title: routeNode.name || (isDecision ? "Decision" : isAction ? "Action" : "Moment Entry"),
          subtitle: isDecision
            ? `Decision / ${context.decisionVariableName?.(routeNode.variable) || routeNode.variable || ""}`
            : isAction
              ? `${context.actionCategoryName?.(routeNode) || "Standard"} / ${context.actionTypeMeta?.(routeNode.type)?.name || routeNode.type}`
              : `Moment Entry -> ${targetName}`,
          timing: isOrdinaryAction ? context.actionTimingLabel?.(routeNode, false) || "" : "",
          valueBadge: isDecision
            ? (missingBranchTarget ? { text: "Needs Target", className: "is-warning" } : null)
            : isAction
              ? context.actionValueBadge?.(routeNode)
              : (routeNode.targetStateId ? null : { text: "Needs Target", className: "is-warning" }),
          x,
          y,
          width: isDecision ? 320 : 260,
          height: isDecision || isAction ? 134 : 120,
          className: isDecision ? "is-decision" : isAction ? context.flowNodeClassForAction?.(routeNode) || "is-standard" : "is-moment-entry",
          selected: context.selectedFlowRouteNodeId?.() === routeNode.id
        });
        if (!node) continue;
        node.dataset.routeNodeId = routeNode.id;
        delete node.dataset.nodeId;
        const childList = isDecision
          ? context.createFlowNodeBranches?.(null, routeNode, routeBranchOptions({ targetName: context.flowRouteTargetName }))
          : null;
        if (childList) node.appendChild(childList);
        if (isOrdinaryAction) {
          node.querySelector(".flow-node-main")?.appendChild(context.createFlowMomentRouteActionPorts?.(routeNode));
        } else if (!isDecision) {
          node.querySelector(".flow-node-main")?.appendChild(context.createFlowMomentRoutePorts?.(routeNode));
        }
        context.bindFlowNodeDrag?.(node, routeNode);
        node.addEventListener("click", () => {
          context.selectFlowRouteNode?.(routeNode.id);
          context.renderFlowTool?.();
        });
        layer.appendChild(node);
      }
    }

    function routeActionTypeOptions(routeNode) {
      return (context.flowActionTypes?.() || []).filter((option) => {
        if (option.deprecated && option.id !== routeNode.type) return false;
        return true;
      });
    }

    function routeInspectorState(routeNode) {
      return {
        id: context.selectedFlowStateId?.() || "moment-route",
        name: "Moment Graph",
        actions: (context.flowRouteNodes?.() || []).filter((node) => node.id !== routeNode.id)
      };
    }

    function routeTargetOptions(routeNode) {
      return (state, action, selectedTarget) => context.flowRouteGraphTargetOptions?.(selectedTarget || "", routeNode.id) || [{ id: "", name: "No Target" }];
    }

    function routeInspectorChangeHandlers() {
      return {
        change: () => context.refreshFlowNodeInspectorChange?.(),
        softChange: () => {
          context.renderFlowListAndPublish?.();
          context.redrawFlowNodeWires?.();
        },
        refresh: () => context.refreshFlowNodeInspectorChange?.(),
        refreshAll: () => context.refreshFlowNodeInspectorChange?.(),
        decisionChange: (redrawNodeView = true) => {
          if (redrawNodeView) {
            context.refreshFlowNodeInspectorChange?.();
            return;
          }
          context.renderFlowListAndPublish?.();
          context.redrawFlowNodeWires?.();
        }
      };
    }

    function routeActionRef(routeNode, state) {
      return {
        action: routeNode,
        parentAction: null,
        actions: state.actions,
        isSubAction: false,
        isBranch: false
      };
    }

    function renderRouteDecisionInspector(inspector, routeNode) {
      routeNode.type = "decision";
      const state = routeInspectorState(routeNode);
      inspector.appendChild(context.flowActionNameField?.(state, routeNode, (value) => {
        routeNode.name = value || routeNode.name;
        context.refreshFlowNodeInspectorChange?.();
      }, context.refreshFlowNodeInspectorChange) || document.createTextNode(""));
      context.appendDecisionControls?.(inspector, state, routeNode, routeInspectorChangeHandlers().decisionChange, {
        includeBranchPanels: false,
        targetField: routeBranchTargetField(),
        targetOptions: routeTargetOptions(routeNode)
      });
      inspector.appendChild(context.readOnlyFlowNote?.("Decision actions do not use timing. They evaluate branches in order and wait forever if the selected branch has no connection."));
    }

    function renderRouteActionInspector(inspector, routeNode) {
      if (!routeNode.nextTargetNodeId && routeNode.nextTargetActionId) {
        routeNode.nextTargetNodeId = routeNode.nextTargetActionId;
      }
      if (routeNode.type === "decision") {
        routeDecisionBranches(routeNode);
      }
      const state = routeInspectorState(routeNode);
      context.appendActionPropertyControls?.(inspector, state, routeActionRef(routeNode, state), {
        ...routeInspectorChangeHandlers(),
        actionTypeOptions: routeActionTypeOptions,
        decisionTargetField: routeBranchTargetField(),
        excludeNextActionTypes: ["voteOnAnswersInput"],
        nextTargetField: "nextTargetNodeId",
        nextTargetLabel: "Next",
        targetOptions: routeTargetOptions(routeNode),
        includeSubActionButton: false,
        includeDecisionBranchPanels: false,
        stopAfterDecision: true
      });
    }

    function renderRouteBranchInspector(inspector, routeNode, branch) {
      const branches = routeDecisionBranches(routeNode);
      const branchIndex = branches.findIndex((item) => item.id === branch.id);
      if (branchIndex < 0) return false;
      const liveBranch = branches[branchIndex];
      const title = document.createElement("h3");
      title.textContent = context.decisionBranchName?.(liveBranch, branchIndex) || "Branch";
      const summary = document.createElement("p");
      summary.textContent = `Branch under ${routeNode.name || "Decision"}.`;
      inspector.append(title, summary);
      inspector.appendChild(context.readOnlyFlowNote?.("Branches are checked in order. A branch with no connection will halt the game when it is selected."));
      const state = routeInspectorState(routeNode);
      context.appendDecisionBranchControls?.(inspector, state, routeNode, liveBranch, branchIndex, (redrawNodeView = true) => {
        if (redrawNodeView) {
          context.refreshFlowNodeInspectorChange?.();
          return;
        }
        context.renderFlowListAndPublish?.();
        context.redrawFlowNodeWires?.();
      }, {
        targetField: routeBranchTargetField(),
        targetOptions: routeTargetOptions(routeNode)
      });
      inspector.appendChild(context.flowActionButton?.("Edit Full Decision", () => {
        context.selectFlowRouteNode?.(routeNode.id);
        context.renderFlowTool?.();
      }));
      return true;
    }

    function renderInspector() {
      if (context.flowNodeDepth?.() !== "moments") return false;
      const routeNode = context.selectedFlowRouteNode?.();
      const inspector = context.flowNodeInspector?.();
      if (!routeNode || !inspector) return false;
      const isRouteDecision = isRouteDecisionNode(routeNode);
      const isRouteAction = isRouteActionNode(routeNode);
      const routeBranch = isRouteDecision ? context.selectedFlowRouteBranch?.() : null;
      if (routeBranch && renderRouteBranchInspector(inspector, routeNode, routeBranch)) return true;
      const title = document.createElement("h3");
      title.textContent = routeNode.name || (isRouteDecision ? "Decision" : isRouteAction ? "Action" : "Moment Entry");
      const copy = document.createElement("p");
      copy.textContent = isRouteDecision
        ? "Decisions use the same branch logic everywhere. Branch targets on this layer point to moment graph nodes."
        : isRouteAction
          ? "Action nodes on this layer are edited like game actions and connect to moment graph targets."
          : "Moment Entry nodes are reusable routing anchors on the moment graph. Later decision paths can target these anchors instead of hard-coding a moment jump.";
      inspector.append(title, copy);
      if (!isRouteDecision && !isRouteAction && !routeNode.targetStateId) {
        inspector.appendChild(context.readOnlyFlowNote?.("Warning: this Moment Entry needs a target or any future path that reaches it will hang."));
      }
      if (isRouteDecision && routeDecisionBranches(routeNode).some((branch) => !routeBranchTarget(branch) || context.isNoFlowTarget?.(routeBranchTarget(branch)))) {
        inspector.appendChild(context.readOnlyFlowNote?.("Warning: every decision branch should target a moment-layer node, or that branch will halt."));
      }
      if (!isRouteAction && !isRouteDecision) {
        inspector.appendChild(context.flowField?.("Name", routeNode.name || "Moment Entry", (value) => {
          context.pushFlowHistory?.();
          routeNode.name = value || "Moment Entry";
          context.renderFlowListAndPublish?.();
          context.renderFlowNodeView?.();
        }));
      }
      if (isRouteDecision) {
        renderRouteDecisionInspector(inspector, routeNode);
        inspector.appendChild(context.flowActionButton?.("Delete Decision", () => {
          context.deleteSelectedFlowRouteNode?.();
        }));
        return true;
      }
      if (isRouteAction) {
        renderRouteActionInspector(inspector, routeNode);
        inspector.appendChild(context.flowActionButton?.("Delete Action", () => {
          context.deleteSelectedFlowRouteNode?.();
        }));
        return true;
      }
      inspector.appendChild(context.flowSelect?.("Target Moment", routeNode.targetStateId || "", context.flowMomentEntryTargetOptions?.(routeNode.targetStateId || "") || [], (value) => {
        context.pushFlowHistory?.();
        routeNode.targetStateId = value;
        context.renderFlowListAndPublish?.();
        context.renderFlowNodeView?.();
      }));
      inspector.appendChild(context.flowActionButton?.("Delete Moment Entry", () => {
        context.deleteSelectedFlowRouteNode?.();
      }));
      return true;
    }

    return {
      renderInspector,
      renderRouteNodes
    };
  }

  window.PartyGameFlowMomentRouteRenderer = { createMomentRouteRenderer };
})();
