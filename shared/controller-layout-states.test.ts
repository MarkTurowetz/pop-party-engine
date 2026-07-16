import { describe, expect, it } from "vitest";
import {
  controllerChoiceLayoutStateId,
  controllerLayoutStateIds,
  controllerTextLayoutStateId,
  isSemanticControllerLayoutStateId
} from "./controller-layout-states";

describe("controller layout states", () => {
  it("routes choice and voting inputs to separate reusable layouts", () => {
    expect(controllerChoiceLayoutStateId("choice")).toBe(controllerLayoutStateIds.multipleChoice);
    expect(controllerChoiceLayoutStateId("vote")).toBe(controllerLayoutStateIds.voting);
  });

  it("routes text and voice inputs to separate reusable layouts", () => {
    expect(controllerTextLayoutStateId("text")).toBe(controllerLayoutStateIds.textInput);
    expect(controllerTextLayoutStateId("voice")).toBe(controllerLayoutStateIds.voiceInput);
    expect(controllerTextLayoutStateId("text", "voiceVip")).toBe(controllerLayoutStateIds.voiceInput);
  });

  it("identifies semantic input layout ids without treating phase ids as semantic", () => {
    expect(isSemanticControllerLayoutStateId(controllerLayoutStateIds.presentation)).toBe(true);
    expect(isSemanticControllerLayoutStateId("crafting-game-state")).toBe(false);
  });
});
