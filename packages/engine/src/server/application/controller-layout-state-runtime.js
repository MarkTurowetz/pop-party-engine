const {
  layoutTextArtCompositionId
} = require("../../shared/layout-text-art");
const {
  controllerLayoutStateIds
} = require("../../shared/controller-layout-states");

function createControllerLayoutStateRuntime() {
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
            "controllerPresentationMessage",
            "Presentation Message",
            195,
            300,
            330,
            150,
            "Tap Next to continue",
            38
          ),
          {
            id: "controllerPresentationButtonContainer",
            name: "Presentation Button Container",
            selector: "#controllerPresentationButtonContainer",
            kind: "art",
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
            id: "controllerTextSubmitButtonContainer",
            name: "Text Submit Button Container",
            selector: "#controllerTextSubmitButtonContainer",
            kind: "art",
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
            id: "controllerVoiceButtonContainer",
            name: "Voice Record Button Container",
            selector: "#controllerVoiceButtonContainer",
            kind: "art",
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
            id: "controllerMicAccessButtonContainer",
            name: "Microphone Access Button Container",
            selector: "#controllerMicAccessButtonContainer",
            kind: "art",
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
          layoutText("controllerPausedMessage", "Paused Message", 195, 330, 330, 150, "Game Paused", 44),
          {
            id: "controllerPausedButtonContainer",
            name: "Paused Button Container",
            selector: "#controllerPausedButtonContainer",
            kind: "art",
            x: 195,
            y: 470,
            width: 280,
            height: 82,
            scale: 1,
            defaultAnimationState: on
          }
        ]
      }
    ];
  }

  return { createControllerInputLayoutStates: controllerInputLayoutStates };
}

module.exports = { createControllerLayoutStateRuntime };
