(function () {
  "use strict";

  function createMomentRouteRenderer(context) {
    function renderRouteNodes() {
      const routeNodes = context.flowRouteNodes?.() || [];
      const layer = context.flowNodeLayer?.();
      if (!layer) return;
      for (const [index, routeNode] of routeNodes.entries()) {
        const isDecision = routeNode.routeNodeType === "decision";
        const isAction = routeNode.routeNodeType === "action";
        const { x, y } = context.savedNodePosition?.(
          routeNode,
          context.defaultNodePosition?.(index, 2, 860, isDecision ? 360 : isAction ? 600 : 80, 360, 240) || { x: 860, y: isDecision ? 360 : isAction ? 600 : 80 }
        ) || { x: 860, y: isDecision ? 360 : isAction ? 600 : 80 };
        const branches = isDecision ? context.ensureDecisionBranches?.(routeNode, { targetField: "targetNodeId" }) || [] : [];
        const missingBranchTarget = branches.some((branch) => !branch.targetNodeId || context.isNoFlowTarget?.(branch.targetNodeId));
        const targetName = routeNode.targetStateId ? context.flowStateName?.(routeNode.targetStateId) : "No target";
        const node = context.createFlowNode?.({
          id: routeNode.id,
          title: routeNode.name || (isDecision ? "Decision" : isAction ? "Action" : "Moment Entry"),
          subtitle: isDecision
            ? `Decision / ${context.decisionVariableName?.(routeNode.variable) || routeNode.variable || ""}`
            : isAction
              ? `${context.actionCategoryName?.(routeNode) || "Standard"} / ${context.actionTypeMeta?.(routeNode.type)?.name || routeNode.type}`
              : `Moment Entry -> ${targetName}`,
          timing: isAction ? context.actionTimingLabel?.(routeNode, false) || "" : "",
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
          ? context.createFlowNodeBranches?.(null, routeNode, {
              sourceKind: "routeNode",
              targetField: "targetNodeId",
              targetKind: "momentGraph",
              targetName: context.flowRouteTargetName
            })
          : null;
        if (childList) node.appendChild(childList);
        if (isAction) {
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

    function ensureTiming(action) {
      action.timing = action.timing && typeof action.timing === "object" ? action.timing : { mode: "E+", seconds: 0 };
      action.timing.mode = action.timing.mode === "S+" ? "S+" : "E+";
      action.timing.seconds = Math.max(0, Number(action.timing.seconds || 0) || 0);
      return action.timing;
    }

    function appendRouteActionControls(inspector, routeNode) {
      if (routeNode.type === "presentText" || routeNode.type === "displayText" || routeNode.type === "text") {
        inspector.appendChild(context.flowField?.("Text", routeNode.text || "Presented text", (value) => {
          context.pushFlowHistory?.();
          routeNode.text = value || "Presented text";
          context.renderFlowListAndPublish?.();
          context.renderFlowNodeView?.();
        }));
      }
      if (routeNode.type === "setWipeShown") {
        inspector.appendChild(context.flowSelect?.("Wipe Visible", routeNode.isShown === false ? "false" : "true", context.flowTrueFalseOptions?.(true) || [
          { id: "true", name: "True" },
          { id: "false", name: "False" }
        ], (value) => {
          context.pushFlowHistory?.();
          routeNode.isShown = value !== "false";
          context.renderFlowListAndPublish?.();
          context.renderFlowNodeView?.();
        }));
        inspector.appendChild(context.flowSelect?.("Instant", routeNode.instant === true ? "true" : "false", context.flowTrueFalseOptions?.(false) || [
          { id: "false", name: "False" },
          { id: "true", name: "True" }
        ], (value) => {
          context.pushFlowHistory?.();
          routeNode.instant = value === "true";
          context.renderFlowListAndPublish?.();
          context.renderFlowNodeView?.();
        }));
      }
      if (routeNode.type === "doNothing") {
        inspector.appendChild(context.readOnlyFlowNote?.("This action intentionally has no effect. Use its timing to create a pause between moment graph nodes."));
      }
      if (routeNode.type === "playAudio") {
        inspector.appendChild(context.flowField?.("Audio URL", routeNode.audioUrl || "", (value) => {
          context.pushFlowHistory?.();
          routeNode.audioUrl = value;
          context.renderFlowListAndPublish?.();
          context.renderFlowNodeView?.();
        }));
      }
      const timing = ensureTiming(routeNode);
      inspector.appendChild(context.flowSelect?.("Timing Mode", timing.mode, [
        { id: "E+", name: "E+ Timing" },
        { id: "S+", name: "S+ Timing" }
      ], (value) => {
        context.pushFlowHistory?.();
        ensureTiming(routeNode).mode = value === "S+" ? "S+" : "E+";
        context.renderFlowListAndPublish?.();
        context.renderFlowNodeView?.();
      }));
      inspector.appendChild(context.flowNumber?.("Timing Seconds", timing.seconds, (value) => {
        context.pushFlowHistory?.();
        ensureTiming(routeNode).seconds = Math.max(0, Number(value || 0) || 0);
        context.renderFlowListAndPublish?.();
        context.renderFlowNodeView?.();
      }));
    }

    function routeActionTypeOptions(routeNode) {
      return (context.flowActionTypes?.() || []).filter((option) => {
        if (option.deprecated && option.id !== routeNode.type) return false;
        if (option.id === "decision" || option.id === "jumpNode" || option.id === "transitionState") return option.id === routeNode.type;
        return true;
      });
    }

    function renderInspector() {
      if (context.flowNodeDepth?.() !== "moments") return false;
      const routeNode = context.selectedFlowRouteNode?.();
      const inspector = context.flowNodeInspector?.();
      if (!routeNode || !inspector) return false;
      const isRouteDecision = routeNode.routeNodeType === "decision";
      const isRouteAction = routeNode.routeNodeType === "action";
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
      if (isRouteDecision && (context.ensureDecisionBranches?.(routeNode, { targetField: "targetNodeId" }) || []).some((branch) => !branch.targetNodeId || context.isNoFlowTarget?.(branch.targetNodeId))) {
        inspector.appendChild(context.readOnlyFlowNote?.("Warning: every decision branch should target a moment-layer node, or that branch will halt."));
      }
      inspector.appendChild(context.flowField?.("Name", routeNode.name || (isRouteDecision ? "Decision" : isRouteAction ? "Action" : "Moment Entry"), (value) => {
        context.pushFlowHistory?.();
        routeNode.name = value || (isRouteDecision ? "Decision" : isRouteAction ? "Action" : "Moment Entry");
        context.renderFlowListAndPublish?.();
        context.renderFlowNodeView?.();
      }));
      if (isRouteDecision) {
        context.appendDecisionControls?.(inspector, null, routeNode, (redrawNodeView = true) => {
          if (redrawNodeView) {
            context.refreshFlowNodeInspectorChange?.();
            return;
          }
          context.renderFlowListAndPublish?.();
          context.redrawFlowNodeWires?.();
        }, {
          targetField: "targetNodeId",
          targetOptions: (stateForOptions, actionForOptions, branch) => context.flowRouteGraphTargetOptions?.(branch.targetNodeId || "", actionForOptions.id) || []
        });
        inspector.appendChild(context.flowActionButton?.("Delete Decision", () => {
          context.deleteSelectedFlowRouteNode?.();
        }));
        return true;
      }
      if (isRouteAction) {
        inspector.appendChild(context.flowSelect?.("Action Type", routeNode.type || "presentText", routeActionTypeOptions(routeNode), (value) => {
          context.pushFlowHistory?.();
          routeNode.type = value || "presentText";
          context.applyFlowActionTypeDefaults?.(routeNode, routeNode.type, false);
          context.renderFlowListAndPublish?.();
          context.renderFlowNodeView?.();
        }));
        appendRouteActionControls(inspector, routeNode);
        inspector.appendChild(context.flowSelect?.("Next", routeNode.nextTargetNodeId || "", context.flowRouteGraphTargetOptions?.(routeNode.nextTargetNodeId || "", routeNode.id) || [], (value) => {
          context.pushFlowHistory?.();
          routeNode.nextTargetNodeId = value;
          context.renderFlowListAndPublish?.();
          context.renderFlowNodeView?.();
        }));
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
