import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { controllerLayoutStateIds } = require("../shared/controller-layout-states");
const { createControllerLayoutStateRuntime } = require("./controller-layout-state-runtime");

function runtime() {
  return createControllerLayoutStateRuntime({
    flowStateHasActionType: () => false,
    isCraftingStateId: () => false,
    normalizeFlowId: (value, fallback) => String(value || fallback)
  });
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
});
