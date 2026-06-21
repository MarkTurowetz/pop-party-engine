function createStageLayoutStateRuntime({
  flowStateHasActionType,
  isCraftingStateId,
  isRoundIntroStateId,
  normalizeFlowId
}) {
  function createLayoutStateForFlowState(flowState) {
    if (isRoundIntroStateId(flowState.id)) {
      return {
        id: flowState.id,
        name: flowState.name || "Round Intro",
        elements: [
          { id: "roundIntroText", name: "Round Intro Text Field", selector: "#roundIntroText", kind: "text", x: 960, y: 430, width: 1100, height: 180, scale: 1 },
          { id: "roundIntroInfoText", name: "Round Intro Info Text Field", selector: "#roundIntroInfoText", kind: "text", x: 960, y: 610, width: 980, height: 105, scale: 1 }
        ]
      };
    }
    const textElementId = normalizeFlowId(`${flowState.id}-moment-text`, `${flowState.id}-moment-text`);
    const elements = [
      {
        id: textElementId,
        name: `${flowState.name || "Moment"} Text Field`,
        selector: `#${textElementId}`,
        kind: "text",
        x: 960,
        y: 460,
        width: 980,
        height: 240,
        scale: 1
      }
    ];
    if (isCraftingStateId(flowState.id) || flowStateHasActionType(flowState, "setTimerShown") || flowStateHasActionType(flowState, "startCraftingTimer")) {
      elements.push({
        id: "craftingTimer",
        name: "Crafting Timer",
        selector: "#craftingTimer",
        kind: "art",
        x: 1660,
        y: 185,
        width: 190,
        height: 190,
        scale: 1
      });
    }
    return {
      id: flowState.id,
      name: flowState.name || flowState.id,
      elements
    };
  }

  return { createLayoutStateForFlowState };
}

module.exports = { createStageLayoutStateRuntime };
