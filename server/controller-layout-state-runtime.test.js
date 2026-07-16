import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { controllerLayoutStateIds } = require("../shared/controller-layout-states");
const { createControllerLayoutStateRuntime } = require("./controller-layout-state-runtime");

function runtime() {
  return createControllerLayoutStateRuntime();
}

describe("controller layout state runtime", () => {
  it("seeds one reusable layout for each semantic controller input mode", () => {
    const states = runtime().createControllerInputLayoutStates();
    expect(states.map((state) => state.id)).toEqual([
      controllerLayoutStateIds.presentation,
      controllerLayoutStateIds.multipleChoice,
      controllerLayoutStateIds.voting,
      controllerLayoutStateIds.textInput,
      controllerLayoutStateIds.voiceInput,
      controllerLayoutStateIds.microphoneAccess,
      controllerLayoutStateIds.paused
    ]);
  });

  it("starts reactive messages Off while normal input controls start On", () => {
    const states = runtime().createControllerInputLayoutStates();
    const textState = states.find((state) => state.id === controllerLayoutStateIds.textInput);
    expect(textState.elements.find((element) => element.id === "controllerInvalidBanner").defaultAnimationState).toBe("Off");
    expect(textState.elements.find((element) => element.id === "controllerTextDone").defaultAnimationState).toBe("Off");
    expect(textState.elements.find((element) => element.id === "controllerTextInput").defaultAnimationState).toBe("On");
  });

  it("gives presentation and paused unique local action containers", () => {
    const states = runtime().createControllerInputLayoutStates();
    const presentation = states.find((state) => state.id === controllerLayoutStateIds.presentation);
    const paused = states.find((state) => state.id === controllerLayoutStateIds.paused);

    expect(presentation.elements.map((element) => element.id)).toEqual([
      "controllerPresentationMessage",
      "controllerPresentationButtonContainer"
    ]);
    expect(paused.elements.map((element) => element.id)).toEqual([
      "controllerPausedMessage",
      "controllerPausedButtonContainer"
    ]);
    expect(presentation.elements[1].artCompositionId).toBeUndefined();
    expect(paused.elements[1].artCompositionId).toBeUndefined();
  });

  it("gives text, voice, and microphone input their own local button containers", () => {
    const states = runtime().createControllerInputLayoutStates();
    const expectedContainers = new Map([
      [controllerLayoutStateIds.textInput, "controllerTextSubmitButtonContainer"],
      [controllerLayoutStateIds.voiceInput, "controllerVoiceButtonContainer"],
      [controllerLayoutStateIds.microphoneAccess, "controllerMicAccessButtonContainer"]
    ]);

    for (const [stateId, containerId] of expectedContainers) {
      const state = states.find((candidate) => candidate.id === stateId);
      const container = state.elements.find((element) => element.id === containerId);
      expect(container).toBeTruthy();
      expect(container.artCompositionId).toBeUndefined();
      expect(container.defaultAnimationState).toBe("On");
    }
  });
});
