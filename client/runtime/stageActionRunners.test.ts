import { describe, expect, it, vi } from "vitest";
import { PartyGameStageActionRunners } from "./stageActionRunners";

function context() {
  return {
    applyFlowActionEffect: vi.fn(),
    completeFlowAction: vi.fn(),
    isCurrentActionKey: () => true,
    setStageTextObject: vi.fn(() => 0),
    runStageWipe: vi.fn(),
    playStageAudioAction: vi.fn(),
    playStageLayoutGameObjectAnimationForAction: vi.fn(() => 250),
    playerAnswerBubbleAnimationRemaining: vi.fn(() => 0),
    revealPlayerAnswerCorrectnessForAction: vi.fn(() => 400),
    setPlayerAnswerBubblesShown: vi.fn(() => 500),
    voteRevealDurationMs: () => 0
  };
}

describe("PartyGameStageActionRunners (ported)", () => {
  it("immediateComplete completes the action for the primary runner", () => {
    const c = context();
    const runner = PartyGameStageActionRunners.createRunner(c as never);
    runner.run({ id: "a1", type: "doNothing" }, { isPrimary: true, actionKey: "k" });
    expect(c.completeFlowAction).toHaveBeenCalledWith("callback", "a1");
  });

  it("serverEffect applies the effect for a non-primary runner", () => {
    const c = context();
    const runner = PartyGameStageActionRunners.createRunner(c as never);
    runner.run({ id: "a2", type: "setupGame" }, { isPrimary: false, actionKey: "k" });
    expect(c.applyFlowActionEffect).toHaveBeenCalledWith("a2");
    expect(c.completeFlowAction).not.toHaveBeenCalled();
  });

  it("installs the global bridge on import", () => {
    const host = globalThis as typeof globalThis & { PartyGameStageActionRunners?: unknown };
    expect(host.PartyGameStageActionRunners).toBeTypeOf("object");
  });

  it("waits for placed game object animation actions to complete", () => {
    vi.useFakeTimers();
    const c = context();
    const runner = PartyGameStageActionRunners.createRunner(c as never);
    runner.run({ id: "a3", type: "playGameObjectAnimation", targetLayoutElementId: "bubble", animationName: "pop" }, { isPrimary: true, actionKey: "k" });
    expect(c.playStageLayoutGameObjectAnimationForAction).toHaveBeenCalledWith({
      id: "a3",
      type: "playGameObjectAnimation",
      targetLayoutElementId: "bubble",
      animationName: "pop"
    });
    expect(c.completeFlowAction).not.toHaveBeenCalled();
    vi.advanceTimersByTime(250);
    expect(c.completeFlowAction).toHaveBeenCalledWith("callback", "a3");
    vi.useRealTimers();
  });

  it("waits for stop-at-label game object animation actions to complete", () => {
    vi.useFakeTimers();
    const c = context();
    const runner = PartyGameStageActionRunners.createRunner(c as never);
    runner.run({ id: "a4", type: "stopGameObjectAnimation", targetLayoutElementId: "avatar", animationName: "stego" }, { isPrimary: true, actionKey: "k" });
    expect(c.playStageLayoutGameObjectAnimationForAction).toHaveBeenCalledWith({
      id: "a4",
      type: "stopGameObjectAnimation",
      targetLayoutElementId: "avatar",
      animationName: "stego"
    });
    expect(c.completeFlowAction).not.toHaveBeenCalled();
    vi.advanceTimersByTime(250);
    expect(c.completeFlowAction).toHaveBeenCalledWith("callback", "a4");
    vi.useRealTimers();
  });

  it("plays filtered player-answer lifecycle animations explicitly", () => {
    vi.useFakeTimers();
    const c = context();
    const runner = PartyGameStageActionRunners.createRunner(c as never);
    runner.run(
      { id: "hide-wrong", type: "setPlayerAnswersShown", isShown: false, instant: false, playerFilter: "wrong" },
      { isPrimary: true, actionKey: "k" }
    );

    expect(c.setPlayerAnswerBubblesShown).toHaveBeenCalledWith(false, {
      instant: false,
      playerFilter: "wrong"
    });
    expect(c.completeFlowAction).not.toHaveBeenCalled();
    vi.advanceTimersByTime(500);
    expect(c.completeFlowAction).toHaveBeenCalledWith("callback", "hide-wrong");
    vi.useRealTimers();
  });

  it("explicitly reveals each player answer correctness state before completing", () => {
    vi.useFakeTimers();
    const c = context();
    const runner = PartyGameStageActionRunners.createRunner(c as never);
    const action = { id: "reveal-correctness", type: "revealPlayerAnswerCorrectness" };

    runner.run(action, { isPrimary: true, actionKey: "k" });

    expect(c.revealPlayerAnswerCorrectnessForAction).toHaveBeenCalledWith(action);
    expect(c.completeFlowAction).not.toHaveBeenCalled();
    vi.advanceTimersByTime(399);
    expect(c.completeFlowAction).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(c.completeFlowAction).toHaveBeenCalledWith("callback", "reveal-correctness");
    vi.useRealTimers();
  });
});
