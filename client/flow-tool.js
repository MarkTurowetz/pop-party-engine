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
  selectedFlowRouteNodeId = "";
  selectedFlowRouteBranchId = "";
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

function actionNodeIsSelected(action) {
  return flowActionIsSelected(action.id)
    || (action.subActions || []).some((subAction) => flowActionIsSelected(subAction.id))
    || (action.type === "decision" && ensureDecisionBranches(action).some((branch) => flowActionIsSelected(branch.id)));
}

function flowNodeClassForAction(action) {
  if (action.type === "decision") return "is-decision";
  if (action.type === "jumpNode") return "is-jump";
  if (action.type === "labelNode") return "is-label";
  if (action.type === "codeNode") return "is-code";
  if (actionTypeMeta(action.type).category === "input") return "is-input";
  if (action.type === "transition" || action.type === "transitionState") return "is-transition";
  return "is-standard";
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
  if (flowNodeDepth !== "moments" || selectedFlowActionId || selectedFlowRouteNodeId) return [];
  return gameFlow.states.filter((state) => state.id === selectedFlowStateId || selectedFlowActionIds.has(state.id));
}

function flowRouteNodes() {
  return getFlowMomentRouteGraph()?.routeNodes() || [];
}

function flowRouteNode(routeNodeId) {
  return getFlowMomentRouteGraph()?.routeNode(routeNodeId) || null;
}

function flowRouteBranchTargetField() {
  return window.PartyGameFlowNodeGraphSchema?.forDepth?.("moments")?.branchTargetField || "targetNodeId";
}

function selectedFlowRouteNode() {
  return flowRouteNode(selectedFlowRouteNodeId);
}

function selectedFlowRouteBranch() {
  const routeNode = selectedFlowRouteNode();
  if (!routeNode || !selectedFlowRouteBranchId) return null;
  return decisionBranchById(routeNode, selectedFlowRouteBranchId, { targetField: flowRouteBranchTargetField() }) || null;
}

function repairSelectedFlowRouteBranch() {
  selectedFlowRouteNodeId = flowRouteNode(selectedFlowRouteNodeId)?.id || "";
  if (!selectedFlowRouteNodeId) {
    selectedFlowRouteBranchId = "";
    return;
  }
  if (selectedFlowRouteBranchId && !selectedFlowRouteBranch()) {
    selectedFlowRouteBranchId = "";
  }
}

function selectFlowRouteNode(routeNodeId) {
  selectedFlowRouteNodeId = flowRouteNode(routeNodeId)?.id || "";
  selectedFlowRouteBranchId = "";
  clearFlowActionSelection();
  selectedFlowActionIds = new Set();
}

function selectFlowRouteBranch(routeNodeId, branchId) {
  const routeNode = flowRouteNode(routeNodeId);
  const branch = routeNode ? decisionBranchById(routeNode, branchId, { targetField: flowRouteBranchTargetField() }) : null;
  selectedFlowRouteNodeId = branch ? routeNode.id : "";
  selectedFlowRouteBranchId = branch?.id || "";
  clearFlowActionSelection();
  selectedFlowActionIds = new Set();
}

function clearFlowRouteNodeSelection() {
  selectedFlowRouteNodeId = "";
  selectedFlowRouteBranchId = "";
}

function setFlowMomentSelection(ids, { expandInList = true } = {}) {
  const validIds = new Set((gameFlow.states || []).map((state) => state.id));
  const nextIds = (Array.isArray(ids) ? ids : [ids]).filter((id) => validIds.has(id));
  selectedFlowActionIds = new Set(nextIds);
  selectedFlowStateId = nextIds[nextIds.length - 1] || "";
  selectedFlowActionId = "";
  clearFlowRouteNodeSelection();
  if (expandInList) expandFlowStateInList(selectedFlowStateId);
}

function selectFlowMoment(stateId, options = {}) {
  if (options.additive) {
    const currentIds = new Set(selectedFlowMomentStates().map((state) => state.id));
    if (currentIds.has(stateId)) {
      currentIds.delete(stateId);
    } else {
      currentIds.add(stateId);
    }
    setFlowMomentSelection([...currentIds], options);
  } else {
    setFlowMomentSelection([stateId], options);
  }
}

function selectFlowMomentFromList(stateId, event) {
  if (event.metaKey || event.ctrlKey || event.shiftKey) {
    selectFlowMoment(stateId, { additive: true, expandInList: false });
  } else {
    selectedFlowStateId = stateId;
    clearFlowRouteNodeSelection();
    clearFlowActionSelection();
  }
  if (flowViewMode === "node") flowNodeDepth = "actions";
  renderFlowTool();
}

function expandFlowStateInList(stateId, { persist = true } = {}) {
  if (!stateId || !collapsedFlowStates.has(stateId)) return;
  collapsedFlowStates.delete(stateId);
  if (persist) persistFlowCollapseState();
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

let flowActionSummaryRuntime = null;

function getFlowActionSummaryRuntime() {
  if (!flowActionSummaryRuntime && window.PartyGameFlowActionSummary) {
    flowActionSummaryRuntime = window.PartyGameFlowActionSummary.createActionSummary({
      decisionSummary,
      decisionVariableName,
      ensureActionTiming,
      flowStateName,
      flowTargetActionName,
      gameObjectTargetName: flowGameObjectTargetName,
      hostAudioDisplayName,
      textTargetName,
      transitionName: (transitionId) => flowTransitions.find((item) => item.id === transitionId)?.name || transitionId
    });
  }
  return flowActionSummaryRuntime;
}

function actionSummary(action, isSubAction = false) {
  return getFlowActionSummaryRuntime()?.actionSummary(action, isSubAction) || "";
}

function actionTimingLabel(action, isSubAction = false) {
  return getFlowActionSummaryRuntime()?.actionTimingLabel(action, isSubAction) || "";
}

function actionValueBadge(action) {
  return getFlowActionSummaryRuntime()?.actionValueBadge(action) || null;
}

function flowTrueFalseOptions(trueFirst = true) {
  return window.PartyGameFlowActionOptions?.trueFalseOptions(trueFirst) || [
    { id: "true", name: "True" },
    { id: "false", name: "False" }
  ];
}

function choiceInputModeOptions() {
  return window.PartyGameFlowActionOptions?.choiceInputModeOptions() || [
    { id: "singleSelect", name: "Multi-Select Single" },
    { id: "submitOnce", name: "Single Input Done State" },
    { id: "continuous", name: "Continuous Input" }
  ];
}

function votingCardFilterOptions() {
  return window.PartyGameFlowActionOptions?.votingCardFilterOptions() || [
    { id: "all", name: "All Cards" },
    { id: "winners", name: "Correct Cards" },
    { id: "losers", name: "Wrong Cards" }
  ];
}

function playerFilterOptions() {
  return window.PartyGameFlowActionOptions?.playerFilterOptions() || [
    { id: "all", name: "All Players" },
    { id: "correct", name: "Correct Players" },
    { id: "wrong", name: "Wrong Players" },
    { id: "votingWinner", name: "Voting Winner Authors" },
    { id: "votingLosers", name: "Voting Losing Authors" }
  ];
}

function roundOptions() {
  return window.PartyGameFlowActionOptions?.roundOptions() || [
    { id: "current", name: "Current Round" },
    { id: "1", name: "Round 1" },
    { id: "2", name: "Round 2" },
    { id: "3", name: "Round 3" },
    { id: "4", name: "Round 4" },
    { id: "5", name: "Round 5" }
  ];
}

function transitionTriggerOptions() {
  return window.PartyGameFlowActionOptions?.transitionTriggerOptions() || [
    { id: "", name: "Immediate / Manual" },
    { id: "onCountdownComplete", name: "On Countdown Complete" }
  ];
}

let flowActionControlGroups = null;
let flowActionDefaults = null;
let flowDecisionControls = null;
let flowFormControls = null;
let flowActionInspectorRegistry = null;
let flowNodeBranchDescriptors = null;
let flowNodeChildSortController = null;
let flowNodeConnectionController = null;
let flowNodeConnectionPlanner = null;
let flowNodeDragController = null;
let flowNodeMarqueeController = null;
let flowNodeInspectorRenderer = null;
let flowNodeMinimapController = null;
let flowNodePortsFactory = null;
let flowNodeWireRenderer = null;
let flowMomentRouteGraph = null;
let flowMomentRouteRenderer = null;
let flowMomentRouteWires = null;
let flowNodeWirePlanner = null;
let flowActionNodeRenderer = null;
let flowActionNodeWires = null;
let flowConnectionDebug = null;

function getFlowFormControls() {
  if (!flowFormControls && window.PartyGameFlowFormControls) {
    flowFormControls = window.PartyGameFlowFormControls.createFormControls({
      hostAudioFlowOptions,
      pushFlowHistory,
      refreshActionNameFromType
    });
  }
  return flowFormControls;
}

function getFlowMomentRouteGraph() {
  if (!flowMomentRouteGraph && window.PartyGameFlowMomentRouteGraph) {
    flowMomentRouteGraph = window.PartyGameFlowMomentRouteGraph.createMomentRouteGraph({
      defaultNodePosition,
      ensureDecisionBranches,
      flowState,
      gameFlow: () => gameFlow
    });
  }
  return flowMomentRouteGraph;
}

function getFlowNodeBranchDescriptors() {
  if (!flowNodeBranchDescriptors && window.PartyGameFlowNodeBranchDescriptors) {
    flowNodeBranchDescriptors = window.PartyGameFlowNodeBranchDescriptors.createFlowNodeBranchDescriptors({
      decisionBranchName,
      ensureDecisionBranches,
      flowTargetActionName
    });
  }
  return flowNodeBranchDescriptors;
}

function getFlowMomentRouteRenderer() {
  if (!flowMomentRouteRenderer && window.PartyGameFlowMomentRouteRenderer) {
    flowMomentRouteRenderer = window.PartyGameFlowMomentRouteRenderer.createMomentRouteRenderer({
      actionCategoryName,
      actionTimingLabel,
      actionTypeMeta,
      actionValueBadge,
      appendActionPropertyControls: (...args) => getFlowActionInspectorRegistry()?.appendActionPropertyControls(...args),
      appendDecisionBranchControls: (...args) => getFlowDecisionControls()?.appendDecisionBranchControls(...args),
      appendDecisionControls: (...args) => getFlowDecisionControls()?.appendDecisionControls(...args),
      bindFlowNodeDrag,
      createFlowMomentRoutePorts,
      createFlowMomentRouteActionPorts,
      createFlowNode,
      createFlowNodeBranches,
      createFlowNodeBranchDescriptors: () => getFlowNodeBranchDescriptors(),
      decisionBranchName,
      decisionVariableName,
      defaultNodePosition,
      deleteSelectedFlowRouteNode,
      ensureDecisionBranches,
      flowActionButton,
      flowField,
      flowActionNameField,
      flowMomentEntryTargetOptions,
      flowActionTypes: () => flowActionTypes,
      flowNodeDepth: () => flowNodeDepth,
      flowNodeInspector: () => flowNodeInspector,
      flowNodeClassForAction,
      flowNodeLayer: () => flowNodeLayer,
      flowRouteGraphTargetOptions,
      flowRouteNodes,
      flowRouteTargetName,
      flowSelect,
      flowStateName,
      isNoFlowTarget,
      pushFlowHistory,
      readOnlyFlowNote,
      redrawFlowNodeWires,
      refreshFlowNodeInspectorChange,
      renderFlowListAndPublish,
      renderFlowNodeView,
      renderFlowTool,
      savedNodePosition,
      selectFlowRouteBranch,
      selectFlowRouteNode,
      selectedFlowRouteBranch: () => selectedFlowRouteBranch(),
      selectedFlowRouteBranchId: () => selectedFlowRouteBranchId,
      selectedFlowRouteNode,
      selectedFlowRouteNodeId: () => selectedFlowRouteNodeId,
      selectedRouteJumpTargetIds,
      selectedFlowStateId: () => selectedFlowStateId
    });
  }
  return flowMomentRouteRenderer;
}

function getFlowNodeWirePlanner() {
  if (!flowNodeWirePlanner && window.PartyGameFlowNodeWirePlanner) {
    flowNodeWirePlanner = window.PartyGameFlowNodeWirePlanner.createNodeWirePlanner({
      cssEscape,
      drawNodeWire,
      isNoFlowTarget
    });
  }
  return flowNodeWirePlanner;
}

function getFlowMomentRouteWires() {
  if (!flowMomentRouteWires && window.PartyGameFlowMomentRouteWires) {
    flowMomentRouteWires = window.PartyGameFlowMomentRouteWires.createMomentRouteWires({
      decisionBranchWireLabel,
      ensureDecisionBranches,
      flowNodeBranchDescriptors: () => getFlowNodeBranchDescriptors(),
      flowNodeLayer: () => flowNodeLayer,
      flowRouteNodes,
      gameStates: () => gameFlow.states || [],
      nodeWirePlanner: () => getFlowNodeWirePlanner(),
      renderFlowNodeMinimap,
      selectedFlowActionIds: () => selectedFlowActionIds,
      selectedFlowRouteBranchId: () => selectedFlowRouteBranchId,
      selectedFlowRouteNodeId: () => selectedFlowRouteNodeId,
      selectedFlowStateId: () => selectedFlowStateId
    });
  }
  return flowMomentRouteWires;
}

function getFlowActionNodeRenderer() {
  if (!flowActionNodeRenderer && window.PartyGameFlowActionNodeRenderer) {
    flowActionNodeRenderer = window.PartyGameFlowActionNodeRenderer.createActionNodeRenderer({
      actionCategoryName,
      actionNodeIsSelected,
      actionTimingLabel,
      actionTypeMeta,
      actionValueBadge,
      bindFlowNodeChildSort,
      bindFlowNodeDrag,
      clearFlowActionSelection,
      createFlowNode,
      createFlowNodeBranches,
      createFlowNodePorts,
      createFlowStartPorts,
      defaultNodePosition,
      expandFlowStateInList,
      flowActionIsSelected,
      flowNodeLayer: () => flowNodeLayer,
      flowState,
      flowTargetActionName,
      isNoFlowTarget,
      nodeBackButton: () => nodeBackButton,
      nodeViewHelp: () => nodeViewHelp,
      renderFlowTool,
      savedNodePosition,
      scheduleFlowNodeWireRedraw,
      selectFlowAction,
      selectedFlowStateId: () => selectedFlowStateId,
      setFlowNodeDepth: (depth) => {
        flowNodeDepth = depth;
      },
      setSelectedFlowStateId: (stateId) => {
        selectedFlowStateId = stateId;
      },
      systemNodeModel
    });
  }
  return flowActionNodeRenderer;
}

function getFlowActionNodeWires() {
  if (!flowActionNodeWires && window.PartyGameFlowActionNodeWires) {
    flowActionNodeWires = window.PartyGameFlowActionNodeWires.createActionNodeWires({
      actionNodeIsSelected,
      decisionBranchById,
      decisionBranchWireLabel,
      ensureDecisionBranches,
      flowActionIsSelected,
      flowActionRef,
      flowNodeBranchDescriptors: () => getFlowNodeBranchDescriptors(),
      flowNodeExitDefinitions,
      flowNodeLayer: () => flowNodeLayer,
      flowState,
      nodeWirePlanner: () => getFlowNodeWirePlanner(),
      renderFlowNodeMinimap,
      selectedFlowActionId: () => selectedFlowActionId,
      selectedFlowStateId: () => selectedFlowStateId,
      shouldDrawImplicitActionWire
    });
  }
  return flowActionNodeWires;
}

function getFlowActionControlGroups() {
  if (!flowActionControlGroups && window.PartyGameFlowActionControlGroups) {
    flowActionControlGroups = window.PartyGameFlowActionControlGroups.createActionControlGroups({
      ...(getFlowFormControls() || {}),
      flowActionTargetOptions,
      flowTrueFalseOptions,
      hostAudioPlayModeOptions,
      normalizeTextTargetId,
      playerFilterOptions,
      textTargetOptionsForFlowState
    });
  }
  return flowActionControlGroups;
}

function getFlowActionDefaults() {
  if (!flowActionDefaults && window.PartyGameFlowActionDefaults) {
    flowActionDefaults = window.PartyGameFlowActionDefaults.createActionDefaults({
      defaultControllerLayoutId,
      ensureActionTiming,
      ensureDecisionBranches,
      firstHostAudioId
    });
  }
  return flowActionDefaults;
}

function getFlowDecisionControls() {
  if (!flowDecisionControls && window.PartyGameFlowDecisionControls) {
    flowDecisionControls = window.PartyGameFlowDecisionControls.createDecisionControls({
      ...(getFlowFormControls() || {}),
      ensureDecisionBranches,
      flowNodeBranchDescriptors: () => getFlowNodeBranchDescriptors(),
      flowActionTargetOptions,
      gameConstants: () => gameConstants,
      makeDecisionBranchId,
      pushFlowHistory
    });
  }
  return flowDecisionControls;
}

function getFlowActionInspectorRegistry() {
  if (!flowActionInspectorRegistry && window.PartyGameFlowActionInspectorRegistry) {
    flowActionInspectorRegistry = window.PartyGameFlowActionInspectorRegistry.createActionInspectorRegistry({
      ...(getFlowFormControls() || {}),
      actionTypeMeta,
      addFlowSubAction,
      appendDecisionControls,
      applyFlowActionTypeDefaults,
      choiceInputModeOptions,
      controllerLayoutOptions,
      ensureActionTiming,
      flowActionTargetOptions,
      flowActionTypes: () => flowActionTypes,
      flowTransitions: () => flowTransitions,
      flowTrueFalseOptions,
      gameStates: () => gameFlow.states || [],
      getFlowActionControlGroups,
      gameObjectTargetOptions: flowGameObjectTargetOptions,
      readOnlyFlowNote,
      refreshActionNameFromType,
      roundOptions,
      transitionTriggerOptions,
      votingCardFilterOptions
    });
  }
  return flowActionInspectorRegistry;
}

function getFlowNodeInspectorRenderer() {
  if (!flowNodeInspectorRenderer && window.PartyGameFlowNodeInspector) {
    flowNodeInspectorRenderer = window.PartyGameFlowNodeInspector.createFlowNodeInspector({
      actionCategoryName,
      actionSummary,
      actionTypeMeta,
      appendActionPropertyControls: (...args) => getFlowActionInspectorRegistry()?.appendActionPropertyControls(...args),
      appendDecisionBranchControls: (...args) => getFlowDecisionControls()?.appendDecisionBranchControls(...args),
      decisionBranchName,
      ensureDecisionBranches,
      flowActionButton,
      flowActionRef,
      flowActionTargetOptions,
      flowNodeDepth: () => flowNodeDepth,
      flowNodeInspector: () => flowNodeInspector,
      flowSelect,
      flowState,
      flowStateTargetOptions,
      pushFlowHistory,
      readOnlyFlowNote,
      redrawFlowNodeWires,
      refreshFlowNodeInspectorChange,
      renderFlowListAndPublish,
      renderFlowNodeView,
      renderRouteInspector: () => getFlowMomentRouteRenderer()?.renderInspector(),
      selectedFlowActionId: () => selectedFlowActionId,
      selectedFlowStateId: () => selectedFlowStateId,
      setFlowViewMode
    });
  }
  return flowNodeInspectorRenderer;
}

function getFlowNodeWireRenderer() {
  if (!flowNodeWireRenderer && window.PartyGameFlowNodeWires) {
    flowNodeWireRenderer = window.PartyGameFlowNodeWires.createFlowNodeWireRenderer({
      flowNodeGraph: () => flowNodeGraph,
      flowNodeWireLabels: () => flowNodeWireLabels,
      flowNodeWires: () => flowNodeWires,
      flowNodeZoom: () => flowNodeZoom
    });
  }
  return flowNodeWireRenderer;
}

function getFlowNodeMinimap() {
  if (!flowNodeMinimapController && window.PartyGameFlowNodeMinimap) {
    flowNodeMinimapController = window.PartyGameFlowNodeMinimap.createFlowNodeMinimap({
      flowActionIsSelected,
      flowGraphNodeBounds,
      flowNodeDepth: () => flowNodeDepth,
      flowNodeGraph: () => flowNodeGraph,
      flowNodeLayer: () => flowNodeLayer,
      flowNodeMinimap: () => flowNodeMinimap,
      flowNodeMinimapViewport: () => flowNodeMinimapViewport,
      flowNodeStage: () => flowNodeStage,
      flowNodeZoom: () => flowNodeZoom,
      selectedFlowRouteNodeId: () => selectedFlowRouteNodeId,
      selectedFlowStateId: () => selectedFlowStateId
    });
  }
  return flowNodeMinimapController;
}

function getFlowNodePortsFactory() {
  if (!flowNodePortsFactory && window.PartyGameFlowNodePorts) {
    flowNodePortsFactory = window.PartyGameFlowNodePorts.createFlowNodePortsFactory({
      armConnection: armFlowNodeConnection,
      flowStateName,
      flowRouteTargetName,
      flowTargetActionName,
      selectedFlowStateId: () => selectedFlowStateId
    });
  }
  return flowNodePortsFactory;
}

function getFlowNodeConnectionPlanner() {
  if (!flowNodeConnectionPlanner && window.PartyGameFlowNodeConnectionPlanner) {
    flowNodeConnectionPlanner = window.PartyGameFlowNodeConnectionPlanner.createFlowNodeConnectionPlanner({
      createDefaultFlowAction,
      createRouteActionNode: (...args) => getFlowMomentRouteGraph()?.createRouteActionNode(...args),
      cssEscape,
      decisionBranchById,
      flowAction,
      flowRouteNode,
      flowRouteNodes,
      flowState
    });
  }
  return flowNodeConnectionPlanner;
}

function getFlowNodeConnectionController() {
  if (!flowNodeConnectionController && window.PartyGameFlowNodeConnections) {
    flowNodeConnectionController = window.PartyGameFlowNodeConnections.createFlowNodeConnectionController({
      connectionPlanner: () => getFlowNodeConnectionPlanner(),
      drawPreviewNodeWire,
      flowNodeDepth: () => flowNodeDepth,
      flowNodeHint: () => flowNodeHint,
      flowNodeLayer: () => flowNodeLayer,
      flowNodeLocalPoint,
      selectFlowRouteNode,
      pushFlowHistory,
      redrawFlowNodeWires,
      renderFlowListAndPublish,
      renderFlowNodeView,
      setFlowActionSelection,
      showConnectionDebug: showFlowConnectionDebug
    });
  }
  return flowNodeConnectionController;
}

function getFlowNodeChildSortController() {
  if (!flowNodeChildSortController && window.PartyGameFlowNodeChildSort) {
    flowNodeChildSortController = window.PartyGameFlowNodeChildSort.createFlowNodeChildSortController({
      decisionBranchById,
      ensureDecisionBranches,
      pushFlowHistory,
      renderFlowListAndPublish,
      renderFlowNodeView
    });
  }
  return flowNodeChildSortController;
}

function getFlowNodeDragController() {
  if (!flowNodeDragController && window.PartyGameFlowNodeDrag) {
    flowNodeDragController = window.PartyGameFlowNodeDrag.createFlowNodeDragController({
      cssEscape,
      flowNodeDepth: () => flowNodeDepth,
      flowNodeLayer: () => flowNodeLayer,
      flowNodeZoom: () => flowNodeZoom,
      pushFlowHistory,
      redrawFlowNodeWires,
      renderFlowListAndPublish,
      renderFlowNodeMinimap,
      renderFlowNodeView,
      savedNodePosition,
      selectedFlowMomentStates,
      selectedPrimaryFlowActions
    });
  }
  return flowNodeDragController;
}

function setFlowNodeMarqueeMomentSelection(selectedIds) {
  clearFlowRouteNodeSelection();
  selectedFlowActionIds = new Set(selectedIds);
  selectedFlowStateId = selectedIds[selectedIds.length - 1] || selectedFlowStateId || gameFlow.states[0]?.id || "";
  selectedFlowActionId = "";
  expandFlowStateInList(selectedFlowStateId);
}

function getFlowNodeMarqueeController() {
  if (!flowNodeMarqueeController && window.PartyGameFlowNodeMarquee) {
    flowNodeMarqueeController = window.PartyGameFlowNodeMarquee.createFlowNodeMarqueeController({
      flowActionIsSelected,
      flowMomentNodeIsSelected: (stateId) => !selectedFlowRouteNodeId && (selectedFlowActionIds.has(stateId) || selectedFlowStateId === stateId),
      flowNodeDepth: () => flowNodeDepth,
      flowNodeGraph: () => flowNodeGraph,
      flowNodeLayer: () => flowNodeLayer,
      flowNodeZoom: () => flowNodeZoom,
      flowViewMode: () => flowViewMode,
      hasPendingConnection: hasPendingFlowNodeConnection,
      renderFlowList,
      renderFlowNodeInspector,
      renderFlowTool,
      setFlowActionSelection,
      setMomentMarqueeSelection: setFlowNodeMarqueeMomentSelection,
      startSelectionMarquee: window.PartyGameToolAffordances?.startSelectionMarquee
    });
  }
  return flowNodeMarqueeController;
}

function flowStateName(stateId) {
  return flowState(stateId)?.name || flowRouteNode(stateId)?.name || stateId || "State";
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

function ensureDecisionBranches(action, options = {}) {
  if (!action) return [];
  const targetField = options.targetField || "targetActionId";
  const trueTargetField = options.trueTargetField || "trueTargetActionId";
  const falseTargetField = options.falseTargetField || "falseTargetActionId";
  if (!Array.isArray(action.branches) || !action.branches.length) {
    action.branches = [
      {
        id: "legacy-hit",
        type: "code",
        code: `x ${action.operator || "<"} ${action.compareValue || "3"}`,
        value: action.compareValue || "3",
        [targetField]: action[trueTargetField] || ""
      },
      {
        id: "no-match",
        type: "noMatch",
        [targetField]: action[falseTargetField] || ""
      }
    ];
  }
  action.branches = action.branches.map((branch, index) => {
    const targetActionId = branch.targetActionId || "";
    const targetNodeId = branch.targetNodeId || "";
    const target = branch[targetField] || (targetField === "targetNodeId" ? targetActionId : "") || "";
    const normalized = {
      id: branch.id || (branch.type === "noMatch" ? "no-match" : makeDecisionBranchId(`branch-${index + 1}`)),
      type: ["hit", "code", "noMatch"].includes(branch.type) ? branch.type : "hit",
      value: branch.value ?? "",
      code: branch.code || "x < 3",
      [targetField]: target
    };
    if (targetField !== "targetActionId" && targetActionId) normalized.targetActionId = targetActionId;
    if (targetField !== "targetNodeId" && targetNodeId) normalized.targetNodeId = targetNodeId;
    return normalized;
  });
  const regular = action.branches.filter((branch) => branch.type !== "noMatch");
  const noMatch = action.branches.find((branch) => branch.type === "noMatch") || { id: "no-match", type: "noMatch", value: "", code: "", [targetField]: "" };
  action.branches = [...regular, { ...noMatch, type: "noMatch", id: noMatch.id || "no-match" }];
  return action.branches;
}

function decisionBranchById(action, branchId, options = {}) {
  return ensureDecisionBranches(action, options).find((branch) => branch.id === branchId);
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

function decisionSummary(action, options = {}) {
  const descriptorFactory = getFlowNodeBranchDescriptors();
  const descriptors = descriptorFactory?.descriptorsFor(null, action, {
    targetField: options.targetField || "targetActionId",
    targetKind: options.targetKind || "action",
    targetName: options.targetName || flowTargetActionName
  }) || [];
  const branchRows = descriptors.length
    ? descriptors
    : ensureDecisionBranches(action, { targetField: options.targetField || "targetActionId" }).map((branch, index) => ({
      branch,
      index,
      targetId: branch[options.targetField || "targetActionId"] || ""
    }));
  return branchRows.map(({ branch, index, targetId }) => {
    const targetName = options.targetName || flowTargetActionName;
    const target = targetName(targetId);
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
  getFlowMomentRouteGraph()?.appendRouteTargets(options);
  if (selectedStateId && !options.some((option) => option.id === selectedStateId)) {
    options.push({ id: selectedStateId, name: selectedStateId });
  }
  return options;
}

function flowMomentEntryTargetOptions(selectedStateId = "") {
  return getFlowMomentRouteGraph()?.momentEntryTargetOptions(selectedStateId) || [{ id: "", name: "No Target" }];
}

function flowRouteGraphTargetOptions(selectedTargetId = "", currentNodeId = "") {
  return getFlowMomentRouteGraph()?.graphTargetOptions(selectedTargetId, currentNodeId) || [{ id: "", name: "No Target" }];
}

function flowRouteTargetName(targetId) {
  return getFlowMomentRouteGraph()?.targetName(targetId) || targetId || "No Target";
}

function defaultControllerLayoutId() {
  return selectedFlowStateId || controllerLayouts.states?.[0]?.id || "";
}

function controllerLayoutOptions(selectedLayoutId = "") {
  const options = [{ id: "", name: "Current Moment Default" }];
  for (const state of controllerLayouts.states || []) {
    options.push({ id: state.id, name: state.name || state.id });
  }
  if (selectedLayoutId && !options.some((option) => option.id === selectedLayoutId)) {
    options.push({ id: selectedLayoutId, name: selectedLayoutId });
  }
  return options;
}

function flowGameObjectLayoutElements(state) {
  const stateId = state?.id || selectedFlowStateId || "";
  const layout = (stageLayouts.states || []).find((item) => item.id === stateId);
  const momentElements = flowPlacedGameObjectElementsForLayoutGroup(layout, "moment");
  const momentIds = new Set(momentElements.map((element) => element.id));
  const globalLayout = stageLayouts.global || {};
  const hiddenGlobals = new Set(layout?.hiddenGlobals || []);
  const globalElements = globalLayout.hiddenInStates === true
    ? []
    : flowPlacedGameObjectElementsForLayoutGroup(globalLayout, "global", { hiddenIds: hiddenGlobals, excludeIds: momentIds });
  return [
    ...momentElements,
    ...globalElements
  ];
}

function flowPlacedGameObjectElementsForLayoutGroup(group, scope, options = {}) {
  const hiddenIds = options.hiddenIds || new Set();
  const excludeIds = options.excludeIds || new Set();
  return (group?.elements || [])
    .filter((element) => element?.id)
    .filter((element) => !hiddenIds.has(element.id))
    .filter((element) => !excludeIds.has(element.id))
    .map((element) => ({ ...element, targetLayoutScope: scope }));
}

function flowGameObjectTargetLabel(element) {
  const scope = ["global", "moment"].includes(element?.targetLayoutScope) ? element.targetLayoutScope : "moment";
  const name = String(element?.name || element?.id || "Game Object");
  const id = String(element?.id || "");
  const idSuffix = id && id.toLowerCase() !== name.toLowerCase() ? ` (${id})` : "";
  return `${scope === "global" ? "Global: " : ""}${name}${idSuffix}`;
}

function flowGameObjectTargetValue(element) {
  const scope = ["global", "moment"].includes(element?.targetLayoutScope) ? element.targetLayoutScope : "moment";
  return `${scope}:${element.id || ""}`;
}

function flowGameObjectTargetParts(value, fallbackScope = "") {
  const text = String(value || "");
  const match = text.match(/^(global|moment):(.+)$/);
  if (match) return { scope: match[1], id: match[2] };
  return { scope: fallbackScope || "", id: text };
}

function flowGameObjectTargetOptions(state, selectedElementId = "") {
  const selectedParts = flowGameObjectTargetParts(selectedElementId);
  const options = [{ id: "", name: "No Game Object" }];
  for (const element of flowGameObjectLayoutElements(state)) {
    options.push({ id: flowGameObjectTargetValue(element), name: flowGameObjectTargetLabel(element) });
  }
  const selectedValue = selectedParts.id ? `${selectedParts.scope || "moment"}:${selectedParts.id}` : "";
  if (selectedParts.id && !options.some((option) => option.id === selectedValue)) {
    options.push({ id: selectedElementId, name: selectedParts.id });
  }
  return options;
}

function flowGameObjectTargetName(elementId, targetLayoutScope = "") {
  if (!elementId) return "No Game Object";
  const scope = ["global", "moment"].includes(String(targetLayoutScope || "")) ? targetLayoutScope : "";
  const selectedState = (stageLayouts.states || []).find((state) => state.id === selectedFlowStateId);
  const momentElement = (selectedState?.elements || []).find((item) => item.id === elementId);
  const globalElement = (stageLayouts.global?.elements || []).find((item) => item.id === elementId);
  if (scope === "moment" && momentElement) return flowGameObjectTargetLabel({ ...momentElement, targetLayoutScope: "moment" });
  if (scope === "global" && globalElement) return flowGameObjectTargetLabel({ ...globalElement, targetLayoutScope: "global" });
  if (momentElement) return flowGameObjectTargetLabel({ ...momentElement, targetLayoutScope: "moment" });
  if (globalElement) return flowGameObjectTargetLabel({ ...globalElement, targetLayoutScope: "global" });
  for (const state of stageLayouts.states || []) {
    const element = (state.elements || []).find((item) => item.id === elementId);
    if (element) return flowGameObjectTargetLabel({ ...element, targetLayoutScope: "moment" });
  }
  return elementId;
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
  if (hostAudiosSavedSnapshot) {
    const hostAudiosDirty = isHostAudiosDirty();
    message.hostAudios = hostAudiosDirty ? serializeHostAudiosForSave(hostAudios) : null;
    message.clearHostAudios = !hostAudiosDirty;
  }
  if (artCompositionsSavedSnapshot) {
    const artDirty = isArtCompositionsDirty();
    message.artCompositions = artDirty ? serializeArtCompositionsForSave(artCompositions) : null;
    message.clearArtCompositions = !artDirty;
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

function showFlowConnectionDebug(details = {}) {
  if (!flowNodeStage) return;
  if (!flowConnectionDebug) {
    flowConnectionDebug = document.createElement("div");
    flowConnectionDebug.className = "flow-connection-debug";
    Object.assign(flowConnectionDebug.style, {
      position: "sticky",
      left: "10px",
      bottom: "10px",
      zIndex: "30",
      maxWidth: "620px",
      margin: "10px",
      padding: "8px 10px",
      border: "3px solid var(--ink)",
      borderRadius: "8px",
      background: "rgba(255, 247, 214, 0.96)",
      color: "var(--ink)",
      fontSize: "12px",
      fontWeight: "900",
      lineHeight: "1.2",
      pointerEvents: "none"
    });
    flowNodeStage.appendChild(flowConnectionDebug);
  }
  const pending = details.pending || {};
  flowConnectionDebug.textContent = [
    `connection ${details.status || "debug"}`,
    `reason: ${details.reason || "unknown"}`,
    `source: ${pending.sourceKind || "?"}`,
    `targetKind: ${pending.targetKind || "?"}`,
    `field: ${pending.field || "?"}`,
    `branch: ${pending.branchId || "-"}`,
    `targetNode: ${details.targetNode || "-"}`,
    `targetId: ${details.targetId || "-"}`,
    `sourceAfter: ${details.sourceTargetAfter || "-"}`
  ].join(" / ");
}

function flowNodeAtPointer(event) {
  const pointNodes = typeof document.elementsFromPoint === "function"
    ? document.elementsFromPoint(event.clientX, event.clientY)
    : [document.elementFromPoint(event.clientX, event.clientY)].filter(Boolean);
  for (const node of pointNodes) {
    const flowNode = node?.closest?.(".flow-node");
    if (flowNode) return flowNode;
  }
  return event.target.closest?.(".flow-node") || null;
}

function publishRuntimeLocalClear() {
  const message = {
    type: "runtime-test-config",
    flow: null,
    layouts: null,
    controllerLayouts: null,
    constants: null,
    hostAudios: null,
    artCompositions: null,
    clearFlow: true,
    clearLayouts: true,
    clearControllerLayouts: true,
    clearConstants: true,
    clearHostAudios: true,
    clearArtCompositions: true
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
  if (isFlowDirty() || isLayoutDirty() || isControllerLayoutDirty() || isHostAudiosDirty()) publishRuntimeLocalClear();
});

async function loadGameFlow() {
  const result = await getJson("/api/game-flow");
  gameFlow = result.flow || { states: [] };
  flowActionTypes = result.availableActionTypes || [];
  flowTransitions = result.availableTransitions || [];
  flowSavedSnapshot = JSON.stringify(serializeGameFlowForSave(result.savedFlow || result.flow || gameFlow));
  getFlowHistoryManager().clear();
  updateFlowStorageStatus(result.storage);
  selectedFlowStateId = selectedFlowStateId || gameFlow.states[0]?.id || "";
  clearFlowActionSelection();
  expandFlowStateInList(selectedFlowStateId);
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
  if (deleteFlowItemButton) deleteFlowItemButton.disabled = !selectedFlowRouteNodeId && !selectedFlowStateId;
  if (addActionButton) {
    addActionButton.textContent = "Add Action";
    addActionButton.disabled = flowViewMode === "node" && flowNodeDepth === "moments" ? false : !flowState(selectedFlowStateId);
  }
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

function persistFlowCollapseState() {
  setLocalValue("partyTemplate.collapsedFlowStates", JSON.stringify([...collapsedFlowStates]));
  setLocalValue("partyTemplate.collapsedFlowActions", JSON.stringify([...collapsedFlowActions]));
}

function renderAndPersistFlowCollapseState() {
  persistFlowCollapseState();
  renderFlowList();
}

function flowActionCollapseIds() {
  return gameFlow.states.flatMap((state) => (
    state.actions || []
  ).filter((action) => action.subActions?.length).map((action) => action.id));
}

function toggleFlowCollapsedIds(collapsedSet, ids) {
  window.PartyGameToolAffordances?.toggleCollapsedSetForIds(collapsedSet, ids);
  renderAndPersistFlowCollapseState();
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
    stateButton.querySelector(".disclosure-slot").appendChild(createDisclosureButton(
      state.id,
      collapsedFlowStates,
      renderAndPersistFlowCollapseState,
      () => toggleFlowCollapsedIds(collapsedFlowStates, gameFlow.states.map((s) => s.id))
    ));
    stateButton.querySelector("strong").textContent = state.name;
    stateButton.querySelector(".flow-row-summary").textContent = state.id;
    stateButton.addEventListener("click", (event) => selectFlowMomentFromList(state.id, event));
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
    disclosureSlot.appendChild(createDisclosureButton(
      action.id,
      collapsedFlowActions,
      renderAndPersistFlowCollapseState,
      () => toggleFlowCollapsedIds(collapsedFlowActions, flowActionCollapseIds())
    ));
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
  expandFlowStateInList(draggedStateId);
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
      expandFlowStateInList(state.id);
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
    const otherStates = gameFlow.states.filter((s) => s.id !== state.id).map((s) => ({ id: s.id, name: s.name }));
    flowEditor.appendChild(flowSelect("Voting Source", state.votingSourceStateId || "", [{ id: "", name: "— None —" }, ...otherStates], (value) => {
      state.votingSourceStateId = value || undefined;
      renderFlowListAndPublish();
    }));
    flowEditor.appendChild(readOnlyFlowNote("Primary actions run from top to bottom. Input actions wait for input; standard actions can use S+ or E+ timing."));
    return;
  }

  flowEditorTitle.textContent = action.name;
  flowEditorHelp.textContent = actionRef.isSubAction ? `Editing sub-action under ${actionRef.parentAction.name}.` : `Editing primary action in ${state.name}.`;
  getFlowActionInspectorRegistry()?.appendActionPropertyControls(flowEditor, state, actionRef, {
    change: () => renderFlowListAndPublish(),
    softChange: () => renderFlowListAndPublish(),
    refresh: () => {
      renderFlowListAndPublish();
      renderFlowEditor();
    },
    refreshAll: () => renderFlowTool(),
    decisionChange: (redraw = true) => {
      renderFlowListAndPublish();
      if (redraw) renderFlowEditor();
    },
    includeSubActionButton: true,
    stopAfterDecision: false
  });
}

function flowField(label, value, onChange) {
  return getFlowFormControls()?.flowField(label, value, onChange);
}

function flowActionNameField(state, action, onChange, onRefresh) {
  return getFlowFormControls()?.flowActionNameField(state, action, onChange, onRefresh);
}

function flowTextarea(label, value, onChange) {
  return getFlowFormControls()?.flowTextarea(label, value, onChange);
}

function flowSelect(label, value, options, onChange) {
  return getFlowFormControls()?.flowSelect(label, value, options, onChange);
}

function flowVariableSearch(label, value, options, onChange) {
  return getFlowFormControls()?.flowVariableSearch(label, value, options, onChange);
}

function hostAudioPlayModeOptions() {
  return window.PartyGameFlowActionOptions?.hostAudioPlayModeOptions() || [
    { id: "random", name: "Play Random" },
    { id: "sequence", name: "Play In Sequence" },
    { id: "index", name: "Play At Index" }
  ];
}

function flowHostAudioSearch(label, value, onChange) {
  return getFlowFormControls()?.flowHostAudioSearch(label, value, onChange);
}

function flowActionTypeSearch(label, value, options, onChange) {
  return getFlowFormControls()?.flowActionTypeSearch(label, value, options, onChange);
}

function flowNumber(label, value, onChange) {
  return getFlowFormControls()?.flowNumber(label, value, onChange);
}

function flowInteger(label, value, onChange) {
  return getFlowFormControls()?.flowInteger(label, value, onChange);
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
  return getFlowFormControls()?.flowActionButton(label, onClick);
}

function readOnlyFlowNote(text) {
  return getFlowFormControls()?.readOnlyFlowNote(text);
}

function addFlowState() {
  const nextNumber = gameFlow.states.length + 1;
  const state = { id: `state-${nextNumber}`, name: `New Game State ${nextNumber}`, actions: [] };
  pushFlowHistory();
  gameFlow.states.push(state);
  selectedFlowStateId = state.id;
  clearFlowRouteNodeSelection();
  clearFlowActionSelection();
  expandFlowStateInList(state.id);
  renderFlowTool();
}

function addFlowAction() {
  if (flowViewMode === "node" && flowNodeDepth === "moments") {
    addFlowRouteActionNode();
    return;
  }
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

function addFlowRouteActionNode(point = null) {
  if (flowViewMode !== "node" || flowNodeDepth !== "moments") return null;
  const nodes = flowRouteNodes();
  const node = getFlowMomentRouteGraph()?.createRouteActionNode(point);
  if (!node) return null;
  pushFlowHistory();
  nodes.push(node);
  selectFlowRouteNode(node.id);
  renderFlowTool();
  return node;
}

function addFlowMomentEntryNode() {
  const nodes = flowRouteNodes();
  const node = getFlowMomentRouteGraph()?.createMomentEntryNode(selectedFlowStateId);
  if (!node) return;
  pushFlowHistory();
  nodes.push(node);
  selectFlowRouteNode(node.id);
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
    })),
    routeNodes: (flow.routeNodes || []).map(serializeFlowRouteNodeForSave)
  };
}

function serializeFlowRouteNodeForSave(node) {
  return getFlowMomentRouteGraph()?.serializeRouteNode(node) || node;
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

function clearMomentGraphTargetReferences(targetIds) {
  getFlowMomentRouteGraph()?.clearTargetReferences(targetIds);
}

function flattenedFlowActionIds(actions = [], output = []) {
  for (const action of actions || []) {
    output.push(action.id);
    for (const subAction of action.subActions || []) output.push(subAction.id);
    if (action.type === "decision") {
      for (const branch of ensureDecisionBranches(action)) output.push(branch.id);
    }
  }
  return output;
}

function removeSelectedFlowActionsFromList(actions = [], selectedIds, removedIds = []) {
  return (actions || []).filter((action) => {
    if (selectedIds.has(action.id)) {
      removedIds.push(action.id);
      return false;
    }
    if (Array.isArray(action.subActions)) {
      action.subActions = action.subActions.filter((subAction) => {
        if (!selectedIds.has(subAction.id)) return true;
        removedIds.push(subAction.id);
        return false;
      });
    }
    if (action.type === "decision" && Array.isArray(action.branches)) {
      action.branches = action.branches.filter((branch) => {
        if (!selectedIds.has(branch.id)) return true;
        removedIds.push(branch.id);
        return false;
      });
    }
    return true;
  });
}

function deleteSelectedFlowActions() {
  const state = flowState(selectedFlowStateId);
  if (!state) return false;
  const selectedIds = new Set([...selectedFlowActionIds, selectedFlowActionId].filter(Boolean));
  selectedIds.delete("start");
  selectedIds.delete("return");
  if (!selectedIds.size) return false;
  const beforeIds = flattenedFlowActionIds(state.actions || []);
  const firstDeletedIndex = beforeIds.findIndex((id) => selectedIds.has(id));
  if (firstDeletedIndex < 0) return false;
  const removedIds = [];
  pushFlowHistory();
  state.actions = removeSelectedFlowActionsFromList(state.actions || [], selectedIds, removedIds);
  const afterIds = flattenedFlowActionIds(state.actions || []);
  const nextId = afterIds[Math.min(firstDeletedIndex, afterIds.length - 1)] || afterIds[firstDeletedIndex - 1] || "";
  setFlowActionSelection(nextId ? [nextId] : []);
  renderFlowTool();
  return removedIds.length > 0;
}

function flowStateIdsForDelete() {
  const ids = new Set();
  if (flowNodeDepth === "moments" && !selectedFlowActionId) {
    for (const id of selectedFlowActionIds) ids.add(id);
  }
  if (selectedFlowStateId) ids.add(selectedFlowStateId);
  return [...ids].filter((id) => id && id !== "lobby" && id !== "intro" && flowState(id));
}

function deleteSelectedFlowStates() {
  const stateIds = flowStateIdsForDelete();
  if (!stateIds.length) return false;
  const stateIdSet = new Set(stateIds);
  const firstDeletedIndex = gameFlow.states.findIndex((state) => stateIdSet.has(state.id));
  pushFlowHistory();
  gameFlow.states = gameFlow.states.filter((state) => !stateIdSet.has(state.id));
  clearMomentGraphTargetReferences(stateIds);
  for (const stateId of stateIds) removeDeletedFlowStateFromLayouts(stateId);
  selectedFlowStateId = gameFlow.states[Math.min(firstDeletedIndex, gameFlow.states.length - 1)]?.id
    || gameFlow.states[firstDeletedIndex - 1]?.id
    || gameFlow.states[0]?.id
    || "";
  clearFlowActionSelection();
  expandFlowStateInList(selectedFlowStateId);
  renderFlowTool();
  if (!layoutScreen.classList.contains("hidden")) renderLayoutTool();
  return true;
}

function deleteSelectedFlowRouteNode() {
  if (flowNodeDepth !== "moments" || !selectedFlowRouteNodeId) return false;
  const nodes = flowRouteNodes();
  const routeNode = nodes.find((node) => node.id === selectedFlowRouteNodeId) || null;
  if (!routeNode) {
    clearFlowRouteNodeSelection();
    return false;
  }
  if (selectedFlowRouteBranchId) {
    const targetField = flowRouteBranchTargetField();
    const branch = decisionBranchById(routeNode, selectedFlowRouteBranchId, { targetField });
    if (!branch) {
      selectedFlowRouteBranchId = "";
      renderFlowTool();
      return true;
    }
    if (branch.type === "noMatch") return true;
    pushFlowHistory();
    routeNode.branches = ensureDecisionBranches(routeNode, { targetField }).filter((item) => item.id !== selectedFlowRouteBranchId);
    ensureDecisionBranches(routeNode, { targetField });
    selectedFlowRouteBranchId = "";
    renderFlowTool();
    return true;
  }
  pushFlowHistory();
  clearMomentGraphTargetReferences(selectedFlowRouteNodeId);
  gameFlow.routeNodes = nodes.filter((node) => node.id !== selectedFlowRouteNodeId);
  clearFlowRouteNodeSelection();
  renderFlowTool();
  return true;
}

function deleteFlowItem() {
  if (!selectedFlowStateId && !selectedFlowRouteNodeId) return;
  if (deleteSelectedFlowRouteNode()) return;
  if (flowNodeDepth === "moments" && !selectedFlowActionId && selectedFlowActionIds.size) {
    if (deleteSelectedFlowStates()) return;
  }
  if (selectedFlowActionId || selectedFlowActionIds.size) {
    if (deleteSelectedFlowActions()) return;
    clearFlowActionSelection();
    renderFlowTool();
    return;
  }
  deleteSelectedFlowStates();
}

async function saveGameFlow() {
  const result = await postJson("/api/game-flow", { flow: serializeGameFlowForSave(gameFlow) });
  gameFlow = result.flow;
  flowSavedSnapshot = JSON.stringify(serializeGameFlowForSave(gameFlow));
  updateFlowStorageStatus(result.storage);
  selectedFlowStateId = gameFlow.states.find((state) => state.id === selectedFlowStateId)?.id || gameFlow.states[0]?.id || "";
  repairSelectedFlowRouteBranch();
  clearFlowActionSelection();
  expandFlowStateInList(selectedFlowStateId);
  renderFlowTool();
}

function revertGameFlow() {
  if (!flowSavedSnapshot) return;
  gameFlow = JSON.parse(flowSavedSnapshot);
  getFlowHistoryManager().clear();
  selectedFlowStateId = flowState(selectedFlowStateId)?.id || gameFlow.states[0]?.id || "";
  repairSelectedFlowRouteBranch();
  clearFlowActionSelection();
  expandFlowStateInList(selectedFlowStateId);
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
    clearFlowRouteNodeSelection();
    clearFlowActionSelection();
    renderFlowTool();
  });
  flowNodeStage?.addEventListener("pointerdown", startFlowNodeMarquee);
  flowNodeStage?.addEventListener("pointermove", handleFlowNodePointerMove);
  flowNodeStage?.addEventListener("wheel", handleFlowNodeWheel, { passive: false });
  flowNodeStage?.addEventListener("scroll", renderFlowNodeMinimap);
  flowNodeMinimap?.addEventListener("pointerdown", startFlowNodeMinimapDrag);
  flowNodeMinimap?.addEventListener("click", jumpFlowNodeMinimap);
  flowNodeStage?.addEventListener("click", (event) => {
    if (flowNodeStage.dataset.skipConnectionClick !== "true") return;
    event.preventDefault();
    event.stopImmediatePropagation();
    delete flowNodeStage.dataset.skipConnectionClick;
  }, true);
  flowNodeStage?.addEventListener("pointerup", (event) => {
    const targetNode = flowNodeAtPointer(event);
    let completedConnection = false;
    if (targetNode) {
      completedConnection = completeNodeConnection(targetNode);
    } else if (shouldCreateActionFromPendingConnection(event)) {
      completedConnection = createActionFromPendingConnection(event);
    }
    if (completedConnection) {
      event.preventDefault();
      event.stopPropagation();
      flowNodeStage.dataset.skipConnectionClick = "true";
      window.setTimeout(() => {
        delete flowNodeStage.dataset.skipConnectionClick;
      }, 0);
    }
    clearPendingFlowNodeConnection();
  });
  setupFlowResizer();
  window.addEventListener("keydown", handleFlowHotkeys);
  try {
    await loadStageLayouts();
    await loadHostAudios({ silent: true });
    await loadGameFlow();
  } catch (error) {
    flowEditorTitle.textContent = "Flow Tool Offline";
    flowEditorHelp.textContent = error.message;
  }
}
