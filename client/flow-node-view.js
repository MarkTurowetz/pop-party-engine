function renderFlowNodeView() {
  if (!flowNodeLayer || !flowNodeWires || flowViewMode !== "node") return;
  flowNodeLayer.replaceChildren();
  flowNodeWires.replaceChildren();
  flowNodeWireLabels?.replaceChildren();
  pendingNodeConnection = null;
  if (flowNodeDepth === "moments") {
    renderFlowMomentNodes();
  } else {
    if (!flowState(selectedFlowStateId)) {
      flowNodeDepth = "moments";
      renderFlowMomentNodes();
    } else {
      renderFlowActionNodes();
    }
  }
  applyFlowNodeZoom();
  scheduleFlowNodeWireRedraw();
  renderFlowNodeInspector();
  renderFlowActions();
}

function flowNodeClassForAction(action) {
  if (action.type === "decision") return "is-decision";
  if (actionTypeMeta(action.type).category === "input") return "is-input";
  if (action.type === "transition" || action.type === "transitionState") return "is-transition";
  return "is-standard";
}

function defaultNodePosition(index, columns = 3, startX = 80, startY = 80, gapX = 380, gapY = 230) {
  return {
    x: startX + (index % columns) * gapX,
    y: startY + Math.floor(index / columns) * gapY
  };
}

function savedNodePosition(item, fallback) {
  const x = Number(item?.nodePosition?.x);
  const y = Number(item?.nodePosition?.y);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : fallback;
}

function saveNodePosition(item, x, y) {
  item.nodePosition = { x: Math.round(x), y: Math.round(y) };
  renderFlowListAndPublish();
}

function flowGraphNodeBounds() {
  const nodes = flowNodeLayer ? Array.from(flowNodeLayer.querySelectorAll(".flow-node")) : [];
  const values = nodes.map((node) => {
    const x = Number(node.dataset.x || 0);
    const y = Number(node.dataset.y || 0);
    const main = node.querySelector(".flow-node-main");
    const width = Math.max(120, Number(node.offsetWidth || node.dataset.width || main?.offsetWidth || 0));
    const height = Math.max(80, Number(node.offsetHeight || node.dataset.height || main?.offsetHeight || 0));
    return { x, y, right: x + width, bottom: y + height, node };
  });
  if (!values.length) return { minX: 0, minY: 0, maxX: 1600, maxY: 920, width: 1600, height: 920, nodes: [] };
  const minX = Math.min(0, ...values.map((item) => item.x)) - 80;
  const minY = Math.min(0, ...values.map((item) => item.y)) - 80;
  const maxX = Math.max(1600, ...values.map((item) => item.right)) + 160;
  const maxY = Math.max(920, ...values.map((item) => item.bottom)) + 160;
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY, nodes: values };
}

function flowNodeMinimumZoom() {
  if (!flowNodeStage) return 0.1;
  const bounds = flowGraphNodeBounds();
  const fitZoom = Math.min(1, flowNodeStage.clientWidth / Math.max(1, bounds.width), flowNodeStage.clientHeight / Math.max(1, bounds.height));
  return Math.max(0.08, Math.min(1, fitZoom / 2));
}

function applyFlowNodeZoom() {
  if (!flowNodeGraph || !flowNodeWorld || !flowNodeLayer || !flowNodeWires) return;
  const bounds = flowGraphNodeBounds();
  const width = Math.max(1600, bounds.maxX);
  const height = Math.max(920, bounds.maxY);
  flowNodeGraph.style.width = `${width * flowNodeZoom}px`;
  flowNodeGraph.style.minHeight = `${height * flowNodeZoom}px`;
  flowNodeWorld.style.width = `${width}px`;
  flowNodeWorld.style.minHeight = `${height}px`;
  flowNodeWorld.style.transform = `scale(${flowNodeZoom})`;
  flowNodeLayer.style.width = `${width}px`;
  flowNodeLayer.style.minHeight = `${height}px`;
  if (flowNodeWireLabels) {
    flowNodeWireLabels.style.width = `${width}px`;
    flowNodeWireLabels.style.minHeight = `${height}px`;
  }
  flowNodeWires.style.width = `${width}px`;
  flowNodeWires.style.height = `${height}px`;
  flowNodeWires.setAttribute("width", String(width));
  flowNodeWires.setAttribute("height", String(height));
  renderFlowNodeMinimap();
}

function setFlowNodeZoom(nextZoom, event = null) {
  if (!flowNodeStage) return;
  const previousZoom = flowNodeZoom || 1;
  const minZoom = flowNodeMinimumZoom();
  const next = Math.max(minZoom, Math.min(1, nextZoom));
  if (Math.abs(next - previousZoom) < 0.001) return;
  const rect = flowNodeStage.getBoundingClientRect();
  const anchorX = event ? event.clientX - rect.left : flowNodeStage.clientWidth / 2;
  const anchorY = event ? event.clientY - rect.top : flowNodeStage.clientHeight / 2;
  const worldX = (flowNodeStage.scrollLeft + anchorX) / previousZoom;
  const worldY = (flowNodeStage.scrollTop + anchorY) / previousZoom;
  flowNodeZoom = next;
  setLocalValue("partyTemplate.flowNodeZoom", String(flowNodeZoom));
  applyFlowNodeZoom();
  const maxLeft = flowNodeGraph ? Math.max(0, flowNodeGraph.offsetWidth - flowNodeStage.clientWidth) : 0;
  const maxTop = flowNodeGraph ? Math.max(0, flowNodeGraph.offsetHeight - flowNodeStage.clientHeight) : 0;
  flowNodeStage.scrollLeft = Math.max(0, Math.min(maxLeft, worldX * flowNodeZoom - anchorX));
  flowNodeStage.scrollTop = Math.max(0, Math.min(maxTop, worldY * flowNodeZoom - anchorY));
  scheduleFlowNodeWireRedraw();
}

function positionFlowNodeMinimap() {
  if (!flowNodeMinimap || !flowNodeStage) return;
  flowNodeMinimap.style.left = `${flowNodeStage.scrollLeft + flowNodeStage.clientWidth - flowNodeMinimap.offsetWidth - 14}px`;
  flowNodeMinimap.style.top = `${flowNodeStage.scrollTop + 14}px`;
}

function renderFlowNodeMinimap() {
  if (!flowNodeMinimap || !flowNodeMinimapViewport || !flowNodeStage || !flowNodeLayer) return;
  const bounds = flowGraphNodeBounds();
  const width = flowNodeMinimap.clientWidth || 190;
  const height = flowNodeMinimap.clientHeight || 132;
  const scale = Math.min(width / Math.max(1, bounds.width), height / Math.max(1, bounds.height));
  Array.from(flowNodeMinimap.querySelectorAll(".flow-node-minimap-node")).forEach((item) => item.remove());
  for (const item of bounds.nodes) {
    const mini = document.createElement("div");
    const id = flowNodeDepth === "moments" ? item.node.dataset.nodeId : item.node.dataset.actionId || item.node.dataset.nodeId;
    const selected = Boolean(id && (flowActionIsSelected(id) || selectedFlowStateId === id));
    mini.className = `flow-node-minimap-node${flowNodeDepth === "actions" ? " is-action" : ""}${selected ? " is-selected" : ""}`;
    mini.style.left = `${(item.x - bounds.minX) * scale}px`;
    mini.style.top = `${(item.y - bounds.minY) * scale}px`;
    mini.style.width = `${Math.max(4, (item.right - item.x) * scale)}px`;
    mini.style.height = `${Math.max(4, (item.bottom - item.y) * scale)}px`;
    flowNodeMinimap.insertBefore(mini, flowNodeMinimapViewport);
  }
  const viewLeft = flowNodeStage.scrollLeft / flowNodeZoom;
  const viewTop = flowNodeStage.scrollTop / flowNodeZoom;
  const rawViewWidth = (flowNodeStage.clientWidth / flowNodeZoom) * scale;
  const rawViewHeight = (flowNodeStage.clientHeight / flowNodeZoom) * scale;
  const viewportWidth = Math.min(width, Math.max(8, rawViewWidth));
  const viewportHeight = Math.min(height, Math.max(8, rawViewHeight));
  const viewportLeft = Math.max(0, Math.min(width - viewportWidth, (viewLeft - bounds.minX) * scale));
  const viewportTop = Math.max(0, Math.min(height - viewportHeight, (viewTop - bounds.minY) * scale));
  flowNodeMinimapViewport.style.left = `${viewportLeft}px`;
  flowNodeMinimapViewport.style.top = `${viewportTop}px`;
  flowNodeMinimapViewport.style.width = `${viewportWidth}px`;
  flowNodeMinimapViewport.style.height = `${viewportHeight}px`;
  positionFlowNodeMinimap();
}

function centerFlowNodeViewportOnGraphPoint(graphX, graphY) {
  if (!flowNodeStage || !flowNodeGraph) return;
  const maxLeft = Math.max(0, flowNodeGraph.offsetWidth - flowNodeStage.clientWidth);
  const maxTop = Math.max(0, flowNodeGraph.offsetHeight - flowNodeStage.clientHeight);
  flowNodeStage.scrollLeft = Math.max(0, Math.min(maxLeft, graphX * flowNodeZoom - flowNodeStage.clientWidth / 2));
  flowNodeStage.scrollTop = Math.max(0, Math.min(maxTop, graphY * flowNodeZoom - flowNodeStage.clientHeight / 2));
  renderFlowNodeMinimap();
}

function minimapGraphPoint(event) {
  const rect = flowNodeMinimap.getBoundingClientRect();
  const bounds = flowGraphNodeBounds();
  const scale = Math.min(rect.width / Math.max(1, bounds.width), rect.height / Math.max(1, bounds.height));
  const localX = Math.max(0, Math.min(rect.width, event.clientX - rect.left));
  const localY = Math.max(0, Math.min(rect.height, event.clientY - rect.top));
  return {
    x: bounds.minX + localX / scale,
    y: bounds.minY + localY / scale
  };
}

function systemNodeModel(state, nodeId) {
  const positionKey = nodeId === "start" ? "startNodePosition" : "returnNodePosition";
  return {
    id: nodeId,
    get nodePosition() {
      return state?.[positionKey] || null;
    },
    set nodePosition(value) {
      if (state) state[positionKey] = value;
    }
  };
}

function nodeRectPoint(node, anchor = "center") {
  if (!node || !flowNodeGraph) return { x: 0, y: 0 };
  const nodeRect = node.getBoundingClientRect();
  const rootRect = flowNodeGraph.getBoundingClientRect();
  const x = nodeRect.left - rootRect.left + nodeRect.width / 2;
  const anchorY = anchor === "top"
    ? nodeRect.top - rootRect.top
    : anchor === "bottom"
      ? nodeRect.bottom - rootRect.top
      : nodeRect.top - rootRect.top + nodeRect.height / 2;
  return {
    x: x / flowNodeZoom,
    y: anchorY / flowNodeZoom
  };
}

function nodePoint(node, anchor = "center") {
  if (node?.classList?.contains("flow-node-branch") || node?.classList?.contains("flow-node-subaction")) {
    if (anchor === "source") {
      return nodeRectPoint(node.closest(".flow-node") || node, "bottom");
    }
    return nodeRectPoint(node, anchor === "target" ? "top" : "center");
  }
  if (anchor === "source") {
    return nodeRectPoint(node, "bottom");
  }
  if (anchor === "target") {
    const main = node.querySelector?.(".flow-node-main");
    return nodeRectPoint(main || node, "top");
  }
  const main = node.querySelector?.(".flow-node-main");
  return nodeRectPoint(main || node, "center");
}

function addFlowNodeWireLabel(text, from, to) {
  if (!flowNodeWireLabels || !text) return;
  const label = document.createElement("div");
  label.className = "flow-node-wire-label";
  label.textContent = text;
  label.style.left = `${(from.x + to.x) / 2}px`;
  label.style.top = `${(from.y + to.y) / 2}px`;
  flowNodeWireLabels.appendChild(label);
}

function drawNodeWire(fromNode, toNode, optionsOrMuted = false) {
  if (!fromNode || !toNode) return;
  const options = typeof optionsOrMuted === "boolean" ? { muted: optionsOrMuted } : (optionsOrMuted || {});
  const from = nodePoint(fromNode, options.fromAnchor || "source");
  const to = nodePoint(toNode, options.toAnchor || "target");
  const curve = Math.max(50, Math.abs(to.y - from.y) * 0.35);
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("class", `flow-node-wire${options.muted ? " is-muted" : ""}${options.highlighted ? " is-highlighted" : ""}`);
  path.setAttribute("d", `M ${from.x} ${from.y} C ${from.x} ${from.y + curve}, ${to.x} ${to.y - curve}, ${to.x} ${to.y}`);
  flowNodeWires.appendChild(path);
  addFlowNodeWireLabel(options.label || "", from, to);
}

function drawPreviewNodeWire(fromNode, to) {
  if (!fromNode || !to || !flowNodeWires) return;
  const from = nodePoint(fromNode, "source");
  const curve = Math.max(50, Math.abs(to.y - from.y) * 0.35);
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("class", "flow-node-wire is-preview");
  path.setAttribute("d", `M ${from.x} ${from.y} C ${from.x} ${from.y + curve}, ${to.x} ${to.y - curve}, ${to.x} ${to.y}`);
  flowNodeWires.appendChild(path);
}

function scheduleFlowNodeWireRedraw() {
  window.requestAnimationFrame(() => {
    if (!flowNodeLayer || !flowNodeWires || flowViewMode !== "node") return;
    window.requestAnimationFrame(() => {
      if (!flowNodeLayer || !flowNodeWires || flowViewMode !== "node") return;
      redrawFlowNodeWires();
    });
  });
}

function flowNodeLocalPoint(event) {
  const rootRect = flowNodeGraph.getBoundingClientRect();
  return {
    x: (event.clientX - rootRect.left) / flowNodeZoom,
    y: (event.clientY - rootRect.top) / flowNodeZoom
  };
}

function shouldDrawImplicitActionWire(action) {
  return false;
}

function selectedNodeWireMatches(sourceAction, targetId = "", branchId = "") {
  if (!sourceAction) return false;
  const selectedRef = flowActionRef(selectedFlowStateId, selectedFlowActionId);
  if (branchId) {
    if (selectedRef?.isBranch) return flowActionIsSelected(branchId);
    return flowActionIsSelected(sourceAction.id);
  }
  return flowActionIsSelected(sourceAction.id);
}

function redrawFlowNodeWires() {
  if (!flowNodeWires || !flowNodeLayer) return;
  flowNodeWires.replaceChildren();
  flowNodeWireLabels?.replaceChildren();
  if (flowNodeDepth === "moments") {
    const stateNodes = new Map(Array.from(flowNodeLayer.querySelectorAll(".flow-node"))
      .map((node) => [node.dataset.nodeId, node]));
    for (const state of gameFlow.states || []) {
      const fromNode = stateNodes.get(state.id);
      const toNode = state.nextStateTargetId ? stateNodes.get(state.nextStateTargetId) : null;
      if (toNode) {
        drawNodeWire(fromNode, toNode, {
          highlighted: selectedFlowStateId === state.id || selectedFlowActionIds.has(state.id)
        });
      }
    }
    renderFlowNodeMinimap();
    return;
  }
  const state = flowState(selectedFlowStateId);
  if (!state) return;
  const actionNodes = new Map(Array.from(flowNodeLayer.querySelectorAll(".flow-node[data-action-id]"))
    .map((node) => [node.dataset.actionId, node]));
  const startNode = flowNodeLayer.querySelector('.flow-node[data-node-id="start"]');
  const returnNode = actionNodes.get("return");
  const entryTargetId = state.entryTargetActionId || "";
  const fallbackEntryActionId = !entryTargetId && state.actions?.[0]?.id ? state.actions[0].id : "";
  const entryTarget = entryTargetId || fallbackEntryActionId;
  if (entryTarget && !isNoFlowTarget(entryTarget)) {
    const toNode = entryTarget === "return" ? returnNode : actionNodes.get(entryTarget);
    if (toNode) drawNodeWire(startNode, toNode, { muted: !entryTargetId });
  }
  for (const [index, action] of (state.actions || []).entries()) {
    const fromNode = actionNodes.get(action.id);
    for (const exit of flowNodeExitDefinitions(action)) {
      if (exit.targetKind === "state") continue;
      const branch = exit.branchId ? decisionBranchById(action, exit.branchId) : null;
      const targetId = branch ? branch.targetActionId : action[exit.field] || "";
      if (!targetId || isNoFlowTarget(targetId)) {
        continue;
      }
      const sourceNode = branch
        ? flowNodeLayer.querySelector(`.flow-node-branch[data-branch-id="${cssEscape(branch.id)}"]`) || fromNode
        : fromNode;
      const highlighted = selectedNodeWireMatches(action, targetId, branch?.id || "");
      const label = branch ? decisionBranchWireLabel(branch, ensureDecisionBranches(action).findIndex((item) => item.id === branch.id)) : "";
      if (targetId === "return") {
        drawNodeWire(sourceNode, returnNode, { highlighted, label });
        continue;
      }
      const toNode = actionNodes.get(targetId);
      if (toNode) drawNodeWire(sourceNode, toNode, { highlighted, label });
    }
    if (shouldDrawImplicitActionWire(action)) {
      const nextAction = state.actions[index + 1];
      if (nextAction) drawNodeWire(fromNode, actionNodes.get(nextAction.id), true);
    }
  }
  renderFlowNodeMinimap();
}

function renderFlowMomentNodes() {
  flowNodeWires.setAttribute("width", "1600");
  flowNodeWires.setAttribute("height", "920");
  nodeBackButton.disabled = true;
  nodeViewHelp.textContent = "Double-click a game moment to edit its action graph.";
  for (const [index, state] of (gameFlow.states || []).entries()) {
    const { x, y } = savedNodePosition(state, defaultNodePosition(index, 3, 80, 80, 420, 240));
    const node = createFlowNode({
      id: state.id,
      title: state.name,
      subtitle: `${(state.actions || []).length} actions${state.nextStateTargetId ? ` / Next: ${flowState(state.nextStateTargetId)?.name || state.nextStateTargetId}` : ""}`,
      x,
      y,
      width: 300,
      height: 150,
      className: "is-moment",
      selected: !selectedFlowActionId && (selectedFlowStateId === state.id || selectedFlowActionIds.has(state.id))
    });
    node.querySelector(".flow-node-main")?.appendChild(createFlowMomentPorts(state));
    bindFlowNodeDrag(node, state);
    node.addEventListener("click", (event) => {
      selectFlowMoment(state.id, { additive: event.metaKey || event.ctrlKey || event.shiftKey });
      renderFlowTool();
    });
    node.addEventListener("dblclick", () => {
      selectedFlowStateId = state.id;
      clearFlowActionSelection();
      flowNodeDepth = "actions";
      renderFlowTool();
    });
    flowNodeLayer.appendChild(node);
  }
  scheduleFlowNodeWireRedraw();
}

function createFlowMomentPorts(state) {
  const ports = document.createElement("div");
  ports.className = "flow-node-ports";
  const port = document.createElement("div");
  port.className = "flow-node-port";
  const label = document.createElement("span");
  label.textContent = `Next Moment${state.nextStateTargetId ? ` -> ${flowState(state.nextStateTargetId)?.name || state.nextStateTargetId}` : ""}`;
  const dot = document.createElement("span");
  dot.className = "flow-node-port-dot";
  dot.dataset.stateId = state.id;
  dot.dataset.field = "nextStateTargetId";
  dot.dataset.targetKind = "state";
  dot.addEventListener("pointerdown", (event) => {
    event.stopPropagation();
    pendingNodeConnection = { sourceKind: "moment", stateId: state.id, field: "nextStateTargetId", targetKind: "state", pointerId: event.pointerId, commandCreate: event.metaKey };
    flowNodeLayer.querySelectorAll(".flow-node-port-dot").forEach((item) => item.classList.remove("is-armed"));
    dot.classList.add("is-armed");
    flowNodeHint.textContent = "Release over another moment to connect this exit.";
  });
  port.append(label, dot);
  ports.appendChild(port);
  return ports;
}

function createFlowNode({ id, title, subtitle, timing = "", valueBadge = null, x, y, width, height, className = "", selected = false }) {
  const node = document.createElement("div");
  node.role = "button";
  node.tabIndex = 0;
  node.className = `flow-node ${className}`;
  node.dataset.nodeId = id;
  node.dataset.x = String(x);
  node.dataset.y = String(y);
  node.dataset.width = String(width);
  node.dataset.height = String(height);
  node.style.left = `${x}px`;
  node.style.top = `${y}px`;
  node.style.width = `${width}px`;
  if (height) node.style.minHeight = `${height}px`;
  node.classList.toggle("is-selected", selected);
  const main = document.createElement("div");
  main.className = "flow-node-main";
  const titleEl = document.createElement("div");
  titleEl.className = "flow-node-title";
  titleEl.textContent = title;
  const subtitleEl = document.createElement("div");
  subtitleEl.className = "flow-node-subtitle";
  subtitleEl.textContent = subtitle;
  main.append(titleEl, subtitleEl);
  if (timing || valueBadge?.text) {
    const metaRow = document.createElement("div");
    metaRow.className = "flow-node-meta-row";
    const timingEl = document.createElement("div");
    timingEl.className = "flow-node-timing";
    timingEl.textContent = timing;
    if (timing) metaRow.appendChild(timingEl);
    if (valueBadge?.text) {
      const badgeEl = document.createElement("div");
      badgeEl.className = `flow-node-value-badge ${valueBadge.className || ""}`.trim();
      badgeEl.textContent = valueBadge.text;
      metaRow.appendChild(badgeEl);
    }
    main.appendChild(metaRow);
  }
  node.appendChild(main);
  return node;
}

function actionNodeIsSelected(action) {
  return flowActionIsSelected(action.id)
    || (action.subActions || []).some((subAction) => flowActionIsSelected(subAction.id))
    || (action.type === "decision" && ensureDecisionBranches(action).some((branch) => flowActionIsSelected(branch.id)));
}

function reorderFlowNodeChild(parentAction, collectionName, draggedId, targetId) {
  const items = parentAction?.[collectionName] || [];
  const fromIndex = items.findIndex((item) => item.id === draggedId);
  const toIndex = items.findIndex((item) => item.id === targetId);
  if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return;
  if (collectionName === "branches" && items[fromIndex]?.type === "noMatch") return;
  pushFlowHistory();
  const [moved] = items.splice(fromIndex, 1);
  const adjustedIndex = fromIndex < toIndex ? toIndex - 1 : toIndex;
  items.splice(adjustedIndex, 0, moved);
  if (collectionName === "branches") ensureDecisionBranches(parentAction);
  renderFlowListAndPublish();
  renderFlowNodeView();
}

function bindFlowNodeChildSort(item, parentAction, collectionName, childId) {
  item.draggable = collectionName !== "branches" || decisionBranchById(parentAction, childId)?.type !== "noMatch";
  item.addEventListener("dragstart", (event) => {
    event.stopPropagation();
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("application/x-flow-node-child", JSON.stringify({
      parentActionId: parentAction.id,
      collectionName,
      childId
    }));
  });
  item.addEventListener("dragover", (event) => {
    if ([...event.dataTransfer.types].includes("application/x-flow-node-child")) {
      event.preventDefault();
    }
  });
  item.addEventListener("drop", (event) => {
    event.preventDefault();
    event.stopPropagation();
    try {
      const payload = JSON.parse(event.dataTransfer.getData("application/x-flow-node-child"));
      if (payload.parentActionId === parentAction.id && payload.collectionName === collectionName) {
        reorderFlowNodeChild(parentAction, collectionName, payload.childId, childId);
      }
    } catch (error) {
      // Ignore malformed drag payloads from outside the tool.
    }
  });
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
    item.classList.toggle("is-selected", flowActionIsSelected(subAction.id));
    const title = document.createElement("strong");
    title.textContent = subAction.name || "Sub-Action";
    const meta = document.createElement("div");
    meta.className = "flow-node-subaction-meta";
    const timing = document.createElement("span");
    timing.textContent = actionTimingLabel(subAction, true);
    meta.appendChild(timing);
    const valueBadge = actionValueBadge(subAction);
    if (valueBadge?.text) {
      const badge = document.createElement("span");
      badge.className = `flow-node-value-badge ${valueBadge.className || ""}`.trim();
      badge.textContent = valueBadge.text;
      meta.appendChild(badge);
    }
    item.append(title, meta);
    bindFlowNodeChildSort(item, parentAction, "subActions", subAction.id);
    item.addEventListener("pointerdown", (event) => event.stopPropagation());
    item.addEventListener("click", (event) => {
      event.stopPropagation();
      selectedFlowStateId = state.id;
      selectFlowAction(subAction.id, { additive: event.metaKey || event.ctrlKey || event.shiftKey });
      renderFlowTool();
    });
    list.appendChild(item);
  }
  return list;
}

function createFlowNodeBranches(state, action) {
  const branches = ensureDecisionBranches(action);
  if (!branches.length) return null;
  const list = document.createElement("div");
  list.className = "flow-node-subactions";
  branches.forEach((branch, index) => {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "flow-node-subaction flow-node-branch";
    item.dataset.branchId = branch.id;
    item.classList.toggle("is-no-match", branch.type === "noMatch");
    item.classList.toggle("is-selected", flowActionIsSelected(branch.id));
    const title = document.createElement("strong");
    title.textContent = decisionBranchName(branch, index);
    const target = document.createElement("span");
    target.textContent = branch.targetActionId ? `-> ${flowTargetActionName(branch.targetActionId)}` : "No Connection";
    const dot = document.createElement("span");
    dot.className = "flow-node-port-dot";
    dot.dataset.actionId = action.id;
    dot.dataset.branchId = branch.id;
    dot.dataset.targetKind = "action";
    dot.addEventListener("pointerdown", (event) => {
      event.stopPropagation();
      pendingNodeConnection = { stateId: state.id, actionId: action.id, field: "", branchId: branch.id, targetKind: "action", pointerId: event.pointerId, commandCreate: event.metaKey };
      flowNodeLayer.querySelectorAll(".flow-node-port-dot").forEach((port) => port.classList.remove("is-armed"));
      dot.classList.add("is-armed");
      flowNodeHint.textContent = event.metaKey ? "Release over a node to connect, or release on empty graph space to add an action." : "Release over a node to connect this branch.";
    });
    item.append(title, target, dot);
    bindFlowNodeChildSort(item, action, "branches", branch.id);
    item.addEventListener("pointerdown", (event) => {
      if (!event.target.closest(".flow-node-port-dot")) event.stopPropagation();
    });
    item.addEventListener("click", (event) => {
      event.stopPropagation();
      selectedFlowStateId = state.id;
      selectFlowAction(branch.id, { additive: event.metaKey || event.ctrlKey || event.shiftKey });
      renderFlowTool();
    });
    list.appendChild(item);
  });
  return list;
}

function bindFlowNodeDrag(node, item, { afterDrag = null } = {}) {
  let drag = null;
  node.addEventListener("click", (event) => {
    if (node.dataset.skipClick !== "true") return;
    event.preventDefault();
    event.stopImmediatePropagation();
    delete node.dataset.skipClick;
  }, true);
  node.addEventListener("pointerdown", (event) => {
    if (event.target.closest(".flow-node-port-dot") || event.target.closest(".flow-node-subaction")) return;
    const movingItems = flowNodeDepth === "actions" && item?.type
      ? (selectedPrimaryFlowActions().some((action) => action.id === item.id) ? selectedPrimaryFlowActions() : [item])
      : flowNodeDepth === "moments" && !item?.type
        ? (selectedFlowMomentStates().some((state) => state.id === item.id) ? selectedFlowMomentStates() : [item])
        : [item];
    drag = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      nodeX: Number(node.dataset.x || 0),
      nodeY: Number(node.dataset.y || 0),
      movingItems,
      origins: new Map(movingItems.map((movingItem) => {
        const movingNode = flowNodeLayer.querySelector(`.flow-node[data-action-id="${cssEscape(movingItem.id)}"], .flow-node[data-node-id="${cssEscape(movingItem.id)}"]`);
        const fallback = movingNode
          ? { x: Number(movingNode.dataset.x || 0), y: Number(movingNode.dataset.y || 0) }
          : { x: Number(node.dataset.x || 0), y: Number(node.dataset.y || 0) };
        return [movingItem.id, savedNodePosition(movingItem, fallback)];
      })),
      moved: false,
      lockAxis: ""
    };
    node.setPointerCapture?.(event.pointerId);
  });
  node.addEventListener("pointermove", (event) => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    let dx = (event.clientX - drag.startX) / flowNodeZoom;
    let dy = (event.clientY - drag.startY) / flowNodeZoom;
    if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
    if (event.shiftKey) {
      if (!drag.lockAxis && Math.abs(dx) + Math.abs(dy) > 4) {
        drag.lockAxis = Math.abs(dx) >= Math.abs(dy) ? "x" : "y";
      }
      if (drag.lockAxis === "x") dy = 0;
      if (drag.lockAxis === "y") dx = 0;
    } else {
      drag.lockAxis = "";
    }
    let x = drag.nodeX + dx;
    let y = drag.nodeY + dy;
    if (event.shiftKey && event.metaKey) {
      x = Math.round(x / 10) * 10;
      y = Math.round(y / 10) * 10;
    }
    for (const movingItem of drag.movingItems) {
      const origin = drag.origins.get(movingItem.id) || { x: drag.nodeX, y: drag.nodeY };
      let itemX = origin.x + (x - drag.nodeX);
      let itemY = origin.y + (y - drag.nodeY);
      if (event.shiftKey && event.metaKey) {
        itemX = Math.round(itemX / 10) * 10;
        itemY = Math.round(itemY / 10) * 10;
      }
      const movingNode = flowNodeLayer.querySelector(`.flow-node[data-action-id="${cssEscape(movingItem.id)}"], .flow-node[data-node-id="${cssEscape(movingItem.id)}"]`);
      if (movingNode) {
        movingNode.dataset.x = String(itemX);
        movingNode.dataset.y = String(itemY);
        movingNode.style.left = `${itemX}px`;
        movingNode.style.top = `${itemY}px`;
      }
    }
    redrawFlowNodeWires();
    renderFlowNodeMinimap();
  });
  const finish = (event) => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    node.releasePointerCapture?.(event.pointerId);
    if (drag.moved) {
      pushFlowHistory();
      node.dataset.skipClick = "true";
      window.setTimeout(() => delete node.dataset.skipClick, 0);
      for (const movingItem of drag.movingItems) {
        const movingNode = flowNodeLayer.querySelector(`.flow-node[data-action-id="${cssEscape(movingItem.id)}"], .flow-node[data-node-id="${cssEscape(movingItem.id)}"]`);
        if (movingNode) movingItem.nodePosition = { x: Math.round(Number(movingNode.dataset.x || 0)), y: Math.round(Number(movingNode.dataset.y || 0)) };
      }
      renderFlowListAndPublish();
      afterDrag?.();
      renderFlowNodeView();
    }
    drag = null;
  };
  node.addEventListener("pointerup", finish);
  node.addEventListener("pointercancel", finish);
}

function startFlowNodeMarquee(event) {
  if (event.button !== 0 || flowViewMode !== "node") return;
  if (pendingNodeConnection) return;
  if (!flowNodeGraph || !flowNodeLayer) return;
  const selector = flowNodeDepth === "moments" ? ".flow-node[data-node-id]" : ".flow-node[data-action-id]";
  return window.PartyGameToolAffordances?.startSelectionMarquee(event, {
    root: flowNodeGraph,
    itemRoot: flowNodeLayer,
    marqueeRoot: flowNodeLayer,
    className: "flow-node-selection-marquee",
    itemSelector: selector,
    coordinateScale: flowNodeZoom,
    getItemId: (node) => (flowNodeDepth === "moments" ? node.dataset.nodeId : node.dataset.actionId),
    shouldIgnoreTarget: (target) => Boolean(target.closest?.(".flow-node, .flow-node-port-dot")),
    onSelectionChange: (selectedIds) => {
      if (flowNodeDepth === "moments") {
        selectedFlowActionIds = new Set(selectedIds);
        selectedFlowStateId = selectedIds[selectedIds.length - 1] || selectedFlowStateId || gameFlow.states[0]?.id || "";
        selectedFlowActionId = "";
        for (const node of flowNodeLayer.querySelectorAll(".flow-node[data-node-id]")) {
          node.classList.toggle("is-selected", selectedFlowActionIds.has(node.dataset.nodeId) || selectedFlowStateId === node.dataset.nodeId);
        }
      } else {
        setFlowActionSelection(selectedIds);
        for (const node of flowNodeLayer.querySelectorAll(".flow-node[data-action-id]")) {
          node.classList.toggle("is-selected", flowActionIsSelected(node.dataset.actionId));
        }
      }
      renderFlowList();
      renderFlowNodeInspector();
    },
    onComplete: () => renderFlowTool()
  });
}

function renderFlowActionNodes() {
  const state = flowState(selectedFlowStateId);
  if (!state) return;
  nodeBackButton.disabled = false;
  nodeViewHelp.textContent = `Inside ${state.name}. Click nodes for properties; drag exit dots to connect actions.`;
  const actionNodes = new Map();
  const startModel = systemNodeModel(state, "start");
  const startPosition = savedNodePosition(startModel, { x: 70, y: 70 });
  const startNode = createFlowNode({
    id: "start",
    title: "Start",
    subtitle: state.entryTargetActionId ? `Entry -> ${flowTargetActionName(state.entryTargetActionId)}` : "Moment entry",
    x: startPosition.x,
    y: startPosition.y,
    width: 170,
    height: 86,
    className: "is-return",
    selected: flowActionIsSelected("start")
  });
  startNode.querySelector(".flow-node-main")?.appendChild(createFlowStartPorts(state));
  bindFlowNodeDrag(startNode, startModel);
  startNode.addEventListener("click", (event) => {
    selectedFlowStateId = state.id;
    selectFlowAction("start", { additive: event.metaKey || event.ctrlKey || event.shiftKey });
    renderFlowTool();
  });
  startNode.addEventListener("dblclick", () => {
    flowNodeDepth = "moments";
    clearFlowActionSelection();
    renderFlowTool();
  });
  flowNodeLayer.appendChild(startNode);
  for (const [index, action] of (state.actions || []).entries()) {
    const fallback = defaultNodePosition(index, 3, 340, 70, 360, 230);
    const { x, y } = savedNodePosition(action, fallback);
    const node = createFlowNode({
      id: action.id,
      title: action.name || `Action ${index + 1}`,
      subtitle: `${actionCategoryName(action)} / ${actionTypeMeta(action.type).name}`,
      timing: action.type === "decision" ? "" : actionTimingLabel(action, false),
      valueBadge: actionValueBadge(action),
      x,
      y,
      width: action.type === "decision" ? 320 : 260,
      height: 134,
      className: flowNodeClassForAction(action),
      selected: actionNodeIsSelected(action)
    });
    node.dataset.actionId = action.id;
    const childList = action.type === "decision"
      ? createFlowNodeBranches(state, action)
      : createFlowNodeSubActions(state, action);
    if (childList) node.appendChild(childList);
    if (action.type !== "decision") node.querySelector(".flow-node-main")?.appendChild(createFlowNodePorts(action));
    bindFlowNodeDrag(node, action);
    node.addEventListener("click", (event) => {
      selectedFlowStateId = state.id;
      selectFlowAction(action.id, { additive: event.metaKey || event.ctrlKey || event.shiftKey });
      renderFlowTool();
    });
    flowNodeLayer.appendChild(node);
    actionNodes.set(action.id, node);
  }
  const returnModel = systemNodeModel(state, "return");
  const returnPosition = savedNodePosition(returnModel, { x: 1240, y: 720 });
  const returnNode = createFlowNode({
    id: "return",
    title: "Return",
    subtitle: "Back to moments",
    x: returnPosition.x,
    y: returnPosition.y,
    width: 190,
    height: 92,
    className: "is-return",
    selected: flowActionIsSelected("return")
  });
  returnNode.dataset.actionId = "return";
  bindFlowNodeDrag(returnNode, returnModel);
  returnNode.addEventListener("click", (event) => {
    selectedFlowStateId = state.id;
    selectFlowAction("return", { additive: event.metaKey || event.ctrlKey || event.shiftKey });
    renderFlowTool();
  });
  returnNode.addEventListener("dblclick", () => {
    flowNodeDepth = "moments";
    clearFlowActionSelection();
    renderFlowTool();
  });
  flowNodeLayer.appendChild(returnNode);
  scheduleFlowNodeWireRedraw();
}

function isNoFlowTarget(value) {
  return String(value || "").toLowerCase() === "none";
}

function flowNodeExitDefinitions(action) {
  if (action.type === "decision") {
    return ensureDecisionBranches(action).map((branch, index) => ({
      label: decisionBranchName(branch, index),
      branchId: branch.id,
      targetKind: "action"
    }));
  }
  if (action.type === "voteOnAnswersInput") {
    return [
      { label: "Timer Ends", field: "timerEndTargetActionId" },
      { label: "Votes Submitted", field: "answersSubmittedTargetActionId" }
    ];
  }
  if (action.type === "multipleChoiceInput" || action.type === "triviaInput" || action.type === "textSubmissionInput") {
    return [
      { label: "Timer Ends", field: "timerEndTargetActionId" },
      { label: "Answers", field: "answersSubmittedTargetActionId" }
    ];
  }
  if (action.type === "transitionState") {
    return [{ label: action.trigger === "onCountdownComplete" ? "Countdown Complete" : "Event Complete", field: "nextTargetActionId" }];
  }
  return [{ label: "Next", field: "nextTargetActionId" }];
}

function estimatedFlowNodeHeight(action) {
  if (!action) return 92;
  const childCount = action.type === "decision"
    ? ensureDecisionBranches(action).length
    : (action.subActions || []).length;
  return 134 + childCount * 48;
}

function flowActionTargets(action) {
  if (!action) return [];
  return flowNodeExitDefinitions(action)
    .map((exit) => {
      const branch = exit.branchId ? decisionBranchById(action, exit.branchId) : null;
      return branch ? branch.targetActionId : action[exit.field] || "";
    })
    .filter((targetId) => targetId && !isNoFlowTarget(targetId));
}

function optimizeCurrentFlowMoment() {
  const state = flowState(selectedFlowStateId);
  if (!state || flowViewMode !== "node" || flowNodeDepth !== "actions") return;
  const actions = state.actions || [];
  const actionById = new Map(actions.map((action) => [action.id, action]));
  const rowById = new Map();
  const orderById = new Map();
  let nextOrder = 0;
  const markOrder = (id) => {
    if (!orderById.has(id)) orderById.set(id, nextOrder += 1);
  };
  const visit = (id, row, path = new Set()) => {
    if (!id || isNoFlowTarget(id)) return;
    if (id === "return") {
      rowById.set("return", Math.max(rowById.get("return") || 0, row));
      markOrder("return");
      return;
    }
    const action = actionById.get(id);
    if (!action) return;
    markOrder(id);
    rowById.set(id, Math.max(rowById.get(id) || 0, row));
    if (path.has(id)) return;
    const nextPath = new Set(path);
    nextPath.add(id);
    for (const targetId of flowActionTargets(action)) {
      visit(targetId, row + 1, nextPath);
    }
  };

  const entryTargetId = state.entryTargetActionId || actions[0]?.id || "";
  visit(entryTargetId, 1);
  for (const action of actions) {
    if (!rowById.has(action.id)) {
      markOrder(action.id);
      const lastRow = Math.max(1, 0, ...Array.from(rowById.values()).filter((row) => Number.isFinite(row)));
      rowById.set(action.id, lastRow + 1);
      for (const targetId of flowActionTargets(action)) visit(targetId, lastRow + 2);
    }
  }
  const deepestActionRow = Math.max(1, ...actions.map((action) => rowById.get(action.id) || 1));
  const returnRow = Math.max(deepestActionRow + 1, rowById.get("return") || 0);
  rowById.set("return", returnRow);

  const rows = new Map();
  for (const action of actions) {
    const row = rowById.get(action.id) || 1;
    if (!rows.has(row)) rows.set(row, []);
    rows.get(row).push(action);
  }
  for (const rowActions of rows.values()) {
    rowActions.sort((a, b) => (orderById.get(a.id) || 0) - (orderById.get(b.id) || 0));
  }

  const centerX = 800;
  const startY = 70;
  const rowGap = 120;
  const columnGap = 360;
  const nodeWidthFor = (action) => action.type === "decision" ? 320 : 260;
  pushFlowHistory();
  state.startNodePosition = { x: Math.round(centerX - 85), y: startY };
  const sortedRows = Array.from(rows.keys()).sort((a, b) => a - b);
  let currentY = startY + 190;
  for (const row of sortedRows) {
    const rowActions = rows.get(row) || [];
    const rowWidth = (rowActions.length - 1) * columnGap;
    rowActions.forEach((action, index) => {
      const width = nodeWidthFor(action);
      action.nodePosition = {
        x: Math.round(centerX - rowWidth / 2 + index * columnGap - width / 2),
        y: Math.round(currentY)
      };
    });
    const maxHeight = Math.max(134, ...rowActions.map(estimatedFlowNodeHeight));
    currentY += maxHeight + rowGap;
  }
  state.returnNodePosition = {
    x: Math.round(centerX - 95),
    y: Math.round(Math.max(currentY, startY + returnRow * rowGap))
  };
  flowNodeZoom = 1;
  setLocalValue("partyTemplate.flowNodeZoom", String(flowNodeZoom));
  renderFlowListAndPublish();
  renderFlowNodeView();
  window.requestAnimationFrame(() => {
    if (!flowNodeStage) return;
    flowNodeStage.scrollLeft = 0;
    flowNodeStage.scrollTop = 0;
    renderFlowNodeMinimap();
  });
}

function refreshFlowNodeInspectorChange() {
  renderFlowListAndPublish();
  renderFlowNodeView();
}

function applyFlowActionTypeDefaults(action, value, isSubAction = false) {
  action.type = value;
  if (value === "presentText") {
    action.text = action.text || "Presented text";
    if (!("textTarget" in action)) action.textTarget = "";
  }
  if (value === "multipleChoiceInput") {
    action.prompt = action.prompt || "Answer this question by tapping an answer";
    action.options = Array.isArray(action.options) && action.options.length ? action.options : ["A", "B", "C", "D"];
    action.inputMode = action.inputMode || "singleSelect";
    action.locked = action.locked === true;
    action.timerEndTargetActionId = action.timerEndTargetActionId || "";
    action.answersSubmittedTargetActionId = action.answersSubmittedTargetActionId || "";
  }
  if (value === "getRandomMultipleChoiceContent") {
    action.variableName = action.variableName || "multipleChoicePrompt";
  }
  if (value === "triviaInput") {
    action.contentVariable = action.contentVariable || "multipleChoicePrompt";
    action.inputMode = action.inputMode || "submitOnce";
    action.locked = action.locked === true;
    action.randomizeOptions = action.randomizeOptions === true;
    action.timerEndTargetActionId = action.timerEndTargetActionId || "";
    action.answersSubmittedTargetActionId = action.answersSubmittedTargetActionId || "";
  }
  if (value === "textSubmissionInput") {
    action.prompt = action.prompt || "Write your answer";
    action.placeholder = action.placeholder || "Answer here";
    action.characterLimit = Number(action.characterLimit || 0);
    action.timerEndTargetActionId = action.timerEndTargetActionId || "";
    action.answersSubmittedTargetActionId = action.answersSubmittedTargetActionId || "";
  }
  if (value === "setVotingCardsShown") {
    action.isShown = action.isShown !== false;
    action.instant = action.instant === true;
    action.cardFilter = action.cardFilter || "all";
  }
  if (value === "voteOnAnswersInput") {
    action.prompt = action.prompt || "Vote for your favorite answer";
    action.timerEndTargetActionId = action.timerEndTargetActionId || "";
    action.answersSubmittedTargetActionId = action.answersSubmittedTargetActionId || "";
  }
  if (value === "revealVotes") {
    action.voteRevealStaggerSeconds = Number(action.voteRevealStaggerSeconds ?? 1);
  }
  if (value === "displayText") {
    action.text = action.text || "Displayed text";
    if (!("textTarget" in action)) action.textTarget = "";
  }
  if (value === "getPlayerAnswers") {
    action.inputId = action.inputId || "input";
    action.round = action.round || "current";
    action.variableName = action.variableName || "playerAnswers";
  }
  if (value === "playAudio") action.audioUrl = action.audioUrl || "";
  if (value === "playHostAudio") {
    action.hostAudioId = action.hostAudioId || firstHostAudioId();
    action.playMode = action.playMode || "random";
    action.lineIndex = Math.max(0, Math.floor(Number(action.lineIndex || 0)));
  }
  if (value === "presentText" || value === "displayText" || value === "text" || value === "setPlayersShown" || value === "setPlayerAnswersShown") action.isShown = action.isShown !== false;
  if (value === "setPlayerAnswersShown" || value === "showPoints") action.playerFilter = action.playerFilter || (value === "showPoints" ? "correct" : "all");
  if (value === "showPoints") action.points = Math.max(0, Math.floor(Number(action.points || 0)));
  if (value === "setTimerShown") action.isShown = action.isShown !== false;
  if (value === "decision") {
    action.variable = action.variable || "activePlayerCount";
    action.valueType = action.valueType || "int";
    ensureDecisionBranches(action);
  }
  if (value === "transition") action.transition = action.transition || "horizontalWipe";
  if (value === "transitionState") action.targetState = action.targetState || "intro";
  if (value === "presentText" || value === "displayText" || value === "text") action.textTarget = action.textTarget || "presentation";
  ensureActionTiming(action, isSubAction);
}

const customDecisionVariableId = "__custom_variable_path__";

function baseDecisionVariableOptions() {
  return [
    { id: "activePlayerCount", name: "Active Player Count" },
    { id: "currentRound", name: "Current Round" },
    { id: "numSequentialGames", name: "Sequential Games" },
    { id: "isFirstGameOfSession", name: "Is First Game of Session" },
    { id: "gameTitle", name: "Game Title" },
    { id: "numberOfRounds", name: "Number of Rounds" },
    { id: "randomChanceTest", name: "Random Chance Test" },
    { id: "overrideFirstGameOfSession", name: "Override First Game of Session" },
    { id: "craftingTimerDuration", name: "Crafting Timer Duration" },
    { id: "startGameCountdownDuration", name: "Start Game Countdown Duration" },
    { id: "players.length", name: "Players.length" },
    { id: "choiceInputAnswers.count", name: "Choice Answers.count" },
    { id: "textInputAnswers.count", name: "Text Answers.count" }
  ];
}

function isKnownDecisionVariable(variable) {
  return baseDecisionVariableOptions().some((option) => option.id === variable);
}

function decisionVariableOptions() {
  return [
    ...baseDecisionVariableOptions(),
    { id: customDecisionVariableId, name: "Custom Variable Path" }
  ];
}

function addDecisionBranch(action, type) {
  const branches = ensureDecisionBranches(action);
  const noMatchIndex = Math.max(0, branches.findIndex((branch) => branch.type === "noMatch"));
  branches.splice(noMatchIndex, 0, {
    id: makeDecisionBranchId(type),
    type,
    value: type === "hit" ? "0" : "",
    code: type === "code" ? "x < 3" : "",
    targetActionId: ""
  });
}

function appendDecisionBranchControls(target, state, action, branch, index, rerender) {
  const panel = document.createElement("div");
  panel.className = "flow-form-grid";
  const branchTypeOptions = branch.type === "noMatch"
    ? [{ id: "noMatch", name: "No Match Branch" }]
    : [
        { id: "hit", name: "Hit Branch" },
        { id: "code", name: "Code Branch" }
      ];
  panel.appendChild(flowSelect(`Branch ${index + 1} Type`, branch.type, branchTypeOptions, (value) => {
    branch.type = value;
    if (value === "code" && !branch.code) branch.code = "x < 3";
    rerender();
  }));
  if (branch.type === "hit") {
    panel.appendChild(flowField("Hit Value", branch.value || "", (value) => {
      branch.value = value;
      rerender(false);
    }));
  }
  if (branch.type === "code") {
    panel.appendChild(flowField("Code", branch.code || "x < 3", (value) => {
      branch.code = value || "x < 3";
      rerender(false);
    }));
  }
  panel.appendChild(flowSelect("Branch Target", branch.targetActionId || "", flowActionTargetOptions(state, branch.targetActionId || ""), (value) => {
    branch.targetActionId = value;
    rerender();
  }));
  if (branch.type !== "noMatch") {
    panel.appendChild(flowActionButton("Remove Branch", () => {
      action.branches = ensureDecisionBranches(action).filter((item) => item.id !== branch.id);
      ensureDecisionBranches(action);
      rerender();
    }));
  }
  target.appendChild(panel);
}

function appendDecisionControls(target, state, action, rerender) {
  ensureDecisionBranches(action);
  const variable = action.variable || "activePlayerCount";
  const usesCustomVariable = action.variableMode === "custom" || !isKnownDecisionVariable(variable);
  target.appendChild(flowVariableSearch("Variable", usesCustomVariable ? customDecisionVariableId : variable, decisionVariableOptions(), (value) => {
    if (value === customDecisionVariableId) {
      action.variableMode = "custom";
    } else {
      delete action.variableMode;
      action.variable = value;
    }
    rerender();
  }));
  if (usesCustomVariable) {
    target.appendChild(flowField("Custom Variable Path", isKnownDecisionVariable(variable) ? "" : variable, (value) => {
      action.variableMode = "custom";
      action.variable = value.trim();
      rerender(false);
    }));
  }
  target.appendChild(flowSelect("Value Type", action.valueType || "int", [
    { id: "int", name: "Int" },
    { id: "float", name: "Float" },
    { id: "string", name: "String" },
    { id: "bool", name: "Bool" }
  ], (value) => {
    action.valueType = value;
    rerender();
  }));
  target.appendChild(readOnlyFlowNote("Branches are evaluated in order. The required No Match branch acts like an else statement."));
  const branches = ensureDecisionBranches(action);
  branches.forEach((branch, index) => {
    appendDecisionBranchControls(target, state, action, branch, index, rerender);
  });
  target.appendChild(flowActionButton("+ Hit Branch", () => {
    addDecisionBranch(action, "hit");
    rerender();
  }));
  target.appendChild(flowActionButton("+ Code Branch", () => {
    addDecisionBranch(action, "code");
    rerender();
  }));
}

function appendFlowActionPropertyControls(target, state, actionRef, { includeSubActionButton = false } = {}) {
  const action = actionRef?.action;
  if (!state || !action) return;
  const softChange = () => {
    renderFlowListAndPublish();
    redrawFlowNodeWires();
  };
  getFlowActionInspectorRegistry()?.appendActionPropertyControls(target, state, actionRef, {
    change: () => refreshFlowNodeInspectorChange(),
    softChange,
    refresh: () => refreshFlowNodeInspectorChange(),
    refreshAll: () => refreshFlowNodeInspectorChange(),
    decisionChange: (redrawNodeView = true) => {
      if (redrawNodeView) {
        refreshFlowNodeInspectorChange();
        return;
      }
      softChange();
    },
    includeSubActionButton,
    excludeNextActionTypes: ["voteOnAnswersInput"]
  });
}

function createFlowNodePorts(action) {
  const ports = document.createElement("div");
  ports.className = "flow-node-ports";
  for (const exit of flowNodeExitDefinitions(action)) {
    const port = document.createElement("div");
    port.className = "flow-node-port";
    const label = document.createElement("span");
    const branch = exit.branchId ? decisionBranchById(action, exit.branchId) : null;
    const target = branch ? branch.targetActionId : action[exit.field] || "";
    label.textContent = `${exit.label}${target ? ` -> ${flowTargetActionName(target)}` : ""}`;
    const dot = document.createElement("span");
    dot.className = "flow-node-port-dot";
    dot.dataset.actionId = action.id;
    dot.dataset.field = exit.field || "";
    dot.dataset.branchId = exit.branchId || "";
    dot.dataset.targetKind = exit.targetKind || "action";
    dot.addEventListener("pointerdown", (event) => {
      event.stopPropagation();
      pendingNodeConnection = { stateId: selectedFlowStateId, actionId: action.id, field: exit.field || "", branchId: exit.branchId || "", targetKind: exit.targetKind || "action", pointerId: event.pointerId, commandCreate: event.metaKey };
      flowNodeLayer.querySelectorAll(".flow-node-port-dot").forEach((item) => item.classList.remove("is-armed"));
      dot.classList.add("is-armed");
      flowNodeHint.textContent = event.metaKey ? "Release over a node to connect, or release on empty graph space to add an action." : "Release over a node to connect this exit.";
    });
    port.append(label, dot);
    ports.appendChild(port);
  }
  return ports;
}

function createFlowStartPorts(state) {
  const ports = document.createElement("div");
  ports.className = "flow-node-ports";
  const port = document.createElement("div");
  port.className = "flow-node-port";
  const label = document.createElement("span");
  label.textContent = `Entry${state.entryTargetActionId ? ` -> ${flowTargetActionName(state.entryTargetActionId)}` : ""}`;
  const dot = document.createElement("span");
  dot.className = "flow-node-port-dot";
  dot.dataset.stateId = state.id;
  dot.dataset.field = "entryTargetActionId";
  dot.dataset.targetKind = "action";
  dot.addEventListener("pointerdown", (event) => {
    event.stopPropagation();
    pendingNodeConnection = { sourceKind: "start", stateId: state.id, field: "entryTargetActionId", targetKind: "action", pointerId: event.pointerId, commandCreate: event.metaKey };
    flowNodeLayer.querySelectorAll(".flow-node-port-dot").forEach((item) => item.classList.remove("is-armed"));
    dot.classList.add("is-armed");
    flowNodeHint.textContent = event.metaKey ? "Release over a node to connect, or release on empty graph space to add an action." : "Release over an action to choose this moment's first action.";
  });
  port.append(label, dot);
  ports.appendChild(port);
  return ports;
}

function sourceNodeForPendingConnection() {
  if (!pendingNodeConnection || !flowNodeLayer) return null;
  if (pendingNodeConnection.sourceKind === "moment") {
    return flowNodeLayer.querySelector(`.flow-node[data-node-id="${cssEscape(pendingNodeConnection.stateId)}"]`);
  }
  if (pendingNodeConnection.sourceKind === "start") {
    return flowNodeLayer.querySelector('.flow-node[data-node-id="start"]');
  }
  if (pendingNodeConnection.branchId) {
    return flowNodeLayer.querySelector(`.flow-node-branch[data-branch-id="${cssEscape(pendingNodeConnection.branchId)}"]`);
  }
  return flowNodeLayer.querySelector(`.flow-node[data-action-id="${cssEscape(pendingNodeConnection.actionId)}"]`);
}

function redrawPendingNodeConnection(event) {
  if (!pendingNodeConnection || !event?.metaKey) return;
  redrawFlowNodeWires();
  drawPreviewNodeWire(sourceNodeForPendingConnection(), flowNodeLocalPoint(event));
}

function createActionFromPendingConnection(event) {
  if (!pendingNodeConnection || pendingNodeConnection.targetKind !== "action" || flowNodeDepth !== "actions") return false;
  const state = flowState(pendingNodeConnection.stateId);
  const sourceAction = pendingNodeConnection.sourceKind === "start" ? null : flowAction(state?.id, pendingNodeConnection.actionId);
  if (!state || (pendingNodeConnection.sourceKind !== "start" && !sourceAction)) return false;
  const point = flowNodeLocalPoint(event);
  const nextNumber = state.actions.length + 1;
  const action = createDefaultFlowAction(state.id, `Game Action ${nextNumber}`, false);
  action.nodePosition = {
    x: Math.max(0, Math.round(point.x - 130)),
    y: Math.max(0, Math.round(point.y - 67))
  };
  pushFlowHistory();
  state.actions.push(action);
  if (pendingNodeConnection.sourceKind === "start") {
    state.entryTargetActionId = action.id;
  } else if (pendingNodeConnection.branchId) {
    const branch = decisionBranchById(sourceAction, pendingNodeConnection.branchId);
    if (branch) branch.targetActionId = action.id;
  } else {
    sourceAction[pendingNodeConnection.field] = action.id;
  }
  setFlowActionSelection([action.id]);
  renderFlowListAndPublish();
  renderFlowNodeView();
  return true;
}

function handleFlowNodePointerMove(event) {
  if (!pendingNodeConnection || pendingNodeConnection.pointerId !== event.pointerId) return;
  if (event.metaKey) {
    pendingNodeConnection.commandCreate = true;
    redrawPendingNodeConnection(event);
  }
}

function clearPendingFlowNodeConnection() {
  flowNodeLayer?.querySelectorAll(".flow-node-port-dot").forEach((item) => item.classList.remove("is-armed"));
  pendingNodeConnection = null;
  redrawFlowNodeWires();
  if (flowNodeHint) flowNodeHint.textContent = "Drag from an exit dot to another node to create a connection.";
}

function handleFlowNodeWheel(event) {
  if (flowViewMode !== "node") return;
  event.preventDefault();
  const factor = event.deltaY > 0 ? 0.9 : 1 / 0.9;
  setFlowNodeZoom(flowNodeZoom * factor, event);
}

function jumpFlowNodeMinimap(event) {
  if (!flowNodeStage || !flowNodeMinimap) return;
  event.preventDefault();
  event.stopPropagation();
  const point = minimapGraphPoint(event);
  centerFlowNodeViewportOnGraphPoint(point.x, point.y);
}

function startFlowNodeMinimapDrag(event) {
  if (!flowNodeMinimap || event.button !== 0) return;
  event.preventDefault();
  event.stopPropagation();
  flowNodeMinimap.setPointerCapture?.(event.pointerId);
  const move = (moveEvent) => {
    if (moveEvent.pointerId !== event.pointerId) return;
    const point = minimapGraphPoint(moveEvent);
    centerFlowNodeViewportOnGraphPoint(point.x, point.y);
  };
  const stop = (stopEvent) => {
    if (stopEvent.pointerId !== event.pointerId) return;
    flowNodeMinimap.releasePointerCapture?.(stopEvent.pointerId);
    flowNodeMinimap.removeEventListener("pointermove", move);
    flowNodeMinimap.removeEventListener("pointerup", stop);
    flowNodeMinimap.removeEventListener("pointercancel", stop);
  };
  move(event);
  flowNodeMinimap.addEventListener("pointermove", move);
  flowNodeMinimap.addEventListener("pointerup", stop);
  flowNodeMinimap.addEventListener("pointercancel", stop);
}

function completeNodeConnection(targetNode) {
  if (!pendingNodeConnection) return;
  const state = flowState(pendingNodeConnection.stateId);
  if (!state) return;
  const action = pendingNodeConnection.sourceKind === "moment" || pendingNodeConnection.sourceKind === "start" ? null : flowAction(state.id, pendingNodeConnection.actionId);
  if (pendingNodeConnection.sourceKind !== "moment" && pendingNodeConnection.sourceKind !== "start" && !action) return;
  const targetId = pendingNodeConnection.targetKind === "state"
    ? targetNode?.dataset.nodeId
    : targetNode?.dataset.actionId;
  if (!targetId) return;
  if (pendingNodeConnection.sourceKind === "moment") {
    if (targetId === state.id) return;
    pushFlowHistory();
    state[pendingNodeConnection.field] = targetId;
    pendingNodeConnection = null;
    renderFlowListAndPublish();
    renderFlowNodeView();
    return;
  }
  if (pendingNodeConnection.sourceKind === "start") {
    pushFlowHistory();
    state.entryTargetActionId = targetId;
    pendingNodeConnection = null;
    renderFlowListAndPublish();
    renderFlowNodeView();
    return;
  }
  if (targetId === action.id) return;
  pushFlowHistory();
  if (pendingNodeConnection.branchId) {
    const branch = decisionBranchById(action, pendingNodeConnection.branchId);
    if (branch) branch.targetActionId = targetId;
  } else {
    action[pendingNodeConnection.field] = targetId;
  }
  pendingNodeConnection = null;
  renderFlowListAndPublish();
  renderFlowNodeView();
}

function renderFlowNodeInspector() {
  if (!flowNodeInspector) return;
  flowNodeInspector.replaceChildren();
  const state = flowState(selectedFlowStateId);
  const actionRef = state ? flowActionRef(selectedFlowStateId, selectedFlowActionId) : null;
  const action = actionRef?.action || null;
  const title = document.createElement("h3");
  if (flowNodeDepth === "moments" || !state) {
    title.textContent = selectedFlowStateId ? flowState(selectedFlowStateId)?.name || "Game Moment" : "Node View";
    const copy = document.createElement("p");
    copy.textContent = "Double-click a moment node to inspect and connect the actions inside it. Moment wires use the same Next Moment data shown in List View.";
    flowNodeInspector.append(title, copy);
    if (state) {
      flowNodeInspector.appendChild(flowSelect("Entry Action", state.entryTargetActionId || "", flowActionTargetOptions(state, state.entryTargetActionId || ""), (value) => {
        pushFlowHistory();
        state.entryTargetActionId = value;
        renderFlowListAndPublish();
        renderFlowNodeView();
      }));
      flowNodeInspector.appendChild(flowSelect("Next Moment", state.nextStateTargetId || "", flowStateTargetOptions(state.nextStateTargetId || "", state.id), (value) => {
        pushFlowHistory();
        state.nextStateTargetId = value;
        renderFlowListAndPublish();
        renderFlowNodeView();
      }));
    }
    return;
  }
  if (!action) {
    title.textContent = state.name;
    const copy = document.createElement("p");
    copy.textContent = "Select an action node to inspect its properties and exit connections.";
    flowNodeInspector.append(title, copy);
    return;
  }
  title.textContent = action.name;
  const summary = document.createElement("p");
  if (actionRef.isBranch) {
    const branchIndex = ensureDecisionBranches(actionRef.parentAction).findIndex((branch) => branch.id === action.id);
    title.textContent = decisionBranchName(action, branchIndex);
    summary.textContent = `Branch under ${actionRef.parentAction?.name || "Decision"}.`;
    flowNodeInspector.append(title, summary);
    flowNodeInspector.appendChild(readOnlyFlowNote("Branches are checked in order. A branch with no connection will halt the game when it is selected."));
    appendDecisionBranchControls(flowNodeInspector, state, actionRef.parentAction, action, branchIndex, (redrawNodeView = true) => {
      if (redrawNodeView) {
        refreshFlowNodeInspectorChange();
        return;
      }
      renderFlowListAndPublish();
      redrawFlowNodeWires();
    });
    flowNodeInspector.appendChild(flowActionButton("Edit In List View", () => {
      setFlowViewMode("list");
    }));
    return;
  }
  summary.textContent = `${actionRef.isSubAction ? `Sub-action under ${actionRef.parentAction?.name || "Action"}. ` : ""}${actionSummary(action, actionRef.isSubAction)}`;
  flowNodeInspector.append(title, summary);
  flowNodeInspector.appendChild(readOnlyFlowNote(`${actionCategoryName(action)} / ${actionTypeMeta(action.type).name}`));
  appendFlowActionPropertyControls(flowNodeInspector, state, actionRef, { includeSubActionButton: !actionRef.isSubAction && action.type !== "decision" });
  flowNodeInspector.appendChild(flowActionButton("Edit In List View", () => {
    setFlowViewMode("list");
  }));
}

function flowHistorySnapshot() {
  return JSON.stringify(serializeGameFlowForSave(gameFlow));
}

function getFlowHistoryManager() {
  if (!flowHistoryManager && window.PartyGameToolHistory) {
    flowHistoryManager = window.PartyGameToolHistory.createHistory({
      snapshot: flowHistorySnapshot,
      restore: restoreFlowHistory,
      limit: 30
    });
  }
  return flowHistoryManager;
}

function pushFlowHistory() {
  getFlowHistoryManager()?.push();
}

function restoreFlowHistory(snapshot) {
  gameFlow = JSON.parse(snapshot);
  selectedFlowStateId = flowState(selectedFlowStateId)?.id || gameFlow.states[0]?.id || "";
  if (flowAction(selectedFlowStateId, selectedFlowActionId)) {
    setFlowActionSelection([...selectedFlowActionIds, selectedFlowActionId]);
  } else {
    clearFlowActionSelection();
  }
  renderFlowTool();
}

function undoFlowChange() {
  getFlowHistoryManager()?.undo();
}

function redoFlowChange() {
  getFlowHistoryManager()?.redo();
}

function handleFlowHotkeys(event) {
  if (flowScreen.classList.contains("hidden")) return;
  const tagName = event.target?.tagName?.toLowerCase();
  const isEditingField = tagName === "input" || tagName === "textarea" || tagName === "select";
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
    event.preventDefault();
    if (event.shiftKey) {
      redoFlowChange();
    } else {
      undoFlowChange();
    }
    return;
  }
  if (!isEditingField && (event.key === "Delete" || event.key === "Backspace")) {
    event.preventDefault();
    deleteFlowItem();
  }
}
