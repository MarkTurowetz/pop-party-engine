"use strict";

function createDecisionRuntime({
  activePlayers,
  flowActionIndexById,
  gameConstants,
  isNoActionTarget,
  normalizeDecisionBranches,
  normalizeDecisionValueType
}) {
  function compareDecisionValues(leftValue, rightValue, valueType, operator) {
    let left = leftValue;
    let right = rightValue;
    if (valueType === "int") {
      left = Math.floor(Number(leftValue) || 0);
      right = Math.floor(Number(rightValue) || 0);
    } else if (valueType === "float") {
      left = Number(leftValue) || 0;
      right = Number(rightValue) || 0;
    } else if (valueType === "bool") {
      left = leftValue === true || String(leftValue).toLowerCase() === "true";
      right = rightValue === true || String(rightValue).toLowerCase() === "true";
    } else {
      left = String(leftValue || "");
      right = String(rightValue || "");
    }
    if (operator === "<") return left < right;
    if (operator === "<=") return left <= right;
    if (operator === "!=") return left !== right;
    if (operator === ">=") return left >= right;
    if (operator === ">") return left > right;
    return left === right;
  }

  function propertyPathValue(root, pathParts) {
    let value = root;
    for (const part of pathParts) {
      if (value == null) return undefined;
      const key = String(part || "");
      const lowerKey = key.toLowerCase();
      if (lowerKey === "count" || lowerKey === "length") {
        if (Array.isArray(value) || typeof value === "string") {
          value = value.length;
          continue;
        }
        if (value instanceof Map || value instanceof Set) {
          value = value.size;
          continue;
        }
      }
      if (Object.prototype.hasOwnProperty.call(Object(value), key)) {
        value = value[key];
        continue;
      }
      const matchingKey = Object.keys(Object(value)).find((item) => item.toLowerCase() === lowerKey);
      value = matchingKey ? value[matchingKey] : undefined;
    }
    return value;
  }

  function lookupDecisionRootValue(lookup, key) {
    if (Object.prototype.hasOwnProperty.call(lookup, key)) return lookup[key];
    const matchingKey = Object.keys(lookup).find((item) => item.toLowerCase() === String(key || "").toLowerCase());
    return matchingKey ? lookup[matchingKey] : undefined;
  }

  function decisionVariableValue(room, variable) {
    const key = String(variable || "activePlayerCount").trim();
    const constants = gameConstants(room);
    const active = activePlayers(room);
    const activeSessionKey = active.map((player) => player.id).sort().join("|");
    if (activeSessionKey !== room.playerSessionKey) {
      room.numSequentialGames = 0;
    }
    const lookup = {
      activePlayerCount: active.length,
      currentRound: room.currentRound || 1,
      numSequentialGames: room.numSequentialGames || 0,
      isFirstGameOfSession: constants.overrideFirstGameOfSession === true || Number(room.numSequentialGames || 0) === 0,
      gameTitle: constants.gameTitle,
      numberOfRounds: constants.numberOfRounds,
      randomChanceTest: constants.randomChanceTest,
      speechToTextSendInputBuffer: constants.speechToTextSendInputBuffer,
      craftingTimerDuration: constants.craftingTimerDuration,
      startGameCountdownDuration: constants.startGameCountdownDuration,
      pointsForCorrectAnswer: constants.pointsForCorrectAnswer,
      overrideFirstGameOfSession: constants.overrideFirstGameOfSession,
      players: active,
      playerColors: constants.playerColors,
      choiceInputAnswers: room.choiceInputAnswers,
      textInputAnswers: room.textInputAnswers,
      displayedPlayerAnswers: room.displayedPlayerAnswers,
      playerAnswerRecords: room.playerAnswerRecords,
      playerAnswerGroups: room.playerAnswerGroups,
      flowVariables: room.flowVariables,
      G: room.G || {},
      g: room.G || {}
    };
    const pathParts = key.split(".").filter(Boolean);
    const first = pathParts.shift();
    if (!first) return 0;
    if (first.toLowerCase() === "constants") return propertyPathValue(constants, pathParts);
    const lookupValue = lookupDecisionRootValue(lookup, first);
    if (lookupValue !== undefined) {
      return pathParts.length ? propertyPathValue(lookupValue, pathParts) : lookupValue;
    }
    const constantValue = lookupDecisionRootValue(constants, first);
    if (constantValue !== undefined) {
      return pathParts.length ? propertyPathValue(constantValue, pathParts) : constantValue;
    }
    return propertyPathValue({ ...lookup, constants }, [first, ...pathParts]) ?? 0;
  }

  function evaluateDecisionCode(code, x) {
    const expression = String(code || "").trim();
    if (!expression) return false;
    const match = expression.match(/^x\s*(===|==|!==|!=|<=|>=|<|>)\s*(.+)$/i);
    if (!match) return false;
    const [, operator, rawRight] = match;
    let valueType = "float";
    let right = rawRight.trim();
    if (/^true$/i.test(right) || /^false$/i.test(right)) {
      valueType = "bool";
      right = /^true$/i.test(right);
    } else if ((right.startsWith('"') && right.endsWith('"')) || (right.startsWith("'") && right.endsWith("'"))) {
      valueType = "string";
      right = right.slice(1, -1);
    } else if (!Number.isFinite(Number(right))) {
      valueType = "string";
    }
    const normalizedOperator = operator === "===" ? "==" : operator === "!==" ? "!=" : operator;
    return compareDecisionValues(x, right, valueType, normalizedOperator);
  }

  function evaluateDecisionBranch(branch, leftValue, valueType) {
    if (branch.type === "noMatch") return false;
    if (branch.type === "code") return evaluateDecisionCode(branch.code, leftValue);
    return compareDecisionValues(leftValue, branch.value, valueType, "==");
  }

  function evaluateDecisionAction(room, action, options = {}) {
    const targetField = options.targetField || "targetActionId";
    const resolveTarget = typeof options.resolveTarget === "function"
      ? options.resolveTarget
      : (target) => ({ targetIndex: flowActionIndexById(room, target) });
    const variable = action.variable || "activePlayerCount";
    const valueType = normalizeDecisionValueType(action.valueType);
    const leftValue = decisionVariableValue(room, variable);
    const branches = normalizeDecisionBranches(action, { targetField });
    const regularBranchResults = branches.filter((branch) => branch.type !== "noMatch").map((branch) => ({
      id: branch.id,
      type: branch.type,
      value: branch.value || "",
      code: branch.code || "",
      target: branch[targetField] || "",
      [targetField]: branch[targetField] || "",
      passed: evaluateDecisionBranch(branch, leftValue, valueType)
    }));
    const firstPassingRegular = regularBranchResults.find((branch) => branch.passed);
    const noMatchBranch = branches.find((branch) => branch.type === "noMatch") || null;
    const noMatchResult = noMatchBranch ? {
      id: noMatchBranch.id,
      type: noMatchBranch.type,
      value: noMatchBranch.value || "",
      code: noMatchBranch.code || "",
      target: noMatchBranch[targetField] || "",
      [targetField]: noMatchBranch[targetField] || "",
      passed: !firstPassingRegular
    } : null;
    const branchResults = noMatchResult ? [...regularBranchResults, noMatchResult] : regularBranchResults;
    const selectedBranchResult = firstPassingRegular || noMatchResult;
    const selectedBranch = branches.find((branch) => branch.id === selectedBranchResult?.id) || null;
    const target = selectedBranch?.[targetField] || "";
    const selectedTarget = target && !isNoActionTarget(target) ? String(target) : "none";
    const targetResolution = selectedTarget === "none" ? {} : resolveTarget(selectedTarget) || {};
    const targetIndex = Number.isInteger(targetResolution.targetIndex) ? targetResolution.targetIndex : null;
    return {
      actionId: action.id,
      actionName: action.name,
      variable,
      valueType,
      leftValue,
      selectedBranch: selectedBranch?.id || "",
      selectedBranchType: selectedBranch?.type || "",
      branchResults,
      selectedTarget,
      haltReason: selectedTarget === "none" ? "No Matching Branch" : "",
      targetField,
      targetIndex,
      targetResolution
    };
  }

  function resolveDecisionActionIndex(room, action) {
    const decision = evaluateDecisionAction(room, action);
    room.lastDecisionTrace = {
      ...decision,
      activePlayerCount: activePlayers(room).length,
      evaluatedAt: Date.now()
    };
    const target = decision.selectedTarget;
    if (isNoActionTarget(target)) return null;
    if (decision.targetIndex >= 0) return decision.targetIndex;
    return null;
  }

  return {
    compareDecisionValues,
    decisionVariableValue,
    evaluateDecisionAction,
    evaluateDecisionBranch,
    evaluateDecisionCode,
    lookupDecisionRootValue,
    propertyPathValue,
    resolveDecisionActionIndex
  };
}

module.exports = { createDecisionRuntime };
