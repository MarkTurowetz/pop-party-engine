import { describe, expect, it, vi } from "vitest";
import { createActionSummary, type FlowActionSummaryContext } from "./flowActionSummary";
import type { FlowAction } from "../../types/game-data";

function context(): FlowActionSummaryContext {
  return {
    decisionSummary: () => "hit: next",
    decisionVariableName: (variable) => String(variable || "activePlayerCount"),
    ensureActionTiming: vi.fn((action) => action.timing || { mode: "E+", seconds: 0 }),
    flowStateName: (stateId) => `State ${String(stateId || "")}`,
    flowTargetActionName: (actionId) => actionId ? `Action ${String(actionId)}` : "No Target",
    gameObjectTargetName: (elementId) => elementId ? `Object ${String(elementId)}` : "",
    hostAudioDisplayName: (hostAudioId) => `Audio ${String(hostAudioId || "")}`,
    textTargetName: (target) => `Text ${String(target || "")}`,
    transitionName: (transitionId) => `Transition ${String(transitionId || "")}`
  };
}

describe("Flow action summary", () => {
  it("summarizes text presentation actions", () => {
    const runtime = createActionSummary(context());
    const action = {
      id: "show-title",
      type: "presentText",
      text: "Hello",
      textTarget: "title",
      stageClickTargetActionId: "next",
      timing: { mode: "E+", seconds: 1.2 }
    } as FlowAction;

    expect(runtime.actionSummary(action)).toBe('Show Text title: "Hello" / click: Action next / E+ 1.2s');
    expect(runtime.actionTimingLabel(action)).toBe("E+ 1.20s");
    expect(runtime.actionValueBadge(action)).toEqual({ text: "Show", className: "is-show" });
  });

  it("builds value badges from visibility and single boolean fields", () => {
    const runtime = createActionSummary(context());

    expect(
      runtime.actionValueBadge({
        id: "wipe",
        type: "setWipeShown",
        isShown: false,
        instant: true
      } as FlowAction)
    ).toEqual({ text: "Hide", className: "is-hide" });
    expect(
      runtime.actionValueBadge({
        id: "choice",
        type: "multipleChoiceInput",
        locked: true
      } as FlowAction)
    ).toEqual({ text: "Locked", className: "is-on" });
  });

  it("summarizes special node actions without timing", () => {
    const runtime = createActionSummary(context());

    expect(runtime.actionSummary({ id: "jump", type: "jumpNode" } as FlowAction)).toBe("\u26a0 Jump target required");
    expect(runtime.actionSummary({ id: "label", type: "labelNode", labelText: "Note" } as FlowAction)).toBe("Note");
    expect(runtime.actionTimingLabel({ id: "code", type: "codeNode" } as FlowAction)).toBe("");
  });

  it("summarizes decision and host audio actions", () => {
    const runtime = createActionSummary(context());

    expect(runtime.actionSummary({ id: "branch", type: "decision", variable: "score" } as FlowAction)).toBe("score: hit: next");
    expect(runtime.actionSummary({ id: "audio", type: "playHostAudio", hostAudioId: "intro", playMode: "index", lineIndex: 2 } as FlowAction))
      .toBe("Play host audio: Audio intro / Index 2 / E+ 0.0s");
  });

  it("summarizes instant stop-at-label game object actions", () => {
    const runtime = createActionSummary(context());

    expect(
      runtime.actionSummary({
        id: "stop-avatar",
        type: "stopGameObjectAnimation",
        targetLayoutElementId: "avatar",
        animationName: "stego",
        instant: true
      } as FlowAction)
    ).toBe("Stop at stego on Object avatar / E+ 0.0s / Instant");
  });
});
