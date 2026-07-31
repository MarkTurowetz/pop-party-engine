import { describe, expect, it, vi } from "vitest";
import { createActionDefaults } from "./flowActionDefaults";
import type { FlowAction } from "../../types/game-data";

describe("Flow action defaults", () => {
  it("applies text defaults and timing", () => {
    const ensureActionTiming = vi.fn();
    const action = { id: "a", type: "setPlayersShown" } as FlowAction;

    createActionDefaults({ ensureActionTiming }).applyActionTypeDefaults(action, "presentText");

    expect(action).toMatchObject({
      type: "presentText",
      text: "Presented text",
      textTarget: "presentation",
      isShown: true
    });
    expect(ensureActionTiming).toHaveBeenCalledWith(action, false);
  });

  it("applies node defaults without timing normalization", () => {
    const ensureActionTiming = vi.fn();
    const action = { id: "jump", type: "presentText" } as FlowAction;

    createActionDefaults({ ensureActionTiming }).applyActionTypeDefaults(action, "jumpNode");

    expect(action).toMatchObject({
      type: "jumpNode",
      jumpTargetActionId: "none",
      nextTargetActionId: "",
      timing: { mode: "E+", seconds: 0 },
      subActions: []
    });
    expect(ensureActionTiming).not.toHaveBeenCalled();
  });

  it("applies host audio and decision defaults", () => {
    const ensureDecisionBranches = vi.fn(() => []);
    const action = { id: "audio", type: "presentText" } as FlowAction;
    const defaults = createActionDefaults({
      ensureDecisionBranches,
      firstHostAudioId: () => "intro-line"
    });

    defaults.applyActionTypeDefaults(action, "playHostAudio");
    expect(action).toMatchObject({ hostAudioId: "intro-line", playMode: "random", lineIndex: 0 });

    defaults.applyActionTypeDefaults(action, "decision");
    expect(action).toMatchObject({ variable: "activePlayerCount", valueType: "int" });
    expect(ensureDecisionBranches).toHaveBeenCalledWith(action);
  });

  it("defaults Log Value to a local expression and keeps normal action timing", () => {
    const ensureActionTiming = vi.fn();
    const action = { id: "log", type: "presentText" } as FlowAction;

    createActionDefaults({ ensureActionTiming }).applyActionTypeDefaults(action, "logValue");

    expect(action).toMatchObject({ type: "logValue", value: "l.value" });
    expect(ensureActionTiming).toHaveBeenCalledWith(action, false);
  });
});
