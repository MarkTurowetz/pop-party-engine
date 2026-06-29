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
});
