function createControllerLayoutStateRuntime({
  flowStateHasActionType,
  isCraftingStateId,
  normalizeFlowId
}) {
  function createControllerLayoutStateForFlowState(flowState) {
    const shouldSeedChoiceInput = isCraftingStateId(flowState.id) || flowStateHasActionType(flowState, "multipleChoiceInput");
    const shouldSeedTextInput = isCraftingStateId(flowState.id)
      || flowStateHasActionType(flowState, "textSubmissionInput")
      || flowStateHasActionType(flowState, "voiceSubmissionInput");
    const shouldSeedMicrophoneAccess = flowStateHasActionType(flowState, "requestMicrophoneAccessInput");
    if (shouldSeedChoiceInput || shouldSeedTextInput || shouldSeedMicrophoneAccess) {
      const elements = [];
      if (shouldSeedMicrophoneAccess) {
        elements.push(
          {
            id: "controllerMicAccessPrompt",
            name: "Microphone Access Prompt",
            selector: "#controllerMicAccessPrompt",
            kind: "text",
            x: 195,
            y: 190,
            width: 330,
            height: 150,
            scale: 1,
            defaultText: "Give microphone access to the game",
            fontSize: 34,
            autoFitText: true,
            fontColor: "#17131f"
          },
          {
            id: "controllerMicAccessButton",
            name: "Microphone Access Button",
            selector: "#controllerMicAccessButton",
            kind: "art",
            x: 195,
            y: 430,
            width: 280,
            height: 82,
            scale: 1
          },
          {
            id: "controllerMicAccessStatus",
            name: "Microphone Access Status",
            selector: "#controllerMicAccessStatus",
            kind: "text",
            x: 195,
            y: 540,
            width: 330,
            height: 80,
            scale: 1,
            defaultText: "Chrome will ask for microphone permission",
            fontSize: 22,
            autoFitText: true,
            fontColor: "#17131f"
          }
        );
      }
      if (shouldSeedChoiceInput) {
        elements.push(
          {
            id: "controllerChoicePrompt",
            name: "Choice Prompt",
            selector: "#controllerChoicePrompt",
            kind: "text",
            x: 195,
            y: 180,
            width: 330,
            height: 120,
            scale: 1,
            defaultText: "Answer this question by tapping an answer",
            fontSize: 32,
            autoFitText: true,
            fontColor: "#17131f"
          },
          {
            id: "controllerChoiceGrid",
            name: "Choice Buttons",
            selector: "#controllerChoiceGrid",
            kind: "art",
            x: 195,
            y: 485,
            width: 330,
            height: 420,
            scale: 1
          },
          {
            id: "controllerChoiceDone",
            name: "Choice Done Text",
            selector: "#controllerChoiceDone",
            kind: "text",
            x: 195,
            y: 420,
            width: 330,
            height: 150,
            scale: 1,
            defaultText: "You chose:",
            fontSize: 34,
            autoFitText: true,
            fontColor: "#17131f"
          }
        );
      }
      if (shouldSeedTextInput) {
        elements.push(
          {
            id: "controllerTextPrompt",
            name: "Text Input Prompt",
            selector: "#controllerTextPrompt",
            kind: "text",
            x: 195,
            y: 170,
            width: 330,
            height: 92,
            scale: 1,
            defaultText: "Write your answer",
            fontSize: 32,
            autoFitText: true,
            fontColor: "#17131f"
          },
          {
            id: "controllerInvalidBanner",
            name: "Invalid Submission Banner",
            selector: "#controllerInvalidBanner",
            kind: "art",
            x: 195,
            y: 245,
            width: 330,
            height: 64,
            scale: 1
          },
          {
            id: "controllerTextInput",
            name: "Text Input Field",
            selector: "#controllerTextInput",
            kind: "art",
            x: 195,
            y: 360,
            width: 330,
            height: 128,
            scale: 1
          },
          {
            id: "controllerTextSubmitButton",
            name: "Text Submit Button",
            selector: "#controllerTextSubmitButton",
            kind: "art",
            x: 195,
            y: 475,
            width: 300,
            height: 70,
            scale: 1
          },
          {
            id: "controllerVoiceButton",
            name: "Voice Record Button",
            selector: "#controllerVoiceButton",
            kind: "art",
            x: 195,
            y: 390,
            width: 300,
            height: 110,
            scale: 1
          },
          {
            id: "controllerVoiceStatus",
            name: "Voice Status",
            selector: "#controllerVoiceStatus",
            kind: "text",
            x: 195,
            y: 510,
            width: 330,
            height: 64,
            scale: 1,
            defaultText: "Tap to record",
            fontSize: 22,
            autoFitText: true,
            fontColor: "#17131f"
          },
          {
            id: "controllerTextDone",
            name: "Text Done Message",
            selector: "#controllerTextDone",
            kind: "text",
            x: 195,
            y: 410,
            width: 330,
            height: 150,
            scale: 1,
            defaultText: "You wrote:",
            fontSize: 34,
            autoFitText: true,
            fontColor: "#17131f"
          }
        );
      }
      return {
        id: flowState.id,
        name: flowState.name || "Crafting",
        elements
      };
    }
    const textElementId = normalizeFlowId(`${flowState.id}-controller-text`, `${flowState.id}-controller-text`);
    return {
      id: flowState.id,
      name: flowState.name || flowState.id,
      elements: [
        {
          id: textElementId,
          name: `${flowState.name || "Controller"} Text Field`,
          selector: `#${textElementId}`,
          kind: "text",
          x: 195,
          y: 250,
          width: 330,
          height: 140,
          scale: 1,
          defaultText: flowState.name || "Controller View",
          fontSize: 42,
          autoFitText: true,
          fontColor: "#17131f"
        }
      ]
    };
  }

  return { createControllerLayoutStateForFlowState };
}

module.exports = { createControllerLayoutStateRuntime };
