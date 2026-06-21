function flowState(stateId) {
  return gameFlow.states.find((state) => state.id === stateId) || null;
}

function cssEscape(value) {
  return window.CSS?.escape ? window.CSS.escape(String(value)) : String(value).replace(/["\\]/g, "\\$&");
}

function flowAction(stateId, actionId) {
  return flowActionRef(stateId, actionId)?.action || null;
}

function setFlowActionSelection(ids) {
  const state = flowState(selectedFlowStateId);
  const validIds = new Set();
  if (flowViewMode === "node" && flowNodeDepth === "actions") {
    validIds.add("start");
    validIds.add("return");
  }
  for (const action of state?.actions || []) {
    validIds.add(action.id);
    for (const subAction of action.subActions || []) validIds.add(subAction.id);
    if (action.type === "decision") {
      for (const branch of ensureDecisionBranches(action)) validIds.add(branch.id);
    }
  }
  const nextIds = (Array.isArray(ids) ? ids : [ids]).filter((id) => validIds.has(id));
  selectedFlowActionIds = new Set(nextIds);
  selectedFlowActionId = nextIds[nextIds.length - 1] || "";
}

function clearFlowActionSelection() {
  selectedFlowActionIds = new Set();
  selectedFlowActionId = "";
}

function selectFlowAction(actionId, options = {}) {
  if (options.additive) {
    const nextIds = new Set(selectedFlowActionIds);
    if (nextIds.has(actionId)) {
      nextIds.delete(actionId);
    } else {
      nextIds.add(actionId);
    }
    setFlowActionSelection([...nextIds]);
  } else {
    setFlowActionSelection([actionId]);
  }
}

function flowActionIsSelected(actionId) {
  return selectedFlowActionIds.has(actionId) || selectedFlowActionId === actionId;
}

function primaryFlowActionIdForSelection(actionId) {
  const ref = flowActionRef(selectedFlowStateId, actionId);
  return ref?.parentAction?.id || ref?.action?.id || "";
}

function selectedPrimaryFlowActions() {
  const state = flowState(selectedFlowStateId);
  if (!state) return [];
  const primaryIds = new Set([...selectedFlowActionIds].map(primaryFlowActionIdForSelection).filter(Boolean));
  const selectedItems = state.actions.filter((action) => primaryIds.has(action.id));
  if (selectedFlowActionIds.has("start")) selectedItems.push(systemNodeModel(state, "start"));
  if (selectedFlowActionIds.has("return")) selectedItems.push(systemNodeModel(state, "return"));
  return selectedItems;
}

function selectedFlowMomentStates() {
  if (flowNodeDepth !== "moments" || selectedFlowActionId) return [];
  return gameFlow.states.filter((state) => state.id === selectedFlowStateId || selectedFlowActionIds.has(state.id));
}

function setFlowMomentSelection(ids) {
  const validIds = new Set((gameFlow.states || []).map((state) => state.id));
  const nextIds = (Array.isArray(ids) ? ids : [ids]).filter((id) => validIds.has(id));
  selectedFlowActionIds = new Set(nextIds);
  selectedFlowStateId = nextIds[nextIds.length - 1] || "";
  selectedFlowActionId = "";
}

function selectFlowMoment(stateId, options = {}) {
  if (options.additive) {
    const currentIds = new Set(selectedFlowMomentStates().map((state) => state.id));
    if (currentIds.has(stateId)) {
      currentIds.delete(stateId);
    } else {
      currentIds.add(stateId);
    }
    setFlowMomentSelection([...currentIds]);
  } else {
    setFlowMomentSelection([stateId]);
  }
}

function flowActionRef(stateId, actionId) {
  const state = flowState(stateId);
  if (!state || !actionId) return null;
  for (const action of state.actions) {
    if (action.id === actionId) {
      return { state, action, parentAction: null, actions: state.actions, isSubAction: false, isBranch: false };
    }
    for (const subAction of action.subActions || []) {
      if (subAction.id === actionId) {
        return { state, action: subAction, parentAction: action, actions: action.subActions, isSubAction: true, isBranch: false };
      }
    }
    if (action.type === "decision") {
      for (const branch of ensureDecisionBranches(action)) {
        if (branch.id === actionId) {
          return { state, action: branch, parentAction: action, actions: action.branches, isSubAction: false, isBranch: true };
        }
      }
    }
  }
  return null;
}

function makeFlowId(label, fallback) {
  return String(label || fallback)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 42) || fallback;
}

function actionTypeName(type) {
  return flowActionTypes.find((item) => item.id === type)?.name || type;
}

function actionTypeMeta(type) {
  return flowActionTypes.find((item) => item.id === type) || { id: type, name: type, category: "standard" };
}

function actionCategoryName(action) {
  return actionTypeMeta(action.type).category === "input" ? "Input" : "Standard";
}

function stateActionNameSet(state, excludeActionId = "") {
  const names = new Set();
  for (const action of state?.actions || []) {
    if (action.id !== excludeActionId && action.name) names.add(String(action.name).trim().toLowerCase());
    for (const subAction of action.subActions || []) {
      if (subAction.id !== excludeActionId && subAction.name) names.add(String(subAction.name).trim().toLowerCase());
    }
  }
  return names;
}

function uniqueActionNameForType(state, action) {
  const base = actionTypeName(action?.type || "") || "Action";
  const existing = stateActionNameSet(state, action?.id || "");
  if (!existing.has(base.toLowerCase())) return base;
  let index = 1;
  while (existing.has(`${base} ${index}`.toLowerCase())) index += 1;
  return `${base} ${index}`;
}

function refreshActionNameFromType(state, action) {
  if (!state || !action) return;
  action.name = uniqueActionNameForType(state, action);
}

function textTargetOptionsForFlowState(stateId, selectedTarget = "") {
  const seen = new Set();
  const options = [];
  const addElement = (element) => {
    if (!element || element.kind !== "text") return;
    const id = normalizeTextTargetId(element.id);
    if (!id || seen.has(id)) return;
    seen.add(id);
    options.push({ id, name: element.name || id });
  };
  for (const element of globalStageLayout().elements || []) addElement(element);
  for (const element of stageLayoutState(stateId)?.elements || []) addElement(element);
  if (!options.length) {
    options.push({ id: "presentation", name: "Presentation Text" }, { id: "prompt", name: "Prompt Text" });
  }
  const normalizedSelected = normalizeTextTargetId(selectedTarget);
  if (normalizedSelected && !seen.has(normalizedSelected)) {
    options.push({ id: normalizedSelected, name: formatTextTargetName(normalizedSelected) });
  }
  return options;
}

function textTargetName(target) {
  const normalized = normalizeTextTargetId(target);
  const option = textTargetOptionsForFlowState(selectedFlowStateId).find((item) => item.id === normalized);
  if (option) return option.name;
  if (normalized === "presentation") return "Presentation Text";
  if (normalized === "prompt") return "Prompt Text";
  return formatTextTargetName(normalized);
}

function formatTextTargetName(normalized) {
  return normalized.split("-").map((part) => part ? part[0].toUpperCase() + part.slice(1) : "").join(" ");
}

function actionSummary(action, isSubAction = false) {
  const timing = ensureActionTiming(action, isSubAction);
  const timingText = `${timing.mode} ${Number(timing.seconds || 0).toFixed(1)}s`;
  const targetText = textTargetName(action.textTarget || "presentation");
  const instantText = action.instant ? " / Instant" : "";
  if (action.type === "presentText") return `${action.isShown === false ? "Hide" : "Show"} ${targetText}: "${action.text || ""}" / ${timingText}${instantText}`;
  if (action.type === "multipleChoiceInput") {
    const modeName = action.inputMode === "submitOnce" ? "Submit Once" : action.inputMode === "continuous" ? "Continuous" : "Single Select";
    const lockedText = action.inputMode === "singleSelect" && action.locked ? " / Locked" : "";
    const eventText = ` / timer: ${flowTargetActionName(action.timerEndTargetActionId)} / answers: ${flowTargetActionName(action.answersSubmittedTargetActionId)}`;
    return `${modeName}${lockedText}: ${action.prompt || "Choice input"} / ${(action.options || []).length || 0} options${eventText} / ${timingText}`;
  }
  if (action.type === "getRandomMultipleChoiceContent") return `Get random prompt -> ${action.variableName || "multipleChoicePrompt"} / ${timingText}`;
  if (action.type === "triviaInput") {
    const modeName = action.inputMode === "singleSelect" ? "Single Select" : action.inputMode === "continuous" ? "Continuous" : "Submit Once";
    const randomText = action.randomizeOptions ? " / Randomized" : "";
    const eventText = ` / timer: ${flowTargetActionName(action.timerEndTargetActionId)} / answers: ${flowTargetActionName(action.answersSubmittedTargetActionId)}`;
    return `Trivia from ${action.contentVariable || "multipleChoicePrompt"} / ${modeName}${randomText}${eventText} / ${timingText}`;
  }
  if (action.type === "textSubmissionInput") {
    const limitText = Number(action.characterLimit || 0) > 0 ? ` / ${Number(action.characterLimit)} chars` : "";
    const eventText = ` / timer: ${flowTargetActionName(action.timerEndTargetActionId)} / answers: ${flowTargetActionName(action.answersSubmittedTargetActionId)}`;
    return `Text Submit: ${action.prompt || "Write your answer"}${limitText} / Stage validates${eventText} / ${timingText}`;
  }
  if (action.type === "prepareVotingCards") return `Prepare anonymous voting cards / ${timingText}`;
  if (action.type === "setVotingCardsShown") return `${action.isShown === false ? "Hide" : "Show"} ${action.cardFilter || "all"} voting cards / ${timingText}${instantText}`;
  if (action.type === "voteOnAnswersInput") {
    const eventText = ` / timer: ${flowTargetActionName(action.timerEndTargetActionId)} / votes: ${flowTargetActionName(action.answersSubmittedTargetActionId)}`;
    return `Vote on answers: ${action.prompt || "Vote for your favorite answer"}${eventText} / ${timingText}`;
  }
  if (action.type === "revealVotingResults") return `Reveal voting results / ${timingText}`;
  if (action.type === "displayText" || action.type === "text") return `${action.isShown === false ? "Hide" : "Show"} ${targetText}: "${action.text || ""}" / ${timingText}${instantText}`;
  if (action.type === "setPlayersShown") return `${action.isShown === false ? "Hide" : "Show"} players / ${timingText}${instantText}`;
  if (action.type === "setPlayerAnswersShown") return `${action.isShown === false ? "Hide" : "Show"} ${action.playerFilter || "all"} player answers / ${timingText}${instantText}`;
  if (action.type === "revealPlayerAnswerCorrectness") return `Reveal answer correctness / ${timingText}`;
  if (action.type === "showPoints") return `Show points for ${action.playerFilter || "correct"} players / ${timingText}`;
  if (action.type === "givePendingPoints") return `Bank pending points / ${timingText}`;
  if (action.type === "setTimerShown") return `${action.isShown === false ? "Hide" : "Show"} crafting timer / ${timingText}${instantText}`;
  if (action.type === "startCraftingTimer") return `Start crafting timer / ${timingText}`;
  if (action.type === "decision") return `${decisionVariableName(action.variable)}: ${decisionSummary(action)}`;
  if (action.type === "transition") return `${flowTransitions.find((item) => item.id === action.transition)?.name || action.transition} / ${timingText}`;
  if (action.type === "transitionState") return `To ${flowState(action.targetState)?.name || action.targetState || "State"} / ${timingText}`;
  return `${action.text || "Text"} / ${timingText}`;
}

function actionTimingLabel(action, isSubAction = false) {
  const timing = ensureActionTiming(action, isSubAction);
  return `${timing.mode} ${Number(timing.seconds || 0).toFixed(2)}s`;
}

function actionValueBadge(action) {
  if (!action) return null;
  const visibilityActionTypes = new Set([
    "displayText",
    "presentText",
    "setPlayersShown",
    "setPlayerAnswersShown",
    "setTimerShown",
    "setVotingCardsShown"
  ]);
  if (!visibilityActionTypes.has(action.type)) return null;
  const isShown = action.isShown !== false;
  return {
    text: isShown ? "Show" : "Hide",
    className: isShown ? "is-show" : "is-hide"
  };
}

function flowTargetActionName(actionId) {
  if (!actionId) return "No Connection";
  if (actionId === "none") return "None";
  if (actionId === "return") return "Return";
  const state = flowState(selectedFlowStateId);
  const action = (state?.actions || []).find((item) => item.id === actionId);
  return action?.name || "Next Action";
}

function decisionVariableName(variable) {
  if (variable === "activePlayerCount") return "Active Player Count";
  if (variable === "currentRound") return "Current Round";
  if (variable === "numSequentialGames") return "Sequential Games";
  if (variable === "isFirstGameOfSession") return "Is First Game";
  if (variable === "gameTitle") return "Game Title";
  if (variable === "numberOfRounds") return "Number of Rounds";
  if (variable === "randomChanceTest") return "Random Chance Test";
  if (variable === "overrideFirstGameOfSession") return "Override First Game";
  if (variable === "craftingTimerDuration") return "Crafting Timer Duration";
  return variable || "Variable";
}

function makeDecisionBranchId(type = "branch") {
  return `${type}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function ensureDecisionBranches(action) {
  if (!action) return [];
  if (!Array.isArray(action.branches) || !action.branches.length) {
    action.branches = [
      {
        id: "legacy-hit",
        type: "code",
        code: `x ${action.operator || "<"} ${action.compareValue || "3"}`,
        value: action.compareValue || "3",
        targetActionId: action.trueTargetActionId || ""
      },
      {
        id: "no-match",
        type: "noMatch",
        targetActionId: action.falseTargetActionId || ""
      }
    ];
  }
  action.branches = action.branches.map((branch, index) => ({
    id: branch.id || (branch.type === "noMatch" ? "no-match" : makeDecisionBranchId(`branch-${index + 1}`)),
    type: ["hit", "code", "noMatch"].includes(branch.type) ? branch.type : "hit",
    value: branch.value ?? "",
    code: branch.code || "x < 3",
    targetActionId: branch.targetActionId || ""
  }));
  const regular = action.branches.filter((branch) => branch.type !== "noMatch");
  const noMatch = action.branches.find((branch) => branch.type === "noMatch") || { id: "no-match", type: "noMatch", value: "", code: "", targetActionId: "" };
  action.branches = [...regular, { ...noMatch, type: "noMatch", id: noMatch.id || "no-match" }];
  return action.branches;
}

function decisionBranchById(action, branchId) {
  return ensureDecisionBranches(action).find((branch) => branch.id === branchId);
}

function decisionBranchName(branch, index = 0) {
  if (!branch) return "Branch";
  if (branch.type === "noMatch") return "No Match";
  if (branch.type === "code") return `Code ${index + 1}`;
  return `Hit ${branch.value || "Value"}`;
}

function decisionBranchWireLabel(branch, index = 0) {
  if (!branch) return "";
  if (branch.type === "code") return branch.code || decisionBranchName(branch, index);
  if (branch.type === "hit") return String(branch.value || decisionBranchName(branch, index));
  return decisionBranchName(branch, index);
}

function decisionSummary(action) {
  return ensureDecisionBranches(action).map((branch, index) => {
    const target = flowTargetActionName(branch.targetActionId);
    if (branch.type === "noMatch") return `else -> ${target}`;
    if (branch.type === "code") return `${branch.code || "x < 3"} -> ${target}`;
    return `${decisionVariableName(action.variable)} = ${branch.value || ""} -> ${target}`;
  }).join(" / ");
}

function flowActionTargetOptions(state, selectedActionId = "") {
  const options = [{ id: "", name: "No Connection" }, { id: "none", name: "None" }, { id: "return", name: "Return To Moments" }];
  for (const action of state?.actions || []) {
    options.push({ id: action.id, name: action.name || action.id });
  }
  if (selectedActionId && !options.some((option) => option.id === selectedActionId)) {
    options.push({ id: selectedActionId, name: selectedActionId });
  }
  return options;
}

function flowStateTargetOptions(selectedStateId = "", currentStateId = "") {
  const options = [{ id: "", name: "No Next Moment" }, { id: "none", name: "None / Halt" }];
  for (const state of gameFlow.states || []) {
    if (state.id === currentStateId) continue;
    options.push({ id: state.id, name: state.name || state.id });
  }
  if (selectedStateId && !options.some((option) => option.id === selectedStateId)) {
    options.push({ id: selectedStateId, name: selectedStateId });
  }
  return options;
}

function currentRuntimeLocalMessage(overrides = {}) {
  const message = { type: "runtime-test-config" };
  if (flowSavedSnapshot) {
    const flowDirty = isFlowDirty();
    message.flow = flowDirty ? serializeGameFlowForSave(gameFlow) : null;
    message.clearFlow = !flowDirty;
  }
  if (layoutSavedSnapshot) {
    const layoutDirty = isLayoutDirty();
    message.layouts = layoutDirty ? serializeStageLayoutsForSave(stageLayouts) : null;
    message.clearLayouts = !layoutDirty;
  }
  if (controllerLayoutSavedSnapshot) {
    const controllerLayoutDirty = isControllerLayoutDirty();
    message.controllerLayouts = controllerLayoutDirty ? serializeStageLayoutsForSave(controllerLayouts) : null;
    message.clearControllerLayouts = !controllerLayoutDirty;
  }
  if (constantsSavedSnapshot) {
    const constantsDirty = isToolDirty("constants");
    message.constants = constantsDirty ? gameConstants : null;
    message.clearConstants = !constantsDirty;
  }
  return { ...message, ...overrides };
}

function publishRuntimeLocalChanges(overrides = {}) {
  const message = currentRuntimeLocalMessage(overrides);
  runtimeTestChannel?.postMessage(message);
  if (canUseServer) {
    postJson("/api/tool-drafts", message).catch(() => {});
  }
  updateGlobalSaveButton();
}

function publishRuntimeLocalClear() {
  const message = {
    type: "runtime-test-config",
    flow: null,
    layouts: null,
    controllerLayouts: null,
    constants: null,
    clearFlow: true,
    clearLayouts: true,
    clearControllerLayouts: true,
    clearConstants: true
  };
  runtimeTestChannel?.postMessage(message);
  if (canUseServer) {
    postJson("/api/tool-drafts", message).catch(() => {});
  }
  updateGlobalSaveButton();
}

function renderFlowListAndPublish() {
  renderFlowList();
  renderFlowActions();
  publishRuntimeLocalChanges();
}

window.addEventListener("beforeunload", () => {
  if (isFlowDirty() || isLayoutDirty() || isControllerLayoutDirty()) publishRuntimeLocalClear();
});

async function loadGameFlow() {
  const result = await getJson("/api/game-flow");
  gameFlow = result.flow || { states: [] };
  flowActionTypes = result.availableActionTypes || [];
  flowTransitions = result.availableTransitions || [];
  flowSavedSnapshot = JSON.stringify(serializeGameFlowForSave(result.savedFlow || result.flow || gameFlow));
  flowUndoStack = [];
  flowRedoStack = [];
  updateFlowStorageStatus(result.storage);
  selectedFlowStateId = selectedFlowStateId || gameFlow.states[0]?.id || "";
  clearFlowActionSelection();
  renderFlowTool();
}

function updateFlowStorageStatus(storage) {
  if (!flowStorageStatus) return;
  if (!storage) {
    flowStorageStatus.textContent = "Flow storage: unknown";
    return;
  }
  if (storage.durable) {
    flowStorageStatus.textContent = `Flow storage: GitHub ${storage.repo || ""}${storage.branch ? ` / ${storage.branch}` : ""}`;
    return;
  }
  flowStorageStatus.textContent = storage.error || "Flow storage: local fallback only";
}

function renderFlowTool() {
  renderFlowList();
  renderFlowEditor();
  renderFlowNodeView();
  updateFlowViewMode();
  renderFlowActions();
  publishRuntimeLocalChanges();
}

function isFlowDirty() {
  return flowSavedSnapshot && JSON.stringify(serializeGameFlowForSave(gameFlow)) !== flowSavedSnapshot;
}

function renderFlowActions() {
  if (revertFlowButton) revertFlowButton.disabled = !flowSavedSnapshot || !isFlowDirty();
  if (nodeOptimizeButton) nodeOptimizeButton.disabled = flowViewMode !== "node" || flowNodeDepth !== "actions" || !flowState(selectedFlowStateId);
}

function setFlowViewMode(mode) {
  flowViewMode = mode === "node" ? "node" : "list";
  setLocalValue("partyTemplate.flowViewMode", flowViewMode);
  if (flowViewMode === "node" && selectedFlowStateId) flowNodeDepth = "actions";
  updateFlowViewMode();
  renderFlowNodeView();
  renderFlowActions();
}

function updateFlowViewMode() {
  const nodeMode = flowViewMode === "node";
  flowListViewButton?.classList.toggle("is-active", !nodeMode);
  flowNodeViewButton?.classList.toggle("is-active", nodeMode);
  flowEditor?.classList.toggle("hidden", nodeMode);
  flowNodeWorkspace?.classList.toggle("hidden", !nodeMode);
  flowEditor?.parentElement?.classList.toggle("is-node-view", nodeMode);
  if (nodeMode) {
    flowEditorTitle.textContent = flowNodeDepth === "moments" ? "Node View" : flowState(selectedFlowStateId)?.name || "Node View";
    flowEditorHelp.textContent = flowNodeDepth === "moments"
      ? "Double-click a game moment to edit the actions inside it."
      : "Drag exit dots onto another action node to create explicit flow connections.";
  }
}

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
  if (event.target.closest?.(".flow-node, .flow-node-port-dot")) return;
  if (!flowNodeStage?.contains(event.target) || !flowNodeLayer) return;
  event.preventDefault();
  const rootRect = flowNodeGraph.getBoundingClientRect();
  const startX = (event.clientX - rootRect.left) / flowNodeZoom;
  const startY = (event.clientY - rootRect.top) / flowNodeZoom;
  const marquee = document.createElement("div");
  marquee.className = "flow-node-selection-marquee";
  flowNodeLayer.appendChild(marquee);
  flowNodeStage.setPointerCapture?.(event.pointerId);

  const updateMarquee = (moveEvent) => {
    const currentX = (moveEvent.clientX - rootRect.left) / flowNodeZoom;
    const currentY = (moveEvent.clientY - rootRect.top) / flowNodeZoom;
    const left = Math.min(startX, currentX);
    const top = Math.min(startY, currentY);
    const width = Math.abs(currentX - startX);
    const height = Math.abs(currentY - startY);
    marquee.style.left = `${left}px`;
    marquee.style.top = `${top}px`;
    marquee.style.width = `${width}px`;
    marquee.style.height = `${height}px`;

    const selectionRect = { left, top, right: left + width, bottom: top + height };
    const selectedIds = [];
    const selector = flowNodeDepth === "moments" ? ".flow-node[data-node-id]" : ".flow-node[data-action-id]";
    for (const node of flowNodeLayer.querySelectorAll(selector)) {
      const nodeId = flowNodeDepth === "moments" ? node.dataset.nodeId : node.dataset.actionId;
      if (!nodeId) continue;
      const nodeRect = node.getBoundingClientRect();
      const localRect = {
        left: (nodeRect.left - rootRect.left) / flowNodeZoom,
        top: (nodeRect.top - rootRect.top) / flowNodeZoom,
        right: (nodeRect.right - rootRect.left) / flowNodeZoom,
        bottom: (nodeRect.bottom - rootRect.top) / flowNodeZoom
      };
      if (rectsIntersect(selectionRect, localRect)) selectedIds.push(nodeId);
    }
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
  };

  const stopMarquee = (stopEvent) => {
    flowNodeStage.releasePointerCapture?.(stopEvent.pointerId);
    marquee.remove();
    window.removeEventListener("pointermove", updateMarquee);
    window.removeEventListener("pointerup", stopMarquee);
    window.removeEventListener("pointercancel", stopMarquee);
    renderFlowTool();
  };

  updateMarquee(event);
  window.addEventListener("pointermove", updateMarquee);
  window.addEventListener("pointerup", stopMarquee, { once: true });
  window.addEventListener("pointercancel", stopMarquee, { once: true });
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
  if (value === "presentText") action.text = action.text || "Presented text";
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
  if (value === "displayText") action.text = action.text || "Displayed text";
  if (value === "playAudio") action.audioUrl = action.audioUrl || "";
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
  const rerender = (redrawNodeView = true) => {
    if (redrawNodeView) {
      refreshFlowNodeInspectorChange();
      return;
    }
    renderFlowListAndPublish();
    redrawFlowNodeWires();
  };
  target.appendChild(flowActionNameField(state, action, (value) => {
    action.name = value || action.name;
    rerender();
  }, () => rerender()));
  target.appendChild(flowActionTypeSearch("Action Type", action.type, flowActionTypes, (value) => {
    applyFlowActionTypeDefaults(action, value, actionRef.isSubAction);
    refreshActionNameFromType(state, action);
    rerender();
  }));
  if (action.type === "presentText" || action.type === "displayText" || action.type === "text") {
    const textTargetOptions = textTargetOptionsForFlowState(state.id, action.textTarget || "presentation");
    target.appendChild(flowSelect("Text Field", normalizeTextTargetId(action.textTarget || textTargetOptions[0]?.id || "presentation"), textTargetOptions, (value) => {
      action.textTarget = value;
      rerender();
    }));
    target.appendChild(flowTextarea("Text", action.text || "", (value) => {
      action.text = value;
      rerender(false);
    }));
    target.appendChild(flowSelect("Text Visible", action.isShown === false ? "false" : "true", [
      { id: "true", name: "True" },
      { id: "false", name: "False" }
    ], (value) => {
      action.isShown = value !== "false";
      rerender();
    }));
    target.appendChild(flowSelect("Instant", action.instant === true ? "true" : "false", [
      { id: "false", name: "False" },
      { id: "true", name: "True" }
    ], (value) => {
      action.instant = value === "true";
      rerender();
    }));
  }
  if (action.type === "multipleChoiceInput") {
    target.appendChild(flowSelect("Button Style", action.inputMode || "singleSelect", [
      { id: "singleSelect", name: "Multi-Select Single" },
      { id: "submitOnce", name: "Single Input Done State" },
      { id: "continuous", name: "Continuous Input" }
    ], (value) => {
      action.inputMode = value;
      rerender();
    }));
    if ((action.inputMode || "singleSelect") === "singleSelect") {
      target.appendChild(flowSelect("Locked", action.locked === true ? "true" : "false", [
        { id: "false", name: "False" },
        { id: "true", name: "True" }
      ], (value) => {
        action.locked = value === "true";
        rerender();
      }));
    }
    target.appendChild(flowTextarea("Prompt Text", action.prompt || "Answer this question by tapping an answer", (value) => {
      action.prompt = value || "Answer this question by tapping an answer";
      rerender(false);
    }));
    target.appendChild(flowTextarea("Answer Bubble Text Options", (action.options || ["A", "B", "C", "D"]).join("\n"), (value) => {
      const options = value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean).slice(0, 12);
      action.options = options.length ? options : ["A", "B", "C", "D"];
      rerender(false);
    }));
    const targetOptions = flowActionTargetOptions(state, action.timerEndTargetActionId || action.answersSubmittedTargetActionId || "");
    target.appendChild(flowSelect("On Timer Ends", action.timerEndTargetActionId || "", targetOptions, (value) => {
      action.timerEndTargetActionId = value;
      rerender();
    }));
    target.appendChild(flowSelect("On Answers Submitted", action.answersSubmittedTargetActionId || "", targetOptions, (value) => {
      action.answersSubmittedTargetActionId = value;
      rerender();
    }));
  }
  if (action.type === "getRandomMultipleChoiceContent") {
    target.appendChild(flowField("Store In Variable", action.variableName || "multipleChoicePrompt", (value) => {
      action.variableName = (value || "multipleChoicePrompt").trim() || "multipleChoicePrompt";
      rerender();
    }));
    target.appendChild(readOnlyFlowNote("Gets a random prompt from the server prompt pool and stores it in this flow variable for later actions."));
  }
  if (action.type === "triviaInput") {
    target.appendChild(flowField("Multiple Choice Content Variable", action.contentVariable || "multipleChoicePrompt", (value) => {
      action.contentVariable = (value || "multipleChoicePrompt").trim() || "multipleChoicePrompt";
      rerender();
    }));
    target.appendChild(flowSelect("Button Style", action.inputMode || "submitOnce", [
      { id: "singleSelect", name: "Multi-Select Single" },
      { id: "submitOnce", name: "Single Input Done State" },
      { id: "continuous", name: "Continuous Input" }
    ], (value) => {
      action.inputMode = value;
      rerender();
    }));
    if ((action.inputMode || "submitOnce") === "singleSelect") {
      target.appendChild(flowSelect("Locked", action.locked === true ? "true" : "false", [
        { id: "false", name: "False" },
        { id: "true", name: "True" }
      ], (value) => {
        action.locked = value === "true";
        rerender();
      }));
    }
    target.appendChild(flowSelect("Randomize Options", action.randomizeOptions === true ? "true" : "false", [
      { id: "false", name: "False" },
      { id: "true", name: "True" }
    ], (value) => {
      action.randomizeOptions = value === "true";
      rerender();
    }));
    const targetOptions = flowActionTargetOptions(state, action.timerEndTargetActionId || action.answersSubmittedTargetActionId || "");
    target.appendChild(flowSelect("On Timer Ends", action.timerEndTargetActionId || "", targetOptions, (value) => {
      action.timerEndTargetActionId = value;
      rerender();
    }));
    target.appendChild(flowSelect("On Answers Submitted", action.answersSubmittedTargetActionId || "", targetOptions, (value) => {
      action.answersSubmittedTargetActionId = value;
      rerender();
    }));
  }
  if (action.type === "textSubmissionInput") {
    target.appendChild(flowTextarea("Prompt Text", action.prompt || "Write your answer", (value) => {
      action.prompt = value || "Write your answer";
      rerender(false);
    }));
    target.appendChild(flowField("Placeholder Text", action.placeholder || "Answer here", (value) => {
      action.placeholder = value || "Answer here";
      rerender();
    }));
    target.appendChild(flowNumber("Character Limit (0 = No Limit)", Number(action.characterLimit || 0), (value) => {
      action.characterLimit = Math.max(0, Math.floor(Number(value) || 0));
      rerender();
    }));
    const targetOptions = flowActionTargetOptions(state, action.timerEndTargetActionId || action.answersSubmittedTargetActionId || "");
    target.appendChild(flowSelect("On Timer Ends", action.timerEndTargetActionId || "", targetOptions, (value) => {
      action.timerEndTargetActionId = value;
      rerender();
    }));
    target.appendChild(flowSelect("On Answers Submitted", action.answersSubmittedTargetActionId || "", targetOptions, (value) => {
      action.answersSubmittedTargetActionId = value;
      rerender();
    }));
  }
  if (action.type === "prepareVotingCards") {
    target.appendChild(readOnlyFlowNote("Builds shuffled anonymous voting cards from the latest stored text answers. The card keeps the author internally, but players only see the answer text."));
  }
  if (action.type === "setVotingCardsShown") {
    target.appendChild(flowSelect("Voting Cards Visible", action.isShown === false ? "false" : "true", [
      { id: "true", name: "True" },
      { id: "false", name: "False" }
    ], (value) => {
      action.isShown = value !== "false";
      rerender();
    }));
    target.appendChild(flowSelect("Cards", action.cardFilter || "all", [
      { id: "all", name: "All Cards" },
      { id: "winners", name: "Winning Cards" },
      { id: "losers", name: "Losing Cards" }
    ], (value) => {
      action.cardFilter = value;
      rerender();
    }));
    target.appendChild(flowSelect("Instant", action.instant === true ? "true" : "false", [
      { id: "false", name: "False" },
      { id: "true", name: "True" }
    ], (value) => {
      action.instant = value === "true";
      rerender();
    }));
  }
  if (action.type === "voteOnAnswersInput") {
    target.appendChild(flowTextarea("Prompt Text", action.prompt || "Vote for your favorite answer", (value) => {
      action.prompt = value || "Vote for your favorite answer";
      rerender(false);
    }));
    const targetOptions = flowActionTargetOptions(state, action.timerEndTargetActionId || action.answersSubmittedTargetActionId || "");
    target.appendChild(flowSelect("On Timer Ends", action.timerEndTargetActionId || "", targetOptions, (value) => {
      action.timerEndTargetActionId = value;
      rerender();
    }));
    target.appendChild(flowSelect("On Votes Submitted", action.answersSubmittedTargetActionId || "", targetOptions, (value) => {
      action.answersSubmittedTargetActionId = value;
      rerender();
    }));
    target.appendChild(readOnlyFlowNote("Players vote for one anonymous answer card. The controller hides the player's own answer, and the stage stores votes secretly until results are revealed."));
  }
  if (action.type === "revealVotingResults") {
    target.appendChild(readOnlyFlowNote("Counts stored votes, marks winning voting cards, and reveals which players voted for each answer."));
  }
  if (action.type === "doNothing") {
    target.appendChild(readOnlyFlowNote("This action intentionally has no effect. Use its timing to create a pause or delayed branch."));
  }
  if (action.type === "playAudio") {
    target.appendChild(flowField("Audio URL", action.audioUrl || "", (value) => {
      action.audioUrl = value;
      rerender();
    }));
    target.appendChild(readOnlyFlowNote("Callback fires when the audio ends. Leave blank to complete immediately, or use S+ timing for fire-and-forget sound effects."));
  }
  if (action.type === "setPlayersShown") {
    target.appendChild(flowSelect("Players Visible", action.isShown === false ? "false" : "true", [
      { id: "true", name: "True" },
      { id: "false", name: "False" }
    ], (value) => {
      action.isShown = value !== "false";
      rerender();
    }));
    target.appendChild(flowSelect("Instant", action.instant === true ? "true" : "false", [
      { id: "false", name: "False" },
      { id: "true", name: "True" }
    ], (value) => {
      action.instant = value === "true";
      rerender();
    }));
  }
  if (action.type === "setPlayerAnswersShown") {
    target.appendChild(flowSelect("Player Answers Visible", action.isShown === false ? "false" : "true", [
      { id: "true", name: "True" },
      { id: "false", name: "False" }
    ], (value) => {
      action.isShown = value !== "false";
      rerender();
    }));
    target.appendChild(flowSelect("Instant", action.instant === true ? "true" : "false", [
      { id: "false", name: "False" },
      { id: "true", name: "True" }
    ], (value) => {
      action.instant = value === "true";
      rerender();
    }));
    target.appendChild(flowSelect("Players", action.playerFilter || "all", [
      { id: "all", name: "All Players" },
      { id: "correct", name: "Correct Players" },
      { id: "wrong", name: "Wrong Players" },
      { id: "votingWinner", name: "Voting Winner Authors" },
      { id: "votingLosers", name: "Voting Losing Authors" }
    ], (value) => {
      action.playerFilter = value;
      rerender();
    }));
  }
  if (action.type === "revealPlayerAnswerCorrectness") {
    target.appendChild(readOnlyFlowNote("Compares stored player trivia answers to the current prompt and marks answer bubbles green or red."));
  }
  if (action.type === "showPoints") {
    target.appendChild(flowSelect("Players", action.playerFilter || "correct", [
      { id: "all", name: "All Players" },
      { id: "correct", name: "Correct Players" },
      { id: "wrong", name: "Wrong Players" },
      { id: "votingWinner", name: "Voting Winner Authors" },
      { id: "votingLosers", name: "Voting Losing Authors" }
    ], (value) => {
      action.playerFilter = value;
      rerender();
    }));
    target.appendChild(flowNumber("Points (0 = Correct Answer Constant)", Number(action.points || 0), (value) => {
      action.points = Math.max(0, Math.floor(Number(value) || 0));
      rerender();
    }));
    target.appendChild(readOnlyFlowNote("Adds pending points immediately, then shows a temporary points popup above each targeted player's answer bubble."));
  }
  if (action.type === "givePendingPoints") {
    target.appendChild(readOnlyFlowNote("Transfers every player's pending points into their score, then resets pending points to 0. No visual popup is shown."));
  }
  if (action.type === "setTimerShown") {
    target.appendChild(flowSelect("Timer Visible", action.isShown === false ? "false" : "true", [
      { id: "true", name: "True" },
      { id: "false", name: "False" }
    ], (value) => {
      action.isShown = value !== "false";
      rerender();
    }));
    target.appendChild(flowSelect("Instant", action.instant === true ? "true" : "false", [
      { id: "false", name: "False" },
      { id: "true", name: "True" }
    ], (value) => {
      action.instant = value === "true";
      rerender();
    }));
  }
  if (action.type === "decision") {
    appendDecisionControls(target, state, action, rerender);
    target.appendChild(readOnlyFlowNote("Decision actions do not use timing. They evaluate branches in order and wait forever if the selected branch has no connection."));
    return;
  }
  if (action.type === "transition") {
    target.appendChild(flowSelect("Transition", action.transition || "horizontalWipe", flowTransitions, (value) => {
      action.transition = value;
      rerender();
    }));
  }
  if (action.type === "transitionState") {
    target.appendChild(flowSelect("Target State", action.targetState || "intro", gameFlow.states.map((item) => ({ id: item.id, name: item.name })), (value) => {
      action.targetState = value;
      rerender();
    }));
    target.appendChild(flowSelect("Trigger", action.trigger || "", [
      { id: "", name: "Immediate / Manual" },
      { id: "onCountdownComplete", name: "On Countdown Complete" }
    ], (value) => {
      action.trigger = value;
      rerender();
    }));
    target.appendChild(flowSelect(action.trigger === "onCountdownComplete" ? "On Countdown Complete Exit" : "Event Exit", action.nextTargetActionId || "", flowActionTargetOptions(state, action.nextTargetActionId || ""), (value) => {
      action.nextTargetActionId = value;
      rerender();
    }));
  }
  if (action.type === "startCraftingTimer") {
    target.appendChild(readOnlyFlowNote("The timer starts and this action advances normally. Timer Ends and Answers Submitted exits are defined on the input action that follows."));
  }
  if (!actionRef.isSubAction && action.type !== "decision" && action.type !== "transitionState" && action.type !== "multipleChoiceInput" && action.type !== "triviaInput" && action.type !== "textSubmissionInput") {
    target.appendChild(flowSelect("Next Action", action.nextTargetActionId || "", flowActionTargetOptions(state, action.nextTargetActionId || ""), (value) => {
      action.nextTargetActionId = value;
      rerender();
    }));
  }
  const isInputAction = actionTypeMeta(action.type).category === "input" && !actionRef.isSubAction;
  const timingOptions = actionRef.isSubAction
    ? [{ id: "S+", name: "S+ Timing" }]
    : isInputAction
      ? [{ id: "E+", name: "E+ Timing" }]
      : [{ id: "E+", name: "E+ Timing" }, { id: "S+", name: "S+ Timing" }];
  if (isInputAction) target.appendChild(readOnlyFlowNote("Input actions always use E+ timing because they wait for player or stage input."));
  if (actionRef.isSubAction) target.appendChild(readOnlyFlowNote("Sub-actions use S+ timing as an offset from the primary action start."));
  const timing = ensureActionTiming(action, actionRef.isSubAction);
  target.appendChild(flowSelect("Timing Mode", timing.mode, timingOptions, (value) => {
    ensureActionTiming(action, actionRef.isSubAction).mode = value === "S+" && !isInputAction ? "S+" : "E+";
    rerender();
  }));
  target.appendChild(flowNumber("Timing Seconds", timing.seconds, (value) => {
    ensureActionTiming(action, actionRef.isSubAction).seconds = value;
    rerender();
  }));
  if (includeSubActionButton) {
    target.appendChild(flowActionButton("Add Sub-Action", () => addFlowSubAction(actionRef)));
  }
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

function pushFlowHistory() {
  const snapshot = flowHistorySnapshot();
  if (flowUndoStack[flowUndoStack.length - 1] === snapshot) return;
  flowUndoStack.push(snapshot);
  if (flowUndoStack.length > 30) flowUndoStack.shift();
  flowRedoStack = [];
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
  if (!flowUndoStack.length) return;
  flowRedoStack.push(flowHistorySnapshot());
  restoreFlowHistory(flowUndoStack.pop());
}

function redoFlowChange() {
  if (!flowRedoStack.length) return;
  flowUndoStack.push(flowHistorySnapshot());
  if (flowUndoStack.length > 30) flowUndoStack.shift();
  restoreFlowHistory(flowRedoStack.pop());
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

function loadFlowColumnWidth() {
  const storedWidth = Number(getLocalValue("partyTemplate.flowListWidth") || 0);
  if (Number.isFinite(storedWidth) && storedWidth > 0) {
    flowShell.style.setProperty("--flow-list-width", `${storedWidth}px`);
  }
}

function setupFlowResizer() {
  if (!flowShell || !flowResizer) return;
  loadFlowColumnWidth();
  flowResizer.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    flowResizer.setPointerCapture(event.pointerId);
    document.body.classList.add("is-resizing-flow");
    const shellRect = flowShell.getBoundingClientRect();
    const move = (moveEvent) => {
      const shellWidth = shellRect.width;
      const nextWidth = Math.max(320, Math.min(shellWidth - 420, moveEvent.clientX - shellRect.left));
      flowShell.style.setProperty("--flow-list-width", `${nextWidth}px`);
      setLocalValue("partyTemplate.flowListWidth", String(Math.round(nextWidth)));
    };
    const stop = () => {
      document.body.classList.remove("is-resizing-flow");
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop, { once: true });
    window.addEventListener("pointercancel", stop, { once: true });
  });
}

function renderFlowList() {
  const scrollTop = flowList.scrollTop;
  flowList.replaceChildren();
  for (const state of gameFlow.states) {
    const stateEl = document.createElement("section");
    stateEl.className = "flow-state";
    stateEl.draggable = true;
    stateEl.dataset.stateId = state.id;
    bindStateDrag(stateEl, state.id);
    const stateButton = document.createElement("button");
    stateButton.type = "button";
    stateButton.className = "flow-state-header";
    stateButton.classList.add("has-disclosure");
    stateButton.classList.toggle("is-selected", selectedFlowStateId === state.id && !selectedFlowActionId);
    stateButton.innerHTML = `
      <span class="disclosure-slot"></span>
      <span class="flow-row-copy"><strong></strong><span class="flow-row-summary"></span></span>
      <span class="flow-pill">${state.actions.length} actions</span>
    `;
    stateButton.querySelector(".disclosure-slot").appendChild(createDisclosureButton(state.id, collapsedFlowStates, () => {
      persistFlowCollapseState();
      renderFlowList();
    }));
    stateButton.querySelector("strong").textContent = state.name;
    stateButton.querySelector(".flow-row-summary").textContent = state.id;
    stateButton.addEventListener("click", (event) => {
      if (event.metaKey || event.ctrlKey) {
        selectFlowMoment(state.id, { additive: true });
      } else {
        selectedFlowStateId = state.id;
        clearFlowActionSelection();
      }
      if (flowViewMode === "node") flowNodeDepth = "actions";
      renderFlowTool();
    });
    stateEl.appendChild(stateButton);

    const actionsEl = document.createElement("div");
    actionsEl.className = "flow-state-actions";
    if (!collapsedFlowStates.has(state.id)) {
      for (const action of state.actions) {
        actionsEl.appendChild(flowActionRow(state, action, false));
        if (!collapsedFlowActions.has(action.id)) {
          for (const subAction of action.subActions || []) {
            actionsEl.appendChild(flowActionRow(state, subAction, true));
          }
        }
      }
    }
    stateEl.appendChild(actionsEl);
    flowList.appendChild(stateEl);
  }
  flowList.scrollTop = scrollTop;
}

function flowActionRow(state, action, isSubAction) {
  const actionButton = document.createElement("button");
  actionButton.type = "button";
  actionButton.className = "flow-action-row";
  actionButton.classList.toggle("flow-sub-action-row", isSubAction);
  actionButton.classList.toggle("has-disclosure", !isSubAction && Boolean(action.subActions?.length));
  actionButton.draggable = true;
  actionButton.dataset.stateId = state.id;
  actionButton.dataset.actionId = action.id;
  actionButton.classList.toggle("is-selected", flowActionIsSelected(action.id));
  actionButton.innerHTML = !isSubAction && action.subActions?.length ? `
    <span class="disclosure-slot"></span>
    <span class="flow-row-copy"><strong></strong><span class="flow-row-summary"></span></span>
    <span class="flow-pill"></span>
  ` : `
    <span class="flow-row-copy"><strong></strong><span class="flow-row-summary"></span></span>
    <span class="flow-pill"></span>
  `;
  const disclosureSlot = actionButton.querySelector(".disclosure-slot");
  if (disclosureSlot) {
    disclosureSlot.appendChild(createDisclosureButton(action.id, collapsedFlowActions, () => {
      persistFlowCollapseState();
      renderFlowList();
    }));
  }
  actionButton.querySelector("strong").textContent = isSubAction ? `Sub: ${action.name}` : action.name;
  actionButton.querySelector(".flow-row-summary").textContent = actionSummary(action, isSubAction);
  actionButton.querySelector(".flow-pill").textContent = `${actionCategoryName(action)} / ${actionTypeName(action.type)}`;
  actionButton.addEventListener("click", (event) => {
    selectedFlowStateId = state.id;
    selectFlowAction(action.id, { additive: event.metaKey || event.ctrlKey || event.shiftKey });
    if (flowViewMode === "node") flowNodeDepth = "actions";
    renderFlowTool();
  });
  if (isSubAction) {
    const parentAction = flowActionRef(state.id, action.id)?.parentAction;
    if (parentAction) bindSubActionDrag(actionButton, state.id, parentAction.id, action.id);
  } else {
    bindActionDrag(actionButton, state.id, action.id);
  }
  return actionButton;
}

function bindStateDrag(element, stateId) {
  element.addEventListener("dragstart", (event) => {
    element.classList.add("is-dragging");
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("application/x-flow-state", stateId);
  });
  element.addEventListener("dragend", () => {
    element.classList.remove("is-dragging");
  });
  element.addEventListener("dragover", (event) => {
    if (!event.dataTransfer.types.includes("application/x-flow-state")) return;
    event.preventDefault();
    element.classList.add("is-drop-target");
  });
  element.addEventListener("dragleave", () => {
    element.classList.remove("is-drop-target");
  });
  element.addEventListener("drop", (event) => {
    const draggedStateId = event.dataTransfer.getData("application/x-flow-state");
    if (!draggedStateId) return;
    event.preventDefault();
    element.classList.remove("is-drop-target");
    moveFlowState(draggedStateId, stateId, isAfterDrop(element, event));
  });
}

function bindActionDrag(element, stateId, actionId) {
  element.addEventListener("dragstart", (event) => {
    event.stopPropagation();
    element.classList.add("is-dragging");
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("application/x-flow-action", JSON.stringify({ stateId, actionId }));
  });
  element.addEventListener("dragend", () => {
    element.classList.remove("is-dragging");
  });
  element.addEventListener("dragover", (event) => {
    if (!event.dataTransfer.types.includes("application/x-flow-action")) return;
    event.preventDefault();
    event.stopPropagation();
    element.classList.add("is-drop-target");
  });
  element.addEventListener("dragleave", () => {
    element.classList.remove("is-drop-target");
  });
  element.addEventListener("drop", (event) => {
    const raw = event.dataTransfer.getData("application/x-flow-action");
    if (!raw) return;
    event.preventDefault();
    event.stopPropagation();
    element.classList.remove("is-drop-target");
    const dragged = JSON.parse(raw);
    if (dragged.stateId !== stateId) return;
    moveFlowAction(stateId, dragged.actionId, actionId, isAfterDrop(element, event));
  });
}

function bindSubActionDrag(element, stateId, parentActionId, actionId) {
  element.addEventListener("dragstart", (event) => {
    event.stopPropagation();
    element.classList.add("is-dragging");
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("application/x-flow-sub-action", JSON.stringify({ stateId, parentActionId, actionId }));
  });
  element.addEventListener("dragend", () => {
    element.classList.remove("is-dragging");
  });
  element.addEventListener("dragover", (event) => {
    if (!event.dataTransfer.types.includes("application/x-flow-sub-action")) return;
    event.preventDefault();
    event.stopPropagation();
    element.classList.add("is-drop-target");
  });
  element.addEventListener("dragleave", () => {
    element.classList.remove("is-drop-target");
  });
  element.addEventListener("drop", (event) => {
    const raw = event.dataTransfer.getData("application/x-flow-sub-action");
    if (!raw) return;
    event.preventDefault();
    event.stopPropagation();
    element.classList.remove("is-drop-target");
    const dragged = JSON.parse(raw);
    if (dragged.stateId !== stateId || dragged.parentActionId !== parentActionId) return;
    moveFlowSubAction(stateId, parentActionId, dragged.actionId, actionId, isAfterDrop(element, event));
  });
}

function isAfterDrop(element, event) {
  const rect = element.getBoundingClientRect();
  return event.clientY > rect.top + rect.height / 2;
}

function moveFlowState(draggedStateId, targetStateId, placeAfter = false) {
  if (draggedStateId === targetStateId) return;
  const fromIndex = gameFlow.states.findIndex((state) => state.id === draggedStateId);
  const toIndex = gameFlow.states.findIndex((state) => state.id === targetStateId);
  if (fromIndex < 0 || toIndex < 0) return;
  pushFlowHistory();
  const [state] = gameFlow.states.splice(fromIndex, 1);
  const targetIndexAfterRemoval = gameFlow.states.findIndex((item) => item.id === targetStateId);
  const adjustedIndex = targetIndexAfterRemoval + (placeAfter ? 1 : 0);
  gameFlow.states.splice(adjustedIndex, 0, state);
  selectedFlowStateId = draggedStateId;
  clearFlowActionSelection();
  renderFlowTool();
}

function moveFlowAction(stateId, draggedActionId, targetActionId, placeAfter = false) {
  const state = flowState(stateId);
  if (!state || draggedActionId === targetActionId) return;
  const fromIndex = state.actions.findIndex((action) => action.id === draggedActionId);
  const toIndex = state.actions.findIndex((action) => action.id === targetActionId);
  if (fromIndex < 0 || toIndex < 0) return;
  pushFlowHistory();
  const [action] = state.actions.splice(fromIndex, 1);
  const targetIndexAfterRemoval = state.actions.findIndex((item) => item.id === targetActionId);
  const adjustedIndex = targetIndexAfterRemoval + (placeAfter ? 1 : 0);
  state.actions.splice(adjustedIndex, 0, action);
  selectedFlowStateId = stateId;
  setFlowActionSelection([draggedActionId]);
  renderFlowTool();
}

function moveFlowSubAction(stateId, parentActionId, draggedActionId, targetActionId, placeAfter = false) {
  const parentAction = flowAction(stateId, parentActionId);
  const subActions = parentAction?.subActions || [];
  if (draggedActionId === targetActionId) return;
  const fromIndex = subActions.findIndex((action) => action.id === draggedActionId);
  const toIndex = subActions.findIndex((action) => action.id === targetActionId);
  if (fromIndex < 0 || toIndex < 0) return;
  pushFlowHistory();
  const [action] = subActions.splice(fromIndex, 1);
  const targetIndexAfterRemoval = subActions.findIndex((item) => item.id === targetActionId);
  const adjustedIndex = targetIndexAfterRemoval + (placeAfter ? 1 : 0);
  subActions.splice(adjustedIndex, 0, action);
  selectedFlowStateId = stateId;
  setFlowActionSelection([draggedActionId]);
  renderFlowTool();
}

function renderFlowEditor() {
  const state = flowState(selectedFlowStateId);
  const actionRef = state ? flowActionRef(selectedFlowStateId, selectedFlowActionId) : null;
  const action = actionRef?.action || null;
  flowEditor.replaceChildren();
  addActionButton.disabled = !state;
  deleteFlowItemButton.disabled = !state;

  if (!state) {
    flowEditorTitle.textContent = "No State Selected";
    flowEditorHelp.textContent = "Add a game state to start sequencing actions.";
    return;
  }

  if (!action) {
    flowEditorTitle.textContent = state.name;
    flowEditorHelp.textContent = "Editing game state.";
    flowEditor.appendChild(flowField("State Name", state.name, (value) => {
      state.name = value || state.name;
      state.id = state.id === "lobby" || state.id === "intro" ? state.id : makeFlowId(state.name, state.id);
      selectedFlowStateId = state.id;
      renderFlowTool();
    }));
    flowEditor.appendChild(flowSelect("Next Moment", state.nextStateTargetId || "", flowStateTargetOptions(state.nextStateTargetId || "", state.id), (value) => {
      state.nextStateTargetId = value;
      renderFlowListAndPublish();
    }));
    flowEditor.appendChild(flowSelect("Entry Action", state.entryTargetActionId || "", flowActionTargetOptions(state, state.entryTargetActionId || ""), (value) => {
      state.entryTargetActionId = value;
      renderFlowListAndPublish();
    }));
    flowEditor.appendChild(readOnlyFlowNote("Primary actions run from top to bottom. Input actions wait for input; standard actions can use S+ or E+ timing."));
    return;
  }

  flowEditorTitle.textContent = action.name;
  flowEditorHelp.textContent = actionRef.isSubAction ? `Editing sub-action under ${actionRef.parentAction.name}.` : `Editing primary action in ${state.name}.`;
  const timing = ensureActionTiming(action, actionRef.isSubAction);
  flowEditor.appendChild(flowActionNameField(state, action, (value) => {
    action.name = value || action.name;
    renderFlowTool();
  }, () => renderFlowTool()));
  flowEditor.appendChild(flowActionTypeSearch("Action Type", action.type, flowActionTypes, (value) => {
    applyFlowActionTypeDefaults(action, value, actionRef.isSubAction);
    refreshActionNameFromType(state, action);
    renderFlowTool();
  }));
  if (action.type === "presentText" || action.type === "displayText" || action.type === "text") {
    const textTargetOptions = textTargetOptionsForFlowState(state.id, action.textTarget || "presentation");
    flowEditor.appendChild(flowSelect("Text Field", normalizeTextTargetId(action.textTarget || textTargetOptions[0]?.id || "presentation"), textTargetOptions, (value) => {
      action.textTarget = value;
      renderFlowListAndPublish();
    }));
    flowEditor.appendChild(flowTextarea("Text", action.text || "", (value) => {
      action.text = value;
      renderFlowListAndPublish();
    }));
    flowEditor.appendChild(flowSelect("Text Visible", action.isShown === false ? "false" : "true", [
      { id: "true", name: "True" },
      { id: "false", name: "False" }
    ], (value) => {
      action.isShown = value !== "false";
      renderFlowListAndPublish();
    }));
    flowEditor.appendChild(flowSelect("Instant", action.instant === true ? "true" : "false", [
      { id: "false", name: "False" },
      { id: "true", name: "True" }
    ], (value) => {
      action.instant = value === "true";
      renderFlowListAndPublish();
    }));
  }
  if (action.type === "multipleChoiceInput") {
    flowEditor.appendChild(flowSelect("Button Style", action.inputMode || "singleSelect", [
      { id: "singleSelect", name: "Multi-Select Single" },
      { id: "submitOnce", name: "Single Input Done State" },
      { id: "continuous", name: "Continuous Input" }
    ], (value) => {
      action.inputMode = value;
      renderFlowListAndPublish();
      renderFlowEditor();
    }));
    if ((action.inputMode || "singleSelect") === "singleSelect") {
      flowEditor.appendChild(flowSelect("Locked", action.locked === true ? "true" : "false", [
        { id: "false", name: "False" },
        { id: "true", name: "True" }
      ], (value) => {
        action.locked = value === "true";
        renderFlowListAndPublish();
      }));
    }
    flowEditor.appendChild(flowTextarea("Prompt Text", action.prompt || "Answer this question by tapping an answer", (value) => {
      action.prompt = value || "Answer this question by tapping an answer";
      renderFlowListAndPublish();
    }));
    flowEditor.appendChild(flowTextarea("Answer Bubble Text Options", (action.options || ["A", "B", "C", "D"]).join("\n"), (value) => {
      const options = value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean).slice(0, 12);
      action.options = options.length ? options : ["A", "B", "C", "D"];
      renderFlowListAndPublish();
    }));
    const targetOptions = flowActionTargetOptions(state, action.timerEndTargetActionId || action.answersSubmittedTargetActionId || "");
    flowEditor.appendChild(flowSelect("On Timer Ends", action.timerEndTargetActionId || "", targetOptions, (value) => {
      action.timerEndTargetActionId = value;
      renderFlowListAndPublish();
    }));
    flowEditor.appendChild(flowSelect("On Answers Submitted", action.answersSubmittedTargetActionId || "", targetOptions, (value) => {
      action.answersSubmittedTargetActionId = value;
      renderFlowListAndPublish();
    }));
    flowEditor.appendChild(readOnlyFlowNote("Each line becomes one button label. Controllers send the option index; this action currently shows the matching line as the stage speech bubble. Choose None for On Answers Submitted when continuous input should wait for the timer."));
  }
  if (action.type === "getRandomMultipleChoiceContent") {
    flowEditor.appendChild(flowField("Store In Variable", action.variableName || "multipleChoicePrompt", (value) => {
      action.variableName = (value || "multipleChoicePrompt").trim() || "multipleChoicePrompt";
      renderFlowListAndPublish();
    }));
    flowEditor.appendChild(readOnlyFlowNote("Gets a random prompt from the server prompt pool and stores it in this flow variable for later actions."));
  }
  if (action.type === "triviaInput") {
    flowEditor.appendChild(flowField("Multiple Choice Content Variable", action.contentVariable || "multipleChoicePrompt", (value) => {
      action.contentVariable = (value || "multipleChoicePrompt").trim() || "multipleChoicePrompt";
      renderFlowListAndPublish();
    }));
    flowEditor.appendChild(flowSelect("Button Style", action.inputMode || "submitOnce", [
      { id: "singleSelect", name: "Multi-Select Single" },
      { id: "submitOnce", name: "Single Input Done State" },
      { id: "continuous", name: "Continuous Input" }
    ], (value) => {
      action.inputMode = value;
      renderFlowListAndPublish();
      renderFlowEditor();
    }));
    if ((action.inputMode || "submitOnce") === "singleSelect") {
      flowEditor.appendChild(flowSelect("Locked", action.locked === true ? "true" : "false", [
        { id: "false", name: "False" },
        { id: "true", name: "True" }
      ], (value) => {
        action.locked = value === "true";
        renderFlowListAndPublish();
      }));
    }
    flowEditor.appendChild(flowSelect("Randomize Options", action.randomizeOptions === true ? "true" : "false", [
      { id: "false", name: "False" },
      { id: "true", name: "True" }
    ], (value) => {
      action.randomizeOptions = value === "true";
      renderFlowListAndPublish();
    }));
    const targetOptions = flowActionTargetOptions(state, action.timerEndTargetActionId || action.answersSubmittedTargetActionId || "");
    flowEditor.appendChild(flowSelect("On Timer Ends", action.timerEndTargetActionId || "", targetOptions, (value) => {
      action.timerEndTargetActionId = value;
      renderFlowListAndPublish();
    }));
    flowEditor.appendChild(flowSelect("On Answers Submitted", action.answersSubmittedTargetActionId || "", targetOptions, (value) => {
      action.answersSubmittedTargetActionId = value;
      renderFlowListAndPublish();
    }));
  }
  if (action.type === "textSubmissionInput") {
    flowEditor.appendChild(flowTextarea("Prompt Text", action.prompt || "Write your answer", (value) => {
      action.prompt = value || "Write your answer";
      renderFlowListAndPublish();
    }));
    flowEditor.appendChild(flowField("Placeholder Text", action.placeholder || "Answer here", (value) => {
      action.placeholder = value || "Answer here";
      renderFlowListAndPublish();
    }));
    flowEditor.appendChild(flowNumber("Character Limit (0 = No Limit)", Number(action.characterLimit || 0), (value) => {
      action.characterLimit = Math.max(0, Math.floor(Number(value) || 0));
      renderFlowListAndPublish();
    }));
    const targetOptions = flowActionTargetOptions(state, action.timerEndTargetActionId || action.answersSubmittedTargetActionId || "");
    flowEditor.appendChild(flowSelect("On Timer Ends", action.timerEndTargetActionId || "", targetOptions, (value) => {
      action.timerEndTargetActionId = value;
      renderFlowListAndPublish();
    }));
    flowEditor.appendChild(flowSelect("On Answers Submitted", action.answersSubmittedTargetActionId || "", targetOptions, (value) => {
      action.answersSubmittedTargetActionId = value;
      renderFlowListAndPublish();
    }));
    flowEditor.appendChild(readOnlyFlowNote("The stage validates text submissions. Current test rule: submissions must be non-empty and contain no numbers. Timer and answer exits belong to this input action."));
  }
  if (action.type === "prepareVotingCards") {
    flowEditor.appendChild(readOnlyFlowNote("Builds shuffled anonymous voting cards from the latest stored text answers. The card keeps the author internally, but players only see the answer text."));
  }
  if (action.type === "setVotingCardsShown") {
    flowEditor.appendChild(flowSelect("Voting Cards Visible", action.isShown === false ? "false" : "true", [
      { id: "true", name: "True" },
      { id: "false", name: "False" }
    ], (value) => {
      action.isShown = value !== "false";
      renderFlowListAndPublish();
    }));
    flowEditor.appendChild(flowSelect("Cards", action.cardFilter || "all", [
      { id: "all", name: "All Cards" },
      { id: "winners", name: "Winning Cards" },
      { id: "losers", name: "Losing Cards" }
    ], (value) => {
      action.cardFilter = value;
      renderFlowListAndPublish();
    }));
    flowEditor.appendChild(flowSelect("Instant", action.instant === true ? "true" : "false", [
      { id: "false", name: "False" },
      { id: "true", name: "True" }
    ], (value) => {
      action.instant = value === "true";
      renderFlowListAndPublish();
    }));
  }
  if (action.type === "voteOnAnswersInput") {
    flowEditor.appendChild(flowTextarea("Prompt Text", action.prompt || "Vote for your favorite answer", (value) => {
      action.prompt = value || "Vote for your favorite answer";
      renderFlowListAndPublish();
    }));
    const targetOptions = flowActionTargetOptions(state, action.timerEndTargetActionId || action.answersSubmittedTargetActionId || "");
    flowEditor.appendChild(flowSelect("On Timer Ends", action.timerEndTargetActionId || "", targetOptions, (value) => {
      action.timerEndTargetActionId = value;
      renderFlowListAndPublish();
    }));
    flowEditor.appendChild(flowSelect("On Votes Submitted", action.answersSubmittedTargetActionId || "", targetOptions, (value) => {
      action.answersSubmittedTargetActionId = value;
      renderFlowListAndPublish();
    }));
    flowEditor.appendChild(readOnlyFlowNote("Players vote for one anonymous answer card. The controller hides the player's own answer, and the stage stores votes secretly until results are revealed."));
  }
  if (action.type === "revealVotingResults") {
    flowEditor.appendChild(readOnlyFlowNote("Counts stored votes, marks winning voting cards, and reveals which players voted for each answer."));
  }
  if (action.type === "doNothing") {
    flowEditor.appendChild(readOnlyFlowNote("This action intentionally has no effect. Use its timing to create a pause or delayed branch."));
  }
  if (action.type === "playAudio") {
    flowEditor.appendChild(flowField("Audio URL", action.audioUrl || "", (value) => {
      action.audioUrl = value;
      renderFlowListAndPublish();
    }));
    flowEditor.appendChild(readOnlyFlowNote("Callback fires when the audio ends. Leave blank to complete immediately, or use S+ timing for fire-and-forget sound effects."));
  }
  if (action.type === "setPlayersShown") {
    flowEditor.appendChild(flowSelect("Players Visible", action.isShown === false ? "false" : "true", [
      { id: "true", name: "True" },
      { id: "false", name: "False" }
    ], (value) => {
      action.isShown = value !== "false";
      renderFlowListAndPublish();
    }));
    flowEditor.appendChild(flowSelect("Instant", action.instant === true ? "true" : "false", [
      { id: "false", name: "False" },
      { id: "true", name: "True" }
    ], (value) => {
      action.instant = value === "true";
      renderFlowListAndPublish();
    }));
  }
  if (action.type === "setPlayerAnswersShown") {
    flowEditor.appendChild(flowSelect("Player Answers Visible", action.isShown === false ? "false" : "true", [
      { id: "true", name: "True" },
      { id: "false", name: "False" }
    ], (value) => {
      action.isShown = value !== "false";
      renderFlowListAndPublish();
    }));
    flowEditor.appendChild(flowSelect("Instant", action.instant === true ? "true" : "false", [
      { id: "false", name: "False" },
      { id: "true", name: "True" }
    ], (value) => {
      action.instant = value === "true";
      renderFlowListAndPublish();
    }));
    flowEditor.appendChild(flowSelect("Players", action.playerFilter || "all", [
      { id: "all", name: "All Players" },
      { id: "correct", name: "Correct Players" },
      { id: "wrong", name: "Wrong Players" },
      { id: "votingWinner", name: "Voting Winner Authors" },
      { id: "votingLosers", name: "Voting Losing Authors" }
    ], (value) => {
      action.playerFilter = value;
      renderFlowListAndPublish();
    }));
  }
  if (action.type === "revealPlayerAnswerCorrectness") {
    flowEditor.appendChild(readOnlyFlowNote("Compares stored player trivia answers to the current prompt and marks answer bubbles green or red."));
  }
  if (action.type === "showPoints") {
    flowEditor.appendChild(flowSelect("Players", action.playerFilter || "correct", [
      { id: "all", name: "All Players" },
      { id: "correct", name: "Correct Players" },
      { id: "wrong", name: "Wrong Players" },
      { id: "votingWinner", name: "Voting Winner Authors" },
      { id: "votingLosers", name: "Voting Losing Authors" }
    ], (value) => {
      action.playerFilter = value;
      renderFlowListAndPublish();
    }));
    flowEditor.appendChild(flowNumber("Points (0 = Correct Answer Constant)", Number(action.points || 0), (value) => {
      action.points = Math.max(0, Math.floor(Number(value) || 0));
      renderFlowListAndPublish();
    }));
    flowEditor.appendChild(readOnlyFlowNote("Adds pending points immediately, then shows a temporary points popup above each targeted player's answer bubble."));
  }
  if (action.type === "givePendingPoints") {
    flowEditor.appendChild(readOnlyFlowNote("Transfers every player's pending points into their score, then resets pending points to 0. No visual popup is shown."));
  }
  if (action.type === "setTimerShown") {
    flowEditor.appendChild(flowSelect("Timer Visible", action.isShown === false ? "false" : "true", [
      { id: "true", name: "True" },
      { id: "false", name: "False" }
    ], (value) => {
      action.isShown = value !== "false";
      renderFlowListAndPublish();
    }));
    flowEditor.appendChild(flowSelect("Instant", action.instant === true ? "true" : "false", [
      { id: "false", name: "False" },
      { id: "true", name: "True" }
    ], (value) => {
      action.instant = value === "true";
      renderFlowListAndPublish();
    }));
    flowEditor.appendChild(readOnlyFlowNote("Showing the timer resets it to the Crafting Timer Duration game constant. Hiding pauses it and keeps the current remaining value."));
  }
  if (action.type === "startCraftingTimer") {
    flowEditor.appendChild(readOnlyFlowNote("The timer starts and this action advances normally. Timer Ends and Answers Submitted exits are defined on the input action that follows."));
  }
  if (action.type === "decision") {
    appendDecisionControls(flowEditor, state, action, (redraw = true) => {
      renderFlowListAndPublish();
      if (redraw) renderFlowEditor();
    });
    flowEditor.appendChild(readOnlyFlowNote("Decision actions are invisible branch points. Runtime evaluates them immediately and jumps to the selected target action."));
  }
  if (action.type === "transition") {
    flowEditor.appendChild(flowSelect("Transition", action.transition || "horizontalWipe", flowTransitions, (value) => {
      action.transition = value;
      renderFlowListAndPublish();
    }));
  }
  if (action.type === "transitionState") {
    flowEditor.appendChild(flowSelect("Target State", action.targetState || "intro", gameFlow.states.map((item) => ({ id: item.id, name: item.name })), (value) => {
      action.targetState = value;
      renderFlowListAndPublish();
    }));
    flowEditor.appendChild(flowSelect("Trigger", action.trigger || "", [
      { id: "", name: "Immediate / Manual" },
      { id: "onCountdownComplete", name: "On Countdown Complete" }
    ], (value) => {
      action.trigger = value;
      renderFlowListAndPublish();
    }));
    flowEditor.appendChild(flowSelect(action.trigger === "onCountdownComplete" ? "On Countdown Complete Exit" : "Event Exit", action.nextTargetActionId || "", flowActionTargetOptions(state, action.nextTargetActionId || ""), (value) => {
      action.nextTargetActionId = value;
      renderFlowListAndPublish();
    }));
  }
  if (!actionRef.isSubAction && action.type !== "decision" && action.type !== "transitionState" && action.type !== "multipleChoiceInput" && action.type !== "triviaInput" && action.type !== "textSubmissionInput") {
    flowEditor.appendChild(flowSelect("Next Action", action.nextTargetActionId || "", flowActionTargetOptions(state, action.nextTargetActionId || ""), (value) => {
      action.nextTargetActionId = value;
      renderFlowListAndPublish();
    }));
  }
  const isInputAction = actionTypeMeta(action.type).category === "input" && !actionRef.isSubAction;
  const timingOptions = actionRef.isSubAction
    ? [{ id: "S+", name: "S+ Timing" }]
    : isInputAction
      ? [{ id: "E+", name: "E+ Timing" }]
      : [{ id: "E+", name: "E+ Timing" }, { id: "S+", name: "S+ Timing" }];
  if (isInputAction) {
    flowEditor.appendChild(readOnlyFlowNote("Input actions always use E+ timing because they wait for player or stage input."));
  }
  if (actionRef.isSubAction) {
    flowEditor.appendChild(readOnlyFlowNote("Sub-actions use S+ timing as an offset from the primary action start."));
  }
  flowEditor.appendChild(flowSelect("Timing Mode", timing.mode, timingOptions, (value) => {
    ensureActionTiming(action, actionRef.isSubAction).mode = value === "S+" && !isInputAction ? "S+" : "E+";
    renderFlowListAndPublish();
  }));
  flowEditor.appendChild(flowNumber("Timing Seconds", timing.seconds, (value) => {
    ensureActionTiming(action, actionRef.isSubAction).seconds = value;
    renderFlowListAndPublish();
  }));
  flowEditor.appendChild(flowActionButton("Add Sub-Action", () => addFlowSubAction(actionRef)));
}

function flowField(label, value, onChange) {
  const field = document.createElement("label");
  field.className = "field-label flow-form-grid";
  field.textContent = label;
  const input = document.createElement("input");
  input.className = "text-input";
  input.value = value || "";
  input.addEventListener("change", () => {
    pushFlowHistory();
    onChange(input.value.trim());
  });
  field.appendChild(input);
  return field;
}

function flowActionNameField(state, action, onChange, onRefresh) {
  const field = document.createElement("label");
  field.className = "field-label flow-form-grid action-name-field";
  const labelText = document.createElement("span");
  labelText.textContent = "Action Name";
  const input = document.createElement("input");
  input.className = "text-input";
  input.value = action?.name || "";
  input.addEventListener("change", () => {
    pushFlowHistory();
    onChange(input.value.trim());
  });
  const refreshButton = document.createElement("button");
  refreshButton.type = "button";
  refreshButton.className = "secondary-button action-name-refresh";
  refreshButton.textContent = "↻";
  refreshButton.title = "Rename to action type";
  refreshButton.setAttribute("aria-label", "Rename action to action type");
  refreshButton.addEventListener("click", (event) => {
    event.preventDefault();
    pushFlowHistory();
    refreshActionNameFromType(state, action);
    onRefresh?.();
  });
  field.append(labelText, input, refreshButton);
  return field;
}

function flowTextarea(label, value, onChange) {
  const field = document.createElement("label");
  field.className = "field-label flow-form-grid";
  field.textContent = label;
  const input = document.createElement("textarea");
  input.className = "text-input flow-textarea";
  input.value = value || "";
  let historyCaptured = false;
  input.addEventListener("focus", () => {
    historyCaptured = false;
  });
  input.addEventListener("input", () => {
    if (!historyCaptured) {
      pushFlowHistory();
      historyCaptured = true;
    }
    onChange(input.value);
  });
  field.appendChild(input);
  return field;
}

function flowSelect(label, value, options, onChange) {
  const field = document.createElement("label");
  field.className = "field-label flow-form-grid";
  field.textContent = label;
  const select = document.createElement("select");
  select.className = "text-input";
  for (const option of options) {
    const optionEl = document.createElement("option");
    optionEl.value = option.id;
    optionEl.textContent = option.name;
    select.appendChild(optionEl);
  }
  select.value = value;
  select.addEventListener("change", () => {
    pushFlowHistory();
    onChange(select.value);
  });
  field.appendChild(select);
  return field;
}

function flowVariableSearch(label, value, options, onChange) {
  const field = document.createElement("label");
  field.className = "field-label flow-form-grid flow-search-field";
  field.textContent = label;
  const input = document.createElement("input");
  input.className = "text-input";
  input.autocomplete = "off";
  input.spellcheck = false;
  const menu = document.createElement("div");
  menu.className = "flow-search-options hidden";

  const current = options.find((option) => option.id === value) || { id: value, name: value };
  input.value = current?.name || "";

  const hideMenu = () => window.setTimeout(() => menu.classList.add("hidden"), 120);
  const chooseOption = (option) => {
    input.value = option.name;
    menu.classList.add("hidden");
    if (option.id !== value) {
      pushFlowHistory();
      onChange(option.id);
    }
  };
  const renderOptions = () => {
    const query = input.value.trim().toLowerCase();
    const matches = fuzzyDecisionVariableMatches(options, query).slice(0, 8);
    menu.replaceChildren();
    if (matches.length === 0) {
      const empty = document.createElement("div");
      empty.className = "flow-search-option";
      empty.textContent = "No matching variables";
      menu.appendChild(empty);
    }
    for (const option of matches) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "flow-search-option";
      button.classList.toggle("is-active", option.id === value);
      button.innerHTML = `<strong></strong><span></span>`;
      button.querySelector("strong").textContent = option.name;
      button.querySelector("span").textContent = option.id;
      button.addEventListener("mousedown", (event) => event.preventDefault());
      button.addEventListener("click", () => chooseOption(option));
      menu.appendChild(button);
    }
    menu.classList.remove("hidden");
  };

  input.addEventListener("focus", renderOptions);
  input.addEventListener("input", renderOptions);
  input.addEventListener("blur", hideMenu);
  input.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      menu.classList.add("hidden");
      input.value = current?.name || "";
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const first = fuzzyDecisionVariableMatches(options, input.value.trim().toLowerCase())[0];
      if (first) chooseOption(first);
    }
  });

  field.appendChild(input);
  field.appendChild(menu);
  return field;
}

function flowActionTypeSearch(label, value, options, onChange) {
  const field = document.createElement("label");
  field.className = "field-label flow-form-grid flow-search-field";
  field.textContent = label;
  const input = document.createElement("input");
  input.className = "text-input";
  input.autocomplete = "off";
  input.spellcheck = false;
  const menu = document.createElement("div");
  menu.className = "flow-search-options hidden";

  const current = options.find((option) => option.id === value) || options[0];
  input.value = current?.name || "";

  const hideMenu = () => window.setTimeout(() => menu.classList.add("hidden"), 120);
  const chooseOption = (option) => {
    input.value = option.name;
    menu.classList.add("hidden");
    if (option.id !== value) {
      pushFlowHistory();
      onChange(option.id);
    }
  };
  const renderOptions = () => {
    const query = input.value.trim().toLowerCase();
    const matches = fuzzyActionTypeMatches(options, query).slice(0, 8);
    menu.replaceChildren();
    if (matches.length === 0) {
      const empty = document.createElement("div");
      empty.className = "flow-search-option";
      empty.textContent = "No matching actions";
      menu.appendChild(empty);
    }
    for (const option of matches) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "flow-search-option";
      button.classList.toggle("is-active", option.id === value);
      button.innerHTML = `<strong></strong><span></span>`;
      button.querySelector("strong").textContent = option.name;
      button.querySelector("span").textContent = option.category === "input" ? "Input" : "Standard";
      button.addEventListener("mousedown", (event) => event.preventDefault());
      button.addEventListener("click", () => chooseOption(option));
      menu.appendChild(button);
    }
    menu.classList.remove("hidden");
  };

  input.addEventListener("focus", renderOptions);
  input.addEventListener("input", renderOptions);
  input.addEventListener("blur", hideMenu);
  input.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      menu.classList.add("hidden");
      input.value = current?.name || "";
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const first = fuzzyActionTypeMatches(options, input.value.trim().toLowerCase())[0];
      if (first) chooseOption(first);
    }
  });

  field.appendChild(input);
  field.appendChild(menu);
  return field;
}

function fuzzyActionTypeMatches(options, query) {
  if (!query) return [...options];
  return options
    .map((option) => ({ option, score: fuzzyScore(`${option.name} ${option.id} ${option.category || ""}`, query) }))
    .filter((item) => item.score >= 0)
    .sort((a, b) => a.score - b.score || a.option.name.localeCompare(b.option.name))
    .map((item) => item.option);
}

function fuzzyDecisionVariableMatches(options, query) {
  if (!query) return [...options];
  return options
    .map((option) => ({ option, score: fuzzyScore(`${option.name} ${option.id}`, query) }))
    .filter((item) => item.score >= 0)
    .sort((a, b) => a.score - b.score || a.option.name.localeCompare(b.option.name))
    .map((item) => item.option);
}

function fuzzyScore(text, query) {
  let score = 0;
  let textIndex = 0;
  const haystack = String(text || "").toLowerCase();
  for (const character of query) {
    const foundIndex = haystack.indexOf(character, textIndex);
    if (foundIndex < 0) return -1;
    score += foundIndex - textIndex;
    textIndex = foundIndex + 1;
  }
  return score + Math.abs(haystack.length - query.length) * 0.01;
}

function flowNumber(label, value, onChange) {
  const field = document.createElement("label");
  field.className = "field-label flow-form-grid";
  field.textContent = label;
  const input = document.createElement("input");
  input.className = "text-input";
  input.type = "number";
  input.min = "0";
  input.step = "0.1";
  input.value = Number(value || 0).toFixed(1);
  input.addEventListener("change", () => {
    const nextValue = Number(input.value || 0);
    pushFlowHistory();
    onChange(Math.max(0, Number.isFinite(nextValue) ? nextValue : 0));
  });
  field.appendChild(input);
  return field;
}

function ensureActionTiming(action, isSubAction = false) {
  if (!action.timing) action.timing = { mode: "E+", seconds: 0 };
  const isInputAction = actionTypeMeta(action.type).category === "input" && !isSubAction;
  if (isSubAction) {
    action.timing.mode = "S+";
  } else {
    action.timing.mode = action.timing.mode === "S+" && !isInputAction ? "S+" : "E+";
  }
  const seconds = Number(action.timing.seconds || 0);
  action.timing.seconds = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
  return action.timing;
}

function flowActionButton(label, onClick) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "secondary-button";
  button.textContent = label;
  button.addEventListener("click", onClick);
  return button;
}

function readOnlyFlowNote(text) {
  const note = document.createElement("p");
  note.className = "art-shared-note";
  note.textContent = text;
  return note;
}

function addFlowState() {
  const nextNumber = gameFlow.states.length + 1;
  const state = { id: `state-${nextNumber}`, name: `New Game State ${nextNumber}`, actions: [] };
  pushFlowHistory();
  gameFlow.states.push(state);
  selectedFlowStateId = state.id;
  clearFlowActionSelection();
  renderFlowTool();
}

function addFlowAction() {
  const state = flowState(selectedFlowStateId);
  if (!state) return;
  const nextNumber = state.actions.length + 1;
  const action = createDefaultFlowAction(state.id, `Game Action ${nextNumber}`, false);
  const selectedRef = flowActionRef(selectedFlowStateId, selectedFlowActionId);
  const selectedPrimaryId = selectedRef?.parentAction?.id || selectedFlowActionId;
  const selectedIndex = state.actions.findIndex((item) => item.id === selectedPrimaryId);
  const insertIndex = selectedIndex >= 0 ? selectedIndex + 1 : state.actions.length;
  pushFlowHistory();
  state.actions.splice(insertIndex, 0, action);
  setFlowActionSelection([action.id]);
  renderFlowTool();
}

function addFlowSubAction(actionRef) {
  const state = flowState(selectedFlowStateId);
  if (!state || !actionRef?.action) return;
  const parentAction = actionRef.isSubAction ? actionRef.parentAction : actionRef.action;
  if (!parentAction) return;
  if (!Array.isArray(parentAction.subActions)) parentAction.subActions = [];
  const nextNumber = parentAction.subActions.length + 1;
  const subAction = createDefaultFlowAction(selectedFlowStateId, `Sub-Action ${nextNumber}`, true);
  const selectedIndex = actionRef.isSubAction
    ? parentAction.subActions.findIndex((item) => item.id === actionRef.action.id)
    : -1;
  const insertIndex = selectedIndex >= 0 ? selectedIndex + 1 : parentAction.subActions.length;
  pushFlowHistory();
  parentAction.subActions.splice(insertIndex, 0, subAction);
  collapsedFlowActions.delete(parentAction.id);
  setFlowActionSelection([subAction.id]);
  renderFlowTool();
}

function createDefaultFlowAction(stateId, name, isSubAction) {
  return {
    id: `${stateId}-${isSubAction ? "sub-action" : "action"}-${Date.now().toString(36)}`,
    name,
    type: isSubAction ? "setPlayersShown" : "presentText",
    timing: { mode: isSubAction ? "S+" : "E+", seconds: 0 },
    text: "Presented text",
    textTarget: "presentation",
    instant: false,
    isShown: true,
    subActions: []
  };
}

function serializeGameFlowForSave(flow) {
  return {
    states: (flow.states || []).map((state) => ({
      ...state,
      actions: (state.actions || []).map(serializeFlowActionForSave)
    }))
  };
}

function serializeFlowActionForSave(action) {
  return {
    ...action,
    subActions: (action.subActions || []).map(serializeFlowActionForSave)
  };
}

function removeLayoutState(layouts, stateId) {
  if (!layouts?.states?.length) return false;
  const beforeCount = layouts.states.length;
  layouts.states = layouts.states.filter((state) => state.id !== stateId);
  return layouts.states.length !== beforeCount;
}

function removeDeletedFlowStateFromLayouts(stateId) {
  const removedStageLayout = removeLayoutState(stageLayouts, stateId);
  const removedControllerLayout = removeLayoutState(controllerLayouts, stateId);
  if (selectedLayoutStateId === stateId) {
    selectedLayoutStateId = "global";
    setLayoutSelection(activeLayoutData().global?.elements?.[0]?.id || "");
  }
  return removedStageLayout || removedControllerLayout;
}

function deleteFlowItem() {
  if (!selectedFlowStateId) return;
  if (selectedFlowActionId) {
    const ref = flowActionRef(selectedFlowStateId, selectedFlowActionId);
    if (ref) {
      const index = ref.actions.findIndex((action) => action.id === selectedFlowActionId);
      if (index >= 0) {
        pushFlowHistory();
        ref.actions.splice(index, 1);
      }
    }
    clearFlowActionSelection();
    renderFlowTool();
    return;
  }
  if (selectedFlowStateId === "lobby" || selectedFlowStateId === "intro") return;
  const deletedStateId = selectedFlowStateId;
  pushFlowHistory();
  gameFlow.states = gameFlow.states.filter((state) => state.id !== selectedFlowStateId);
  removeDeletedFlowStateFromLayouts(deletedStateId);
  selectedFlowStateId = gameFlow.states[0]?.id || "";
  clearFlowActionSelection();
  renderFlowTool();
  if (!layoutScreen.classList.contains("hidden")) renderLayoutTool();
}

async function saveGameFlow() {
  const result = await postJson("/api/game-flow", { flow: serializeGameFlowForSave(gameFlow) });
  gameFlow = result.flow;
  flowSavedSnapshot = JSON.stringify(serializeGameFlowForSave(gameFlow));
  updateFlowStorageStatus(result.storage);
  selectedFlowStateId = gameFlow.states.find((state) => state.id === selectedFlowStateId)?.id || gameFlow.states[0]?.id || "";
  clearFlowActionSelection();
  renderFlowTool();
}

function revertGameFlow() {
  if (!flowSavedSnapshot) return;
  gameFlow = JSON.parse(flowSavedSnapshot);
  flowUndoStack = [];
  flowRedoStack = [];
  selectedFlowStateId = flowState(selectedFlowStateId)?.id || gameFlow.states[0]?.id || "";
  clearFlowActionSelection();
  renderFlowTool();
}

async function setupFlowTool() {
  flowScreen.classList.remove("hidden");
  if (flowToolInitialized) return;
  flowToolInitialized = true;
  addStateButton.addEventListener("click", addFlowState);
  addActionButton.addEventListener("click", addFlowAction);
  deleteFlowItemButton.addEventListener("click", deleteFlowItem);
  revertFlowButton.addEventListener("click", revertGameFlow);
  flowListViewButton?.addEventListener("click", () => setFlowViewMode("list"));
  flowNodeViewButton?.addEventListener("click", () => setFlowViewMode("node"));
  nodeOptimizeButton?.addEventListener("click", optimizeCurrentFlowMoment);
  nodeBackButton?.addEventListener("click", () => {
    flowNodeDepth = "moments";
    clearFlowActionSelection();
    renderFlowTool();
  });
  flowNodeStage?.addEventListener("pointerdown", startFlowNodeMarquee);
  flowNodeStage?.addEventListener("pointermove", handleFlowNodePointerMove);
  flowNodeStage?.addEventListener("wheel", handleFlowNodeWheel, { passive: false });
  flowNodeStage?.addEventListener("scroll", renderFlowNodeMinimap);
  flowNodeMinimap?.addEventListener("pointerdown", startFlowNodeMinimapDrag);
  flowNodeMinimap?.addEventListener("click", jumpFlowNodeMinimap);
  flowNodeStage?.addEventListener("pointerup", (event) => {
    const targetNode = event.target.closest?.(".flow-node");
    if (targetNode) {
      completeNodeConnection(targetNode);
    } else if (pendingNodeConnection?.commandCreate || event.metaKey) {
      createActionFromPendingConnection(event);
    }
    clearPendingFlowNodeConnection();
  });
  setupFlowResizer();
  window.addEventListener("keydown", handleFlowHotkeys);
  try {
    await loadStageLayouts();
    await loadGameFlow();
  } catch (error) {
    flowEditorTitle.textContent = "Flow Tool Offline";
    flowEditorHelp.textContent = error.message;
  }
}
