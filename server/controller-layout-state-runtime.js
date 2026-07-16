const {
  layoutTextArtCompositionId
} = require("../shared/layout-text-art");
const {
  controllerLayoutStateIds
} = require("../shared/controller-layout-states");

function createControllerLayoutStateRuntime({
  flowStateHasActionType,
  isCraftingStateId,
  normalizeFlowId
}) {
  const on = "On";
  const off = "Off";

  function layoutText(id, name, x, y, width, height, defaultText, fontSize, defaultAnimationState = on) {
    return {
      id,
      name,
      kind: "art",
      artCompositionId: layoutTextArtCompositionId,
      x,
      y,
      width,
      height,
      scale: 1,
      defaultAnimationState,
      defaultText,
      fontSize,
      autoFitText: false,
      fontColor: "#17131f"
    };
  }

  function controllerInputLayoutStates() {
    const choicePrompt = (defaultText) => layoutText(
      "controllerChoicePrompt", "Choice Prompt", 195, 180, 330, 120, defaultText, 32
    );
    const choiceGrid = {
      id: "controllerChoiceGrid",
      name: "Choice Buttons",
      selector: "#controllerChoiceGrid",
      kind: "art",
      x: 195,
      y: 485,
      width: 330,
      height: 420,
      scale: 1,
      defaultAnimationState: on
    };
    const choiceDone = layoutText(
      "controllerChoiceDone", "Choice Done Text", 195, 420, 330, 150, "You chose:", 34, off
    );
    const textPrompt = (defaultText) => layoutText(
      "controllerTextPrompt", "Input Prompt", 195, 170, 330, 92, defaultText, 32
    );
    const invalidBanner = {
      id: "controllerInvalidBanner",
      name: "Invalid Submission Banner",
      selector: "#controllerInvalidBanner",
      kind: "art",
      artCompositionId: "controller-invalid-banner",
      x: 195,
      y: 245,
      width: 330,
      height: 64,
      scale: 1,
      defaultAnimationState: off
    };
    const doneMessage = (defaultText) => layoutText(
      "controllerTextDone", "Input Done Message", 195, 410, 330, 150, defaultText, 34, off
    );

    return [
      {
        id: controllerLayoutStateIds.presentation,
        name: "Presentation",
        elements: [
          layoutText(
            "controllerGlobalActionMessage",
            "Presentation Message",
            195,
            300,
            330,
            150,
            "Tap Next to continue",
            38
          ),
          {
            id: "controllerGlobalActionButton",
            name: "Presentation Button",
            selector: "#controllerGlobalActionButton",
            kind: "art",
            artCompositionId: "controller-primary-button",
            x: 195,
            y: 470,
            width: 280,
            height: 82,
            scale: 1,
            defaultAnimationState: on
          }
        ]
      },
      {
        id: controllerLayoutStateIds.multipleChoice,
        name: "Multiple Choice",
        elements: [
          choicePrompt("Answer this question by tapping an answer"),
          { ...choiceGrid },
          { ...choiceDone }
        ]
      },
      {
        id: controllerLayoutStateIds.voting,
        name: "Voting",
        elements: [
          choicePrompt("Vote for your favorite answer"),
          { ...choiceGrid },
          { ...choiceDone, defaultText: "You voted for:" }
        ]
      },
      {
        id: controllerLayoutStateIds.textInput,
        name: "Text Input",
        elements: [
          textPrompt("Write your answer"),
          { ...invalidBanner },
          {
            id: "controllerTextInput",
            name: "Text Input Field",
            selector: "#controllerTextInput",
            kind: "art",
            artCompositionId: "controller-text-input-field",
            x: 195,
            y: 360,
            width: 330,
            height: 128,
            scale: 1,
            defaultAnimationState: on
          },
          {
            id: "controllerTextSubmitButton",
            name: "Text Submit Button",
            selector: "#controllerTextSubmitButton",
            kind: "art",
            artCompositionId: "controller-primary-button",
            x: 195,
            y: 475,
            width: 300,
            height: 70,
            scale: 1,
            defaultAnimationState: on
          },
          doneMessage("You wrote:")
        ]
      },
      {
        id: controllerLayoutStateIds.voiceInput,
        name: "Voice Input",
        elements: [
          textPrompt("Say your answer"),
          { ...invalidBanner },
          {
            id: "controllerVoiceButton",
            name: "Voice Record Button",
            selector: "#controllerVoiceButton",
            kind: "art",
            artCompositionId: "controller-primary-button",
            x: 195,
            y: 390,
            width: 300,
            height: 110,
            scale: 1,
            defaultAnimationState: on
          },
          layoutText("controllerVoiceStatus", "Voice Status", 195, 510, 330, 64, "Tap to record", 22),
          doneMessage("You said:")
        ]
      },
      {
        id: controllerLayoutStateIds.microphoneAccess,
        name: "Microphone Access",
        elements: [
          layoutText(
            "controllerMicAccessPrompt",
            "Microphone Access Prompt",
            195,
            190,
            330,
            150,
            "Give microphone access to the game",
            34
          ),
          {
            id: "controllerMicAccessButton",
            name: "Microphone Access Button",
            selector: "#controllerMicAccessButton",
            kind: "art",
            artCompositionId: "controller-primary-button",
            x: 195,
            y: 430,
            width: 280,
            height: 82,
            scale: 1,
            defaultAnimationState: on
          },
          layoutText(
            "controllerMicAccessStatus",
            "Microphone Access Status",
            195,
            540,
            330,
            80,
            "Chrome will ask for microphone permission",
            22
          )
        ]
      },
      {
        id: controllerLayoutStateIds.paused,
        name: "Paused",
        elements: [
          layoutText("controllerGlobalActionMessage", "Paused Message", 195, 330, 330, 150, "Game Paused", 44),
          {
            id: "controllerGlobalActionButton",
            name: "Paused Action Button",
            selector: "#controllerGlobalActionButton",
            kind: "art",
            artCompositionId: "controller-primary-button",
            x: 195,
            y: 470,
            width: 280,
            height: 82,
            scale: 1,
            defaultAnimationState: off
          }
        ]
      }
    ];
  }

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
            kind: "art",
            artCompositionId: layoutTextArtCompositionId,
            x: 195,
            y: 190,
            width: 330,
            height: 150,
            scale: 1,
            defaultText: "Give microphone access to the game",
            fontSize: 34,
            autoFitText: false,
            fontColor: "#17131f"
          },
          {
            id: "controllerMicAccessButton",
            name: "Microphone Access Button",
            selector: "#controllerMicAccessButton",
            kind: "art",
            artCompositionId: "controller-primary-button",
            x: 195,
            y: 430,
            width: 280,
            height: 82,
            scale: 1,
            defaultAnimationState: "On"
          },
          {
            id: "controllerMicAccessStatus",
            name: "Microphone Access Status",
            kind: "art",
            artCompositionId: layoutTextArtCompositionId,
            x: 195,
            y: 540,
            width: 330,
            height: 80,
            scale: 1,
            defaultText: "Chrome will ask for microphone permission",
            fontSize: 22,
            autoFitText: false,
            fontColor: "#17131f"
          }
        );
      }
      if (shouldSeedChoiceInput) {
        elements.push(
          {
            id: "controllerChoicePrompt",
            name: "Choice Prompt",
            kind: "art",
            artCompositionId: layoutTextArtCompositionId,
            x: 195,
            y: 180,
            width: 330,
            height: 120,
            scale: 1,
            defaultText: "Answer this question by tapping an answer",
            fontSize: 32,
            autoFitText: false,
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
            kind: "art",
            artCompositionId: layoutTextArtCompositionId,
            x: 195,
            y: 420,
            width: 330,
            height: 150,
            scale: 1,
            defaultText: "You chose:",
            fontSize: 34,
            autoFitText: false,
            fontColor: "#17131f"
          }
        );
      }
      if (shouldSeedTextInput) {
        elements.push(
          {
            id: "controllerTextPrompt",
            name: "Text Input Prompt",
            kind: "art",
            artCompositionId: layoutTextArtCompositionId,
            x: 195,
            y: 170,
            width: 330,
            height: 92,
            scale: 1,
            defaultText: "Write your answer",
            fontSize: 32,
            autoFitText: false,
            fontColor: "#17131f"
          },
          {
            id: "controllerInvalidBanner",
            name: "Invalid Submission Banner",
            selector: "#controllerInvalidBanner",
            kind: "art",
            artCompositionId: "controller-invalid-banner",
            x: 195,
            y: 245,
            width: 330,
            height: 64,
            scale: 1,
            defaultAnimationState: "On"
          },
          {
            id: "controllerTextInput",
            name: "Text Input Field",
            selector: "#controllerTextInput",
            kind: "art",
            artCompositionId: "controller-text-input-field",
            x: 195,
            y: 360,
            width: 330,
            height: 128,
            scale: 1,
            defaultAnimationState: "On"
          },
          {
            id: "controllerTextSubmitButton",
            name: "Text Submit Button",
            selector: "#controllerTextSubmitButton",
            kind: "art",
            artCompositionId: "controller-primary-button",
            x: 195,
            y: 475,
            width: 300,
            height: 70,
            scale: 1,
            defaultAnimationState: "On"
          },
          {
            id: "controllerVoiceButton",
            name: "Voice Record Button",
            selector: "#controllerVoiceButton",
            kind: "art",
            artCompositionId: "controller-primary-button",
            x: 195,
            y: 390,
            width: 300,
            height: 110,
            scale: 1,
            defaultAnimationState: "On"
          },
          {
            id: "controllerVoiceStatus",
            name: "Voice Status",
            kind: "art",
            artCompositionId: layoutTextArtCompositionId,
            x: 195,
            y: 510,
            width: 330,
            height: 64,
            scale: 1,
            defaultText: "Tap to record",
            fontSize: 22,
            autoFitText: false,
            fontColor: "#17131f"
          },
          {
            id: "controllerTextDone",
            name: "Text Done Message",
            kind: "art",
            artCompositionId: layoutTextArtCompositionId,
            x: 195,
            y: 410,
            width: 330,
            height: 150,
            scale: 1,
            defaultText: "You wrote:",
            fontSize: 34,
            autoFitText: false,
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
          kind: "art",
          artCompositionId: layoutTextArtCompositionId,
          x: 195,
          y: 250,
          width: 330,
          height: 140,
          scale: 1,
          defaultText: flowState.name || "Controller View",
          fontSize: 42,
          autoFitText: false,
          fontColor: "#17131f"
        }
      ]
    };
  }

  return { createControllerInputLayoutStates: controllerInputLayoutStates, createControllerLayoutStateForFlowState };
}

module.exports = { createControllerLayoutStateRuntime };
