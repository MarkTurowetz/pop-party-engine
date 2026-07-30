"use strict";

const { createFlowActionRegistry } = require("../shared/flow-action-registry");

function createFlowActionPublicRuntime({
  availableFlowTransitions,
  cleanChoiceOptions,
  flowActionTypeMeta,
  normalizeCharacterLimit,
  normalizeChoiceInputMode,
  normalizeConstantInteger,
  normalizeDecisionBranches,
  normalizeDecisionValueType,
  normalizeFlowVariableName,
  normalizeHostAudioPlayMode = (value) => (value === "sequence" || value === "index" ? value : "random"),
  normalizeLineIndex = (value) => Math.max(0, Math.floor(Number(value || 0) || 0)),
  normalizePlayerFilter,
  readHostAudios = () => ({ hostAudios: [] }),
  resolveHostAudioAction = (room, action) => action,
  normalizeVotingCardFilter,
  pluginActionDefinitions = []
}) {
  const actionRegistry = createFlowActionRegistry({
    availableFlowTransitions,
    cleanChoiceOptions,
    flowActionTarget: (value) => String(value || ""),
    normalizeTextTarget: (value) => String(value || "presentation"),
    cleanFlowText: (value, fallback = "") => String(value || fallback),
    normalizeCharacterLimit,
    normalizeChoiceInputMode,
    normalizeConstantInteger,
    normalizeDecisionBranches,
    normalizeDecisionValueType,
    normalizeFlowId: (value, fallback = "") => String(value || fallback),
    normalizeFlowVariableName,
    normalizeHostAudioPlayMode,
    normalizeLineIndex,
    normalizePlayerFilter,
    normalizeVotingCardFilter
  }, pluginActionDefinitions);

  function publicFlowAction(action, index) {
    if (!action) return null;
    const timing = action.timing || { mode: "E+", seconds: 0 };
    const base = {
      index,
      id: action.id,
      name: action.name,
      actionType: action.type,
      category: action.category || flowActionTypeMeta(action.type).category,
      timing,
      nextTargetActionId: action.nextTargetActionId || "",
      nextTargetNodeId: action.nextTargetNodeId || "",
      routeNodeId: action.routeNodeId || "",
      routeNodeType: action.routeNodeType || "",
      subActions: (action.subActions || []).map((subAction, subActionIndex) => publicFlowAction(subAction, subActionIndex)).filter(Boolean)
    };
    return actionRegistry.publicAction(action, base);
  }

  function resolveRoomActionText(action, room) {
    if (!action) return null;
    const resolved = {
      ...action,
      text: typeof action.text === "string" ? action.text.replaceAll("<ROUND_NUMBER>", roundNumberWord(room.currentRound || 1)) : action.text,
      prompt: typeof action.prompt === "string" ? action.prompt.replaceAll("<ROUND_NUMBER>", roundNumberWord(room.currentRound || 1)) : action.prompt,
      options: Array.isArray(action.options) ? action.options.map((option) => String(option).replaceAll("<ROUND_NUMBER>", roundNumberWord(room.currentRound || 1))) : action.options,
      subActions: (action.subActions || []).map((subAction) => resolveRoomActionText(subAction, room)).filter(Boolean)
    };
    if (resolved.type === "revealPlayerAnswerCorrectness") {
      resolved.answerCorrectness = {
        correctPlayerIds: [...(room.playerAnswerGroups?.correct || [])],
        incorrectPlayerIds: [...(room.playerAnswerGroups?.wrong || [])]
      };
    }
    if (resolved.type === "playHostAudio") {
      return resolveHostAudioAction(room, resolved, readHostAudios(room));
    }
    return resolved;
  }

  function roundNumberWord(value) {
    const number = Math.max(1, Math.floor(Number(value) || 1));
    const words = ["Zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve"];
    if (number < words.length) return words[number];
    return String(number);
  }

  return {
    publicFlowAction,
    resolveRoomActionText
  };
}

module.exports = { createFlowActionPublicRuntime };
