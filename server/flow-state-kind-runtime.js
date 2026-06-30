function isRoundIntroStateId(stateId) {
  return String(stateId || "").includes("round-intro");
}

function isCraftingStateId(stateId) {
  return String(stateId || "").includes("crafting");
}

function flowStateHasActionType(flowState, type) {
  const stack = [...(flowState?.actions || [])];
  while (stack.length) {
    const action = stack.pop();
    if (action?.type === type) return true;
    stack.push(...(action?.actions || []));
    stack.push(...(action?.subActions || []));
  }
  return false;
}

module.exports = {
  flowStateHasActionType,
  isCraftingStateId,
  isRoundIntroStateId
};
