import { beforeEach, describe, expect, it, vi } from "vitest";
import { PartyGameStageActionRunners } from "./stageActionRunners";

const runnerDefinitions = [
  ["doNothing", "immediateComplete"],
  ["voteOnAnswersInput", "controllerInputBarrier"],
  ["startMoment", "startMoment"],
  ["endMoment", "endMoment"],
  ["transitionState", "immediateComplete"],
  ["setGameObjectShown", "setGameObjectShown"],
  ["playGameObjectAnimation", "playGameObjectAnimation"],
  ["stopGameObjectAnimation", "playGameObjectAnimation"],
  ["setupGame", "serverEffect"],
  ["setPlayerAnswersShown", "setPlayerAnswersShown"],
  ["revealPlayerAnswerCorrectness", "revealPlayerAnswerCorrectness"],
  ["showPoints", "showPoints"]
].map(([type, runner]) => ({ type, runner }));

beforeEach(() => {
  (globalThis as typeof globalThis & {
    PartyGameFlowActionRegistry?: {
      isFlowEventBarrierAction: (action: Record<string, unknown>) => boolean;
      stageActionRunnerDefinitions: Array<{ type: string; runner: string }>;
    };
  }).PartyGameFlowActionRegistry = {
    isFlowEventBarrierAction: (action) => Boolean(action.trigger),
    stageActionRunnerDefinitions: runnerDefinitions
  };
});

function deferred() {
  let resolve: () => void = () => {};
  const promise = new Promise<void>((finish) => {
    resolve = finish;
  });
  return { promise, resolve };
}

function context() {
  return {
    applyFlowActionEffect: vi.fn(),
    completeFlowAction: vi.fn(),
    startCurrentMomentForAction: vi.fn(() => Promise.resolve()),
    endCurrentMomentForAction: vi.fn(() => Promise.resolve()),
    isCurrentActionKey: () => true,
    setStageTextObjectForAction: vi.fn(() => Promise.resolve()),
    runStageWipe: vi.fn(),
    playStageAudioAction: vi.fn(),
    setStageLayoutGameObjectShownForAction: vi.fn(() => Promise.resolve()),
    playStageLayoutGameObjectAnimationForAction: vi.fn(() => Promise.resolve()),
    revealPlayerAnswerCorrectnessForAction: vi.fn(() => Promise.resolve()),
    setPlayerAnswerBubblesShownForAction: vi.fn(() => Promise.resolve()),
    runVotingCardActionForAction: vi.fn(() => Promise.resolve()),
    showPointPopupsForAction: vi.fn()
  };
}

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe("PartyGameStageActionRunners (ported)", () => {
  it("immediateComplete completes an E+ action for the primary runner", () => {
    const c = context();
    const runner = PartyGameStageActionRunners.createRunner(c as never);
    runner.run({ id: "a1", type: "doNothing", timing: { mode: "E+", seconds: 0 } }, { isPrimary: true, actionKey: "k" });
    expect(c.completeFlowAction).toHaveBeenCalledWith("callback", "a1");
  });

  it("holds controller input actions without completing or applying a stage effect", () => {
    const c = context();
    const runner = PartyGameStageActionRunners.createRunner(c as never);

    runner.run(
      { id: "vote", type: "voteOnAnswersInput", timing: { mode: "E+", seconds: 0 } },
      { isPrimary: true, actionKey: "voting:vote" }
    );

    expect(c.completeFlowAction).not.toHaveBeenCalled();
    expect(c.applyFlowActionEffect).not.toHaveBeenCalled();
  });

  it.each([
    ["startMoment", "startCurrentMomentForAction"],
    ["endMoment", "endCurrentMomentForAction"]
  ] as const)("waits for the exact %s lifecycle callback", async (type, method) => {
    const c = context();
    const lifecycle = deferred();
    c[method].mockReturnValueOnce(lifecycle.promise);
    const runner = PartyGameStageActionRunners.createRunner(c as never);

    runner.run({ id: type, type, timing: { mode: "E+", seconds: 0 } }, { isPrimary: true, actionKey: "moment:key" });

    expect(c[method]).toHaveBeenCalledWith(expect.objectContaining({ id: type }), { actionKey: "moment:key" });
    expect(c.completeFlowAction).not.toHaveBeenCalled();
    lifecycle.resolve();
    await flushPromises();
    expect(c.completeFlowAction).toHaveBeenCalledWith("callback", type);
  });

  it.each([
    ["startMoment", "startCurrentMomentForAction"],
    ["endMoment", "endCurrentMomentForAction"]
  ] as const)("fires %s without accepting its callback in S+ mode", async (type, method) => {
    const c = context();
    const lifecycle = deferred();
    c[method].mockReturnValueOnce(lifecycle.promise);
    const runner = PartyGameStageActionRunners.createRunner(c as never);

    runner.run({ id: type, type, timing: { mode: "S+", seconds: 0 } }, { isPrimary: true, actionKey: "moment:key" });
    lifecycle.resolve();
    await flushPromises();

    expect(c[method]).toHaveBeenCalledOnce();
    expect(c.completeFlowAction).not.toHaveBeenCalled();
  });

  it.each(["E+", "S+"])("never completes a flow-event barrier from %s timing", (mode) => {
    const c = context();
    const runner = PartyGameStageActionRunners.createRunner(c as never);
    runner.run(
      { id: "countdown", type: "transitionState", trigger: "onCountdownComplete", timing: { mode, seconds: 0 } },
      { isPrimary: true, actionKey: "lobby:countdown" }
    );
    expect(c.completeFlowAction).not.toHaveBeenCalled();
  });

  it.each([0, 1])("fires an S+%s action without ever accepting its visual callback", async (seconds) => {
    const c = context();
    const animation = deferred();
    c.playStageLayoutGameObjectAnimationForAction.mockReturnValueOnce(animation.promise);
    const runner = PartyGameStageActionRunners.createRunner(c as never);
    runner.run(
      { id: `s-${seconds}`, type: "playGameObjectAnimation", timing: { mode: "S+", seconds } },
      { isPrimary: true, actionKey: "k" }
    );

    expect(c.playStageLayoutGameObjectAnimationForAction).toHaveBeenCalledTimes(1);
    animation.resolve();
    await flushPromises();
    expect(c.completeFlowAction).not.toHaveBeenCalled();
  });

  it("runs a delayed game-object sub-action after its parent action key is stale", () => {
    const c = context();
    c.isCurrentActionKey = () => false;
    const runner = PartyGameStageActionRunners.createRunner(c as never);
    const action = {
      id: "hide-header",
      type: "setGameObjectShown",
      isShown: false,
      targetLayoutElementId: "stagetitle",
      timing: { mode: "S+", seconds: 2 }
    };

    runner.run(action, { isPrimary: false, actionKey: "lobby:display-text" });

    expect(c.setStageLayoutGameObjectShownForAction).toHaveBeenCalledWith(action);
    expect(c.completeFlowAction).not.toHaveBeenCalled();
  });

  it("leaves non-primary room effects to the authoritative server scheduler", () => {
    const c = context();
    const runner = PartyGameStageActionRunners.createRunner(c as never);
    runner.run({ id: "a2", type: "setupGame" }, { isPrimary: false, actionKey: "k" });
    expect(c.applyFlowActionEffect).not.toHaveBeenCalled();
    expect(c.completeFlowAction).not.toHaveBeenCalled();
  });

  it("installs the global bridge on import", () => {
    const host = globalThis as typeof globalThis & { PartyGameStageActionRunners?: unknown };
    expect(host.PartyGameStageActionRunners).toBeTypeOf("object");
  });

  it("fails closed when the shared action registry has not loaded", () => {
    delete (globalThis as typeof globalThis & { PartyGameFlowActionRegistry?: unknown }).PartyGameFlowActionRegistry;

    expect(() => PartyGameStageActionRunners.createRunner(context() as never))
      .toThrow("Stage action registry is unavailable");
  });

  it("fails closed when an authored action has no registered stage runner", () => {
    const runner = PartyGameStageActionRunners.createRunner(context() as never);

    expect(() => runner.run(
      { id: "unknown", type: "game.unknownAction" },
      { isPrimary: true, actionKey: "k" }
    )).toThrow('No stage action runner is registered for authored action type "game.unknownAction"');
  });

  it.each(["playGameObjectAnimation", "stopGameObjectAnimation"])(
    "waits for the exact %s target callback",
    async (type) => {
      const c = context();
      const animation = deferred();
      c.playStageLayoutGameObjectAnimationForAction.mockReturnValueOnce(animation.promise);
      const runner = PartyGameStageActionRunners.createRunner(c as never);
      const action = { id: type, type, targetLayoutElementId: "bubble", animationName: "Appear" };

      runner.run(action, { isPrimary: true, actionKey: "k" });
      expect(c.completeFlowAction).not.toHaveBeenCalled();
      animation.resolve();
      await flushPromises();
      expect(c.completeFlowAction).toHaveBeenCalledWith("callback", type);
    }
  );

  it("waits for the filtered answer-bubble barrier", async () => {
    const c = context();
    const animation = deferred();
    c.setPlayerAnswerBubblesShownForAction.mockReturnValueOnce(animation.promise);
    const runner = PartyGameStageActionRunners.createRunner(c as never);
    runner.run(
      { id: "hide-wrong", type: "setPlayerAnswersShown", isShown: false, instant: false, playerFilter: "wrong" },
      { isPrimary: true, actionKey: "k" }
    );

    expect(c.setPlayerAnswerBubblesShownForAction).toHaveBeenCalledWith(false, {
      instant: false,
      playerFilter: "wrong"
    });
    expect(c.completeFlowAction).not.toHaveBeenCalled();
    animation.resolve();
    await flushPromises();
    expect(c.completeFlowAction).toHaveBeenCalledWith("callback", "hide-wrong");
  });

  it("waits for every correctness state target callback without a hard-coded delay", async () => {
    const c = context();
    const correctness = deferred();
    c.revealPlayerAnswerCorrectnessForAction.mockReturnValueOnce(correctness.promise);
    const runner = PartyGameStageActionRunners.createRunner(c as never);
    const action = { id: "reveal-correctness", type: "revealPlayerAnswerCorrectness" };

    runner.run(action, { isPrimary: true, actionKey: "k" });
    expect(c.completeFlowAction).not.toHaveBeenCalled();
    correctness.resolve();
    await flushPromises();
    expect(c.completeFlowAction).toHaveBeenCalledWith("callback", "reveal-correctness");
  });

  it("starts Show Points as fire-and-forget without joining the popup cleanup callback", () => {
    const c = context();
    const runner = PartyGameStageActionRunners.createRunner(c as never);
    const action = { id: "show-points", type: "showPoints", timing: { mode: "E+", seconds: 0 } };

    runner.run(action, { isPrimary: true, actionKey: "k" });

    expect(c.showPointPopupsForAction).toHaveBeenCalledWith(action);
    expect(c.completeFlowAction).toHaveBeenCalledWith("callback", "show-points");
  });

  it("fails closed when a target completion rejects", async () => {
    const c = context();
    c.playStageLayoutGameObjectAnimationForAction.mockReturnValueOnce(Promise.reject(new Error("interrupted")));
    const runner = PartyGameStageActionRunners.createRunner(c as never);
    runner.run({ id: "broken", type: "playGameObjectAnimation" }, { isPrimary: true, actionKey: "k" });
    await flushPromises();
    expect(c.completeFlowAction).not.toHaveBeenCalled();
  });
});
