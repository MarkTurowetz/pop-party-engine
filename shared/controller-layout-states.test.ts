import { describe, expect, it } from "vitest";
import {
  controllerChoiceLayoutStateId,
  controllerLayoutCandidateIds,
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

  it("falls legacy stage phases back to Presentation while preserving explicit controller layouts", () => {
    expect(controllerLayoutCandidateIds("voice-moment", "voice-moment")).toEqual([
      "voice-moment",
      controllerLayoutStateIds.presentation,
      controllerLayoutStateIds.lobby
    ]);
    expect(controllerLayoutCandidateIds("voice-moment", "custom-controller-layout")).toEqual([
      "custom-controller-layout",
      controllerLayoutStateIds.presentation,
      controllerLayoutStateIds.lobby
    ]);
    expect(controllerLayoutCandidateIds(controllerLayoutStateIds.voiceInput, "voice-moment")).toEqual([
      controllerLayoutStateIds.voiceInput,
      controllerLayoutStateIds.presentation,
      controllerLayoutStateIds.lobby
    ]);
  });

  it("uses Join before a controller lobby snapshot exists", () => {
    expect(controllerLayoutCandidateIds("join", "", false)).toEqual([
      controllerLayoutStateIds.join,
      controllerLayoutStateIds.lobby
    ]);
  });

  it("uses Join even while a stale controller snapshot still selects another layout", () => {
    expect(controllerLayoutCandidateIds("join", controllerLayoutStateIds.voiceInput, true)).toEqual([
      controllerLayoutStateIds.join,
      controllerLayoutStateIds.lobby
    ]);
  });
});
