(function () {
  "use strict";

  function createActionNodeRenderer(context) {
    function flowNodeClassForAction(action) {
      if (action.type === "decision") return "is-decision";
      if (action.type === "jumpNode") return "is-jump";
      if (context.actionTypeMeta?.(action.type)?.category === "input") return "is-input";
      if (action.type === "transition" || action.type === "transitionState") return "is-transition";
      return "is-standard";
    }

    function createFlowNodeSubActions(state, parentAction) {
      const subActions = parentAction.subActions || [];
      if (!subActions.length) return null;
      const list = document.createElement("div");
      list.className = "flow-node-subactions";
      for (const subAction of subActions) {
        const item = document.createElement("button");
        item.type = "button";
        item.className = "flow-node-subaction";
        item.classList.toggle("is-selected", context.flowActionIsSelected?.(subAction.id));
        const title = document.createElement("strong");
        title.textContent = subAction.name || "Sub-Action";
        const meta = document.createElement("div");
        meta.className = "flow-node-subaction-meta";
        const timing = document.createElement("span");
        timing.textContent = context.actionTimingLabel?.(subAction, true) || "";
        meta.appendChild(timing);
        const valueBadge = context.actionValueBadge?.(subAction);
        if (valueBadge?.text) {
          const badge = document.createElement("span");
          badge.className = `flow-node-value-badge ${valueBadge.className || ""}`.trim();
          badge.textContent = valueBadge.text;
          meta.appendChild(badge);
        }
        item.append(title, meta);
        context.bindFlowNodeChildSort?.(item, parentAction, "subActions", subAction.id);
        item.addEventListener("pointerdown", (event) => event.stopPropagation());
        item.addEventListener("click", (event) => {
          event.stopPropagation();
          context.setSelectedFlowStateId?.(state.id);
          context.expandFlowStateInList?.(state.id);
          context.selectFlowAction?.(subAction.id, { additive: event.metaKey || event.ctrlKey || event.shiftKey });
          context.renderFlowTool?.();
        });
        list.appendChild(item);
      }
      return list;
    }

    function selectedActionTargetIds(state) {
      return new Set((state.actions || [])
        .filter((action) => action.type === "jumpNode" && context.actionNodeIsSelected?.(action))
        .map((action) => action.jumpTargetActionId || "")
        .filter((targetId) => targetId && !context.isNoFlowTarget?.(targetId)));
    }

    function renderStartNode(state) {
      const startModel = context.systemNodeModel?.(state, "start");
      const startPosition = context.savedNodePosition?.(startModel, { x: 70, y: 70 }) || { x: 70, y: 70 };
      const startNode = context.createFlowNode?.({
        id: "start",
        title: "Start",
        subtitle: state.entryTargetActionId ? `Entry -> ${context.flowTargetActionName?.(state.entryTargetActionId) || state.entryTargetActionId}` : "Moment entry",
        x: startPosition.x,
        y: startPosition.y,
        width: 170,
        height: 86,
        className: "is-return",
        selected: context.flowActionIsSelected?.("start")
      });
      if (!startNode) return;
      const ports = context.createFlowStartPorts?.(state);
      if (ports) startNode.querySelector(".flow-node-main")?.appendChild(ports);
      context.bindFlowNodeDrag?.(startNode, startModel);
      startNode.addEventListener("click", (event) => {
        context.setSelectedFlowStateId?.(state.id);
        context.expandFlowStateInList?.(state.id);
        context.selectFlowAction?.("start", { additive: event.metaKey || event.ctrlKey || event.shiftKey });
        context.renderFlowTool?.();
      });
      startNode.addEventListener("dblclick", () => {
        context.setFlowNodeDepth?.("moments");
        context.clearFlowActionSelection?.();
        context.renderFlowTool?.();
      });
      context.flowNodeLayer?.()?.appendChild(startNode);
    }

    function renderActionNode(state, action, index, jumpTargetIds) {
      const fallback = context.defaultNodePosition?.(index, 3, 340, 70, 360, 230) || { x: 340, y: 70 };
      const { x, y } = context.savedNodePosition?.(action, fallback) || fallback;
      const node = context.createFlowNode?.({
        id: action.id,
        title: action.name || `Action ${index + 1}`,
        subtitle: `${context.actionCategoryName?.(action) || "Standard"} / ${context.actionTypeMeta?.(action.type)?.name || action.type}`,
        timing: action.type === "decision" || action.type === "jumpNode" ? "" : context.actionTimingLabel?.(action, false) || "",
        valueBadge: context.actionValueBadge?.(action),
        x,
        y,
        width: action.type === "decision" ? 320 : 260,
        height: 134,
        className: flowNodeClassForAction(action),
        selected: context.actionNodeIsSelected?.(action),
        jumpTarget: jumpTargetIds.has(action.id)
      });
      if (!node) return null;
      node.dataset.actionId = action.id;
      const childList = action.type === "decision"
        ? context.createFlowNodeBranches?.(state, action)
        : createFlowNodeSubActions(state, action);
      if (childList) node.appendChild(childList);
      if (action.type !== "decision" && action.type !== "jumpNode") {
        const ports = context.createFlowNodePorts?.(action);
        if (ports) node.querySelector(".flow-node-main")?.appendChild(ports);
      }
      context.bindFlowNodeDrag?.(node, action);
      node.addEventListener("click", (event) => {
        context.setSelectedFlowStateId?.(state.id);
        context.expandFlowStateInList?.(state.id);
        context.selectFlowAction?.(action.id, { additive: event.metaKey || event.ctrlKey || event.shiftKey });
        context.renderFlowTool?.();
      });
      context.flowNodeLayer?.()?.appendChild(node);
      return node;
    }

    function renderReturnNode(state, jumpTargetIds) {
      const returnModel = context.systemNodeModel?.(state, "return");
      const returnPosition = context.savedNodePosition?.(returnModel, { x: 1240, y: 720 }) || { x: 1240, y: 720 };
      const returnNode = context.createFlowNode?.({
        id: "return",
        title: "Return",
        subtitle: "Back to moments",
        x: returnPosition.x,
        y: returnPosition.y,
        width: 190,
        height: 92,
        className: "is-return",
        selected: context.flowActionIsSelected?.("return"),
        jumpTarget: jumpTargetIds.has("return")
      });
      if (!returnNode) return;
      returnNode.dataset.actionId = "return";
      context.bindFlowNodeDrag?.(returnNode, returnModel);
      returnNode.addEventListener("click", (event) => {
        context.setSelectedFlowStateId?.(state.id);
        context.expandFlowStateInList?.(state.id);
        context.selectFlowAction?.("return", { additive: event.metaKey || event.ctrlKey || event.shiftKey });
        context.renderFlowTool?.();
      });
      returnNode.addEventListener("dblclick", () => {
        context.setFlowNodeDepth?.("moments");
        context.clearFlowActionSelection?.();
        context.renderFlowTool?.();
      });
      context.flowNodeLayer?.()?.appendChild(returnNode);
    }

    function render() {
      const state = context.flowState?.(context.selectedFlowStateId?.());
      const layer = context.flowNodeLayer?.();
      if (!state || !layer) return;
      const backButton = context.nodeBackButton?.();
      if (backButton) backButton.disabled = false;
      const help = context.nodeViewHelp?.();
      if (help) help.textContent = `Inside ${state.name}. Click nodes for properties; drag exit dots to connect actions.`;
      const jumpTargetIds = selectedActionTargetIds(state);
      renderStartNode(state);
      for (const [index, action] of (state.actions || []).entries()) {
        renderActionNode(state, action, index, jumpTargetIds);
      }
      renderReturnNode(state, jumpTargetIds);
      context.scheduleFlowNodeWireRedraw?.();
    }

    return { render };
  }

  window.PartyGameFlowActionNodeRenderer = { createActionNodeRenderer };
})();
