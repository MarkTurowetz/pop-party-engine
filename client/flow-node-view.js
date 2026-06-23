function renderFlowNodeView() {
  if (!flowNodeLayer || !flowNodeWires || flowViewMode !== "node") return;
  flowNodeLayer.replaceChildren();
  clearFlowNodeWires();
  resetFlowNodeConnection();
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
  if (action.type === "jumpNode") return "is-jump";
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
  getFlowNodeMinimap()?.position();
}

function renderFlowNodeMinimap() {
  getFlowNodeMinimap()?.render();
}

function centerFlowNodeViewportOnGraphPoint(graphX, graphY) {
  getFlowNodeMinimap()?.centerOnGraphPoint(graphX, graphY);
}

function minimapGraphPoint(event) {
  return getFlowNodeMinimap()?.graphPoint(event) || { x: 0, y: 0 };
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

function clearFlowNodeWires() {
  getFlowNodeWireRenderer()?.clear();
}

function drawNodeWire(fromNode, toNode, optionsOrMuted = false) {
  getFlowNodeWireRenderer()?.draw(fromNode, toNode, optionsOrMuted);
}

function drawPreviewNodeWire(fromNode, to) {
  getFlowNodeWireRenderer()?.drawPreview(fromNode, to);
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
  return getFlowNodeWireRenderer()?.localPoint(event) || { x: 0, y: 0 };
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
  clearFlowNodeWires();
  if (flowNodeDepth === "moments") {
    const stateNodes = new Map(Array.from(flowNodeLayer.querySelectorAll(".flow-node[data-node-id]"))
      .map((node) => [node.dataset.nodeId, node]));
    const routeNodes = new Map(Array.from(flowNodeLayer.querySelectorAll(".flow-node[data-route-node-id]"))
      .map((node) => [node.dataset.routeNodeId, node]));
    for (const state of gameFlow.states || []) {
      const fromNode = stateNodes.get(state.id);
      const toNode = state.nextStateTargetId ? stateNodes.get(state.nextStateTargetId) : null;
      if (toNode) {
        drawNodeWire(fromNode, toNode, {
          highlighted: selectedFlowStateId === state.id || selectedFlowActionIds.has(state.id)
        });
      }
    }
    for (const routeNode of flowRouteNodes()) {
      const fromNode = routeNodes.get(routeNode.id);
      const toNode = routeNode.targetStateId ? stateNodes.get(routeNode.targetStateId) : null;
      if (!fromNode || !toNode) continue;
      drawNodeWire(fromNode, toNode, {
        highlighted: selectedFlowRouteNodeId === routeNode.id,
        label: "Entry"
      });
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
    if (action.type === "jumpNode" && actionNodeIsSelected(action)) {
      const targetId = action.jumpTargetActionId || "";
      if (targetId && !isNoFlowTarget(targetId)) {
        const toNode = targetId === "return" ? returnNode : actionNodes.get(targetId);
        if (toNode) {
          drawNodeWire(fromNode, toNode, {
            highlighted: actionNodeIsSelected(action),
            label: "Jump",
            fromAnchor: "center"
          });
        }
      }
    }
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
  nodeViewHelp.textContent = "Double-click a game moment to edit its action graph. Add Moment Entry nodes for reusable routing anchors.";
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
      selected: !selectedFlowRouteNodeId && !selectedFlowActionId && (selectedFlowStateId === state.id || selectedFlowActionIds.has(state.id))
    });
    node.querySelector(".flow-node-main")?.appendChild(createFlowMomentPorts(state));
    bindFlowNodeDrag(node, state);
    node.addEventListener("click", (event) => {
      selectFlowMoment(state.id, { additive: event.metaKey || event.ctrlKey || event.shiftKey });
      renderFlowTool();
    });
    node.addEventListener("dblclick", () => {
      selectedFlowStateId = state.id;
      clearFlowRouteNodeSelection();
      clearFlowActionSelection();
      expandFlowStateInList(state.id);
      flowNodeDepth = "actions";
      renderFlowTool();
    });
    flowNodeLayer.appendChild(node);
  }
  for (const [index, routeNode] of flowRouteNodes().entries()) {
    const { x, y } = savedNodePosition(routeNode, defaultNodePosition(index, 2, 860, 80, 320, 190));
    const targetName = routeNode.targetStateId ? flowStateName(routeNode.targetStateId) : "No target";
    const node = createFlowNode({
      id: routeNode.id,
      title: routeNode.name || "Moment Entry",
      subtitle: `Moment Entry -> ${targetName}`,
      x,
      y,
      width: 260,
      height: 120,
      className: "is-moment-entry",
      selected: selectedFlowRouteNodeId === routeNode.id,
      valueBadge: routeNode.targetStateId ? null : { text: "Needs Target", className: "is-warning" }
    });
    node.dataset.routeNodeId = routeNode.id;
    delete node.dataset.nodeId;
    node.querySelector(".flow-node-main")?.appendChild(createFlowMomentRoutePorts(routeNode));
    bindFlowNodeDrag(node, routeNode);
    node.addEventListener("click", () => {
      selectFlowRouteNode(routeNode.id);
      renderFlowTool();
    });
    flowNodeLayer.appendChild(node);
  }
  scheduleFlowNodeWireRedraw();
}

function emptyFlowNodePorts() {
  const ports = document.createElement("div");
  ports.className = "flow-node-ports";
  return ports;
}

function createFlowMomentPorts(state) {
  return getFlowNodePortsFactory()?.createMomentPorts(state) || emptyFlowNodePorts();
}

function createFlowMomentRoutePorts(routeNode) {
  return getFlowNodePortsFactory()?.createMomentRoutePorts(routeNode) || emptyFlowNodePorts();
}

function createFlowNode({ id, title, subtitle, timing = "", valueBadge = null, x, y, width, height, className = "", selected = false, jumpTarget = false }) {
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
  node.classList.toggle("is-jump-target", jumpTarget);
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

function bindFlowNodeChildSort(item, parentAction, collectionName, childId) {
  getFlowNodeChildSortController()?.bind(item, parentAction, collectionName, childId);
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
      expandFlowStateInList(state.id);
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
      armFlowNodeConnection({
        connection: { stateId: state.id, actionId: action.id, field: "", branchId: branch.id, targetKind: "action", pointerId: event.pointerId, commandCreate: event.metaKey },
        dot,
        hint: event.metaKey ? "Release over a node to connect, or release on empty graph space to add an action." : "Release over a node to connect this branch."
      });
    });
    item.append(title, target, dot);
    bindFlowNodeChildSort(item, action, "branches", branch.id);
    item.addEventListener("pointerdown", (event) => {
      if (!event.target.closest(".flow-node-port-dot")) event.stopPropagation();
    });
    item.addEventListener("click", (event) => {
      event.stopPropagation();
      selectedFlowStateId = state.id;
      expandFlowStateInList(state.id);
      selectFlowAction(branch.id, { additive: event.metaKey || event.ctrlKey || event.shiftKey });
      renderFlowTool();
    });
    list.appendChild(item);
  });
  return list;
}

function bindFlowNodeDrag(node, item, { afterDrag = null } = {}) {
  getFlowNodeDragController()?.bind(node, item, { afterDrag });
}

function startFlowNodeMarquee(event) {
  return getFlowNodeMarqueeController()?.start(event);
}

function renderFlowActionNodes() {
  const state = flowState(selectedFlowStateId);
  if (!state) return;
  nodeBackButton.disabled = false;
  nodeViewHelp.textContent = `Inside ${state.name}. Click nodes for properties; drag exit dots to connect actions.`;
  const actionNodes = new Map();
  const jumpTargetIds = new Set((state.actions || [])
    .filter((action) => action.type === "jumpNode" && actionNodeIsSelected(action))
    .map((action) => action.jumpTargetActionId || "")
    .filter((targetId) => targetId && !isNoFlowTarget(targetId)));
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
    expandFlowStateInList(state.id);
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
      timing: action.type === "decision" || action.type === "jumpNode" ? "" : actionTimingLabel(action, false),
      valueBadge: actionValueBadge(action),
      x,
      y,
      width: action.type === "decision" ? 320 : 260,
      height: 134,
      className: flowNodeClassForAction(action),
      selected: actionNodeIsSelected(action),
      jumpTarget: jumpTargetIds.has(action.id)
    });
    node.dataset.actionId = action.id;
    const childList = action.type === "decision"
      ? createFlowNodeBranches(state, action)
      : createFlowNodeSubActions(state, action);
    if (childList) node.appendChild(childList);
    if (action.type !== "decision" && action.type !== "jumpNode") node.querySelector(".flow-node-main")?.appendChild(createFlowNodePorts(action));
    bindFlowNodeDrag(node, action);
    node.addEventListener("click", (event) => {
      selectedFlowStateId = state.id;
      expandFlowStateInList(state.id);
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
    selected: flowActionIsSelected("return"),
    jumpTarget: jumpTargetIds.has("return")
  });
  returnNode.dataset.actionId = "return";
  bindFlowNodeDrag(returnNode, returnModel);
  returnNode.addEventListener("click", (event) => {
    selectedFlowStateId = state.id;
    expandFlowStateInList(state.id);
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
  if (action.type === "presentText") {
    return [{ label: "Screen Click", field: "stageClickTargetActionId", fallbackField: "nextTargetActionId" }];
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
  if (action.type === "jumpNode") return [];
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
  if (action.type === "jumpNode") {
    const targetId = action.jumpTargetActionId || "";
    return targetId && !isNoFlowTarget(targetId) ? [targetId] : [];
  }
  return flowNodeExitDefinitions(action)
    .map((exit) => {
      const branch = exit.branchId ? decisionBranchById(action, exit.branchId) : null;
      return branch ? branch.targetActionId : action[exit.field] || action[exit.fallbackField] || "";
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
  getFlowActionDefaults()?.applyActionTypeDefaults(action, value, isSubAction);
}

function appendDecisionBranchControls(target, state, action, branch, index, rerender) {
  getFlowDecisionControls()?.appendDecisionBranchControls(target, state, action, branch, index, rerender);
}

function appendDecisionControls(target, state, action, rerender) {
  getFlowDecisionControls()?.appendDecisionControls(target, state, action, rerender);
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
  const exits = flowNodeExitDefinitions(action).map((exit) => ({
    ...exit,
    branch: exit.branchId ? decisionBranchById(action, exit.branchId) : null
  }));
  return getFlowNodePortsFactory()?.createActionPorts(action, exits) || emptyFlowNodePorts();
}

function createFlowStartPorts(state) {
  return getFlowNodePortsFactory()?.createStartPorts(state) || emptyFlowNodePorts();
}

function armFlowNodeConnection({ connection, dot, hint }) {
  getFlowNodeConnectionController()?.arm({ connection, dot, hint });
}

function resetFlowNodeConnection() {
  getFlowNodeConnectionController()?.reset();
}

function hasPendingFlowNodeConnection() {
  return Boolean(getFlowNodeConnectionController()?.hasPending());
}

function shouldCreateActionFromPendingConnection(event) {
  return Boolean(getFlowNodeConnectionController()?.shouldCreateAction(event));
}

function createActionFromPendingConnection(event) {
  return Boolean(getFlowNodeConnectionController()?.createAction(event));
}

function handleFlowNodePointerMove(event) {
  getFlowNodeConnectionController()?.handlePointerMove(event);
}

function clearPendingFlowNodeConnection() {
  getFlowNodeConnectionController()?.clear();
}

function handleFlowNodeWheel(event) {
  if (flowViewMode !== "node") return;
  event.preventDefault();
  const factor = event.deltaY > 0 ? 0.9 : 1 / 0.9;
  setFlowNodeZoom(flowNodeZoom * factor, event);
}

function jumpFlowNodeMinimap(event) {
  getFlowNodeMinimap()?.jump(event);
}

function startFlowNodeMinimapDrag(event) {
  getFlowNodeMinimap()?.startDrag(event);
}

function completeNodeConnection(targetNode) {
  getFlowNodeConnectionController()?.complete(targetNode);
}

function renderFlowNodeInspector() {
  if (!flowNodeInspector) return;
  flowNodeInspector.replaceChildren();
  const state = flowState(selectedFlowStateId);
  const routeNode = selectedFlowRouteNode();
  const actionRef = state ? flowActionRef(selectedFlowStateId, selectedFlowActionId) : null;
  const action = actionRef?.action || null;
  const title = document.createElement("h3");
  if (flowNodeDepth === "moments" && routeNode) {
    title.textContent = routeNode.name || "Moment Entry";
    const copy = document.createElement("p");
    copy.textContent = "Moment Entry nodes are reusable routing anchors on the moment graph. Later decision paths can target these anchors instead of hard-coding a moment jump.";
    flowNodeInspector.append(title, copy);
    if (!routeNode.targetStateId) {
      flowNodeInspector.appendChild(readOnlyFlowNote("Warning: this Moment Entry needs a target or any future path that reaches it will hang."));
    }
    flowNodeInspector.appendChild(flowField("Name", routeNode.name || "Moment Entry", (value) => {
      pushFlowHistory();
      routeNode.name = value || "Moment Entry";
      renderFlowListAndPublish();
      renderFlowNodeView();
    }));
    flowNodeInspector.appendChild(flowSelect("Target Moment", routeNode.targetStateId || "", flowMomentEntryTargetOptions(routeNode.targetStateId || ""), (value) => {
      pushFlowHistory();
      routeNode.targetStateId = value;
      renderFlowListAndPublish();
      renderFlowNodeView();
    }));
    flowNodeInspector.appendChild(flowActionButton("Delete Moment Entry", () => {
      deleteSelectedFlowRouteNode();
    }));
    return;
  }
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
  appendFlowActionPropertyControls(flowNodeInspector, state, actionRef, { includeSubActionButton: !actionRef.isSubAction && action.type !== "decision" && action.type !== "jumpNode" });
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
  selectedFlowRouteNodeId = flowRouteNode(selectedFlowRouteNodeId)?.id || "";
  expandFlowStateInList(selectedFlowStateId);
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
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
    event.preventDefault();
    if (event.shiftKey) {
      redoFlowChange();
    } else {
      undoFlowChange();
    }
    return;
  }
  window.PartyGameToolAffordances?.handleToolDeleteHotkey(event, {
    canDelete: () => Boolean(selectedFlowStateId || selectedFlowActionId || selectedFlowActionIds.size),
    onDelete: deleteFlowItem
  });
}
