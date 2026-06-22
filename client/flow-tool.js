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
  options.unshift({ id: "", name: "— None —" });
  return options;
}

function textTargetName(target) {
  const normalized = normalizeTextTargetId(target);
  const option = textTargetOptionsForFlowState(selectedFlowStateId).find((item) => item.id === normalized);
  if (option) return option.name;
  return formatTextTargetName(normalized);
}

function formatTextTargetName(normalized) {
  return normalized.split("-").map((part) => part ? part[0].toUpperCase() + part.slice(1) : "").join(" ");
}

function actionSummary(action, isSubAction = false) {
  const timing = ensureActionTiming(action, isSubAction);
  const timingText = `${timing.mode} ${Number(timing.seconds || 0).toFixed(1)}s`;
  const targetText = action.textTarget ? textTargetName(action.textTarget) : "⚠ No Field";
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
  const isTextAction = action.type === "presentText" || action.type === "displayText";
  if (isTextAction && !action.textTarget) {
    return { text: "⚠ No Field", className: "is-warning" };
  }
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
    const textTargetOptions = textTargetOptionsForFlowState(state.id, action.textTarget);
    flowEditor.appendChild(flowSelect("Text Field", normalizeTextTargetId(action.textTarget || ""), textTargetOptions, (value) => {
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
    textTarget: "",
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
