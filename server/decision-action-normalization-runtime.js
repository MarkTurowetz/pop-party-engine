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

  function normalizeDecisionBranch(branch, index) {
    const type = normalizeDecisionBranchType(branch?.type);
    const fallbackId = type === "noMatch" ? "no-match" : `branch-${index + 1}`;
    return {
      id: normalizeFlowId(branch?.id, fallbackId),
      type,
      value: cleanFlowText(branch?.value, type === "hit" ? "0" : ""),
      code: cleanFlowText(branch?.code, type === "code" ? "x < 3" : ""),
      targetActionId: flowActionTarget(branch?.targetActionId)
    };
  }

  function normalizeDecisionBranches(action) {
    const sourceBranches = Array.isArray(action?.branches) && action.branches.length
      ? action.branches
      : [
          {
            id: "legacy-hit",
            type: "code",
            code: `x ${normalizeDecisionOperator(action?.operator)} ${cleanFlowText(action?.compareValue, "3")}`,
            value: cleanFlowText(action?.compareValue, "3"),
            targetActionId: action?.trueTargetActionId
          },
          {
            id: "no-match",
            type: "noMatch",
            targetActionId: action?.falseTargetActionId
          }
        ];
    const branches = sourceBranches.map(normalizeDecisionBranch).filter(Boolean);
    const regularBranches = branches.filter((branch) => branch.type !== "noMatch");
    const noMatch = branches.find((branch) => branch.type === "noMatch")
      || normalizeDecisionBranch({ id: "no-match", type: "noMatch", targetActionId: action?.falseTargetActionId }, regularBranches.length);
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
