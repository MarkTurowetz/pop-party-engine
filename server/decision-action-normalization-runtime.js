function createDecisionActionNormalizationRuntime({
  cleanFlowText,
  flowActionTarget,
  normalizeFlowId
}) {
  function normalizeDecisionOperator(value) {
    return ["<", "<=", "==", "!=", ">=", ">"].includes(value) ? value : "<";
  }

  function normalizeDecisionValueType(value) {
    return ["int", "float", "string", "bool"].includes(value) ? value : "int";
  }

  function normalizeDecisionBranchType(value) {
    return ["hit", "code", "noMatch"].includes(value) ? value : "hit";
  }

  function normalizeDecisionBranch(branch, index, options = {}) {
    const type = normalizeDecisionBranchType(branch?.type);
    const fallbackId = type === "noMatch" ? "no-match" : `branch-${index + 1}`;
    const targetField = options.targetField || "targetActionId";
    const targetActionId = flowActionTarget(branch?.targetActionId);
    const targetNodeId = flowActionTarget(branch?.targetNodeId);
    const targetValue = branch?.[targetField] ?? (targetField === "targetNodeId" ? branch?.targetActionId : "");
    const normalized = {
      id: normalizeFlowId(branch?.id, fallbackId),
      type,
      value: cleanFlowText(branch?.value, type === "hit" ? "0" : ""),
      code: cleanFlowText(branch?.code, type === "code" ? "x < 3" : ""),
      [targetField]: flowActionTarget(targetValue)
    };
    if (targetField !== "targetActionId" && targetActionId) normalized.targetActionId = targetActionId;
    if (targetField !== "targetNodeId" && targetNodeId) normalized.targetNodeId = targetNodeId;
    return normalized;
  }

  function normalizeDecisionBranches(action, options = {}) {
    const targetField = options.targetField || "targetActionId";
    const trueTargetField = options.trueTargetField || "trueTargetActionId";
    const falseTargetField = options.falseTargetField || "falseTargetActionId";
    const sourceBranches = Array.isArray(action?.branches) && action.branches.length
      ? action.branches
      : [
          {
            id: "legacy-hit",
            type: "code",
            code: `x ${normalizeDecisionOperator(action?.operator)} ${cleanFlowText(action?.compareValue, "3")}`,
            value: cleanFlowText(action?.compareValue, "3"),
            [targetField]: action?.[trueTargetField]
          },
          {
            id: "no-match",
            type: "noMatch",
            [targetField]: action?.[falseTargetField]
          }
        ];
    const branches = sourceBranches.map((branch, index) => normalizeDecisionBranch(branch, index, { targetField })).filter(Boolean);
    const regularBranches = branches.filter((branch) => branch.type !== "noMatch");
    const noMatch = branches.find((branch) => branch.type === "noMatch")
      || normalizeDecisionBranch({ id: "no-match", type: "noMatch", [targetField]: action?.[falseTargetField] }, regularBranches.length, { targetField });
    return [...regularBranches, noMatch];
  }

  return {
    normalizeDecisionBranches,
    normalizeDecisionBranchType,
    normalizeDecisionOperator,
    normalizeDecisionValueType
  };
}

module.exports = { createDecisionActionNormalizationRuntime };
