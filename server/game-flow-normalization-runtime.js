"use strict";

const { createFlowActionRegistry } = require("../shared/flow-action-registry");

function createGameFlowNormalizationRuntime({
  availableFlowActionTypes,
  availableFlowTransitions,
  cleanChoiceOptions,
  cleanFlowText,
  defaultGameFlow,
  flowActionTarget,
  normalizeCharacterLimit,
  normalizeChoiceInputMode,
  normalizeConstantInteger,
  normalizeDecisionBranches,
  normalizeDecisionValueType,
  normalizeFlowId,
  normalizeFlowVariableName,
  normalizeHostAudioPlayMode = (value) => (value === "sequence" || value === "index" ? value : "random"),
  normalizeLineIndex = (value) => Math.max(0, Math.floor(Number(value || 0) || 0)),
  normalizePlayerFilter,
  normalizeVotingCardFilter
}) {
  const actionRegistry = createFlowActionRegistry({
    availableFlowTransitions,
    cleanChoiceOptions,
    cleanFlowText,
    flowActionTarget,
    normalizeCharacterLimit,
    normalizeChoiceInputMode,
    normalizeConstantInteger,
    normalizeDecisionBranches,
    normalizeDecisionValueType,
    normalizeFlowId,
    normalizeFlowVariableName,
    normalizeHostAudioPlayMode,
    normalizeLineIndex,
    normalizePlayerFilter,
    normalizeTextTarget,
    normalizeVotingCardFilter
  });

  function normalizeGameFlow(flow) {
    const incomingStates = Array.isArray(flow?.states) ? flow.states : defaultGameFlow.states;
    const states = incomingStates.map((state, stateIndex) => {
      const fallbackStateId = stateIndex === 0 ? "lobby" : `state-${stateIndex + 1}`;
      const id = normalizeFlowId(state.id || state.name, fallbackStateId);
      const actions = Array.isArray(state.actions) ? state.actions : [];
      return {
        id,
        name: cleanFlowText(state.name, id),
        nodePosition: normalizeNodePosition(state.nodePosition, stateIndex),
        startNodePosition: normalizeNodePosition(state.startNodePosition, 0),
        returnNodePosition: normalizeNodePosition(state.returnNodePosition, 0),
        entryTargetActionId: flowActionTarget(state.entryTargetActionId),
        nextStateTargetId: normalizeFlowId(state.nextStateTargetId, ""),
        actions: actions.map((action, actionIndex) => normalizeFlowAction(action, actionIndex, id)).filter(Boolean)
      };
    });
    if (!states.some((state) => state.id === "lobby")) {
      states.unshift(defaultGameFlow.states[0]);
    }
    const routeNodes = normalizeMomentRouteNodes(flow?.routeNodes, states);
    return { states, routeNodes };
  }

  function normalizeNodePosition(position, index = 0) {
    if (!position || typeof position !== "object") return null;
    const x = Number(position.x);
    const y = Number(position.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    return {
      x: Math.round(Math.max(-5000, Math.min(15000, x))),
      y: Math.round(Math.max(-5000, Math.min(15000, y)))
    };
  }

  function flowActionTypeMeta(type) {
    return actionRegistry.actionTypeMeta(type);
  }

  function normalizeMomentRouteNodes(routeNodes = [], states = []) {
    const knownStateIds = new Set((states || []).map((state) => state.id));
    if (!Array.isArray(routeNodes)) return [];
    return routeNodes.map((node, nodeIndex) => {
      const id = normalizeFlowId(node?.id || node?.name, `moment-entry-${nodeIndex + 1}`);
      const routeNodeType = node?.routeNodeType === "decision" ? "decision" : node?.routeNodeType === "action" ? "action" : "momentEntry";
      const fallbackName = routeNodeType === "decision" ? `Decision ${nodeIndex + 1}` : routeNodeType === "action" ? `Action ${nodeIndex + 1}` : `Moment Entry ${nodeIndex + 1}`;
      const targetStateId = normalizeFlowId(node?.targetStateId, "");
      const base = {
        id,
        routeNodeType,
        name: cleanFlowText(node?.name, fallbackName),
        nodePosition: normalizeNodePosition(node?.nodePosition, nodeIndex)
      };
      if (routeNodeType === "decision") {
        return {
          ...base,
          variable: cleanFlowText(node?.variable, "activePlayerCount"),
          valueType: normalizeDecisionValueType(node?.valueType),
          branches: normalizeDecisionBranches(node, { targetField: "targetNodeId" })
        };
      }
      if (routeNodeType === "action") {
        const normalizedAction = normalizeFlowAction(node, nodeIndex, "moment-route");
        return {
          ...normalizedAction,
          ...base,
          routeNodeType: "action",
          nextTargetNodeId: normalizeFlowId(node?.nextTargetNodeId || node?.nextTargetActionId, ""),
          subActions: normalizeSubActions(node?.subActions, "moment-route")
        };
      }
      return {
        ...base,
        targetStateId: knownStateIds.has(targetStateId) ? targetStateId : ""
      };
    }).filter((node) => node.id);
  }

  function normalizeFlowAction(action, actionIndex, stateId, isSubAction = false) {
    const requestedType = action?.type === "text" ? "displayText" : action?.type;
    const type = actionRegistry.hasActionType(requestedType) ? requestedType : "presentText";
    const category = flowActionTypeMeta(type).category;
    const fallbackId = `${stateId}-${isSubAction ? "sub-action" : "action"}-${actionIndex + 1}`;
    const base = {
      id: normalizeFlowId(action?.id || action?.name, fallbackId),
      name: cleanFlowText(action?.name, `Action ${actionIndex + 1}`),
      type,
      category,
      timing: normalizeActionTiming(action?.timing, category !== "input", isSubAction),
      nextTargetActionId: flowActionTarget(action?.nextTargetActionId),
      nodePosition: normalizeNodePosition(action?.nodePosition, actionIndex),
      subActions: normalizeSubActions(action?.subActions, stateId)
    };
    return actionRegistry.normalizeAction(type, action, base);
  }

  function normalizeTextTarget(value) {
    const target = normalizeFlowId(value || "presentation", "presentation");
    return target || "presentation";
  }

  function normalizeSubActions(subActions, stateId) {
    if (!Array.isArray(subActions)) return [];
    return subActions.map((subAction, subActionIndex) => normalizeFlowAction(subAction, subActionIndex, stateId, true)).filter(Boolean);
  }

  function normalizeActionTiming(timing, allowStartTiming = true, preferStartTiming = false) {
    const mode = preferStartTiming || (allowStartTiming && timing?.mode === "S+") ? "S+" : "E+";
    const rawSeconds = Number(timing?.seconds || 0);
    const seconds = Number(Math.max(0, Math.min(999, Number.isFinite(rawSeconds) ? rawSeconds : 0)).toFixed(2));
    return { mode, seconds };
  }

  return {
    flowActionTypeMeta,
    normalizeActionTiming,
    normalizeFlowAction,
    normalizeGameFlow,
    normalizeNodePosition,
    normalizeTextTarget
  };
}

module.exports = { createGameFlowNormalizationRuntime };
