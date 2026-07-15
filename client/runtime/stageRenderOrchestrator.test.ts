import { describe, expect, it, vi } from "vitest";
import { StageRenderOrchestrator } from "./stageRenderOrchestrator";

describe("StageRenderOrchestrator flow identity", () => {
  it("does not restart an active flow action when only the visible phase changes", () => {
    const runStageAction = vi.fn();
    const orchestrator = new StageRenderOrchestrator({
      applyStageState: vi.fn(),
      prepareNewStageAction: vi.fn(),
      runStageAction
    });
    const action = { id: "countdown-barrier", type: "transitionState", trigger: "onCountdownComplete" };

    orchestrator.render({ phase: "lobby", flowStateId: "lobby", action });
    orchestrator.render({ phase: "starting", flowStateId: "lobby", action });

    expect(runStageAction).toHaveBeenCalledTimes(1);
  });

  it("treats the same action id in different nested subroutines as distinct actions", () => {
    const runStageAction = vi.fn();
    const orchestrator = new StageRenderOrchestrator({ applyStageState: vi.fn(), runStageAction });
    const action = { id: "display", type: "displayText" };

    orchestrator.render({ phase: "round", flowStateId: "round", subroutinePath: ["first"], action });
    orchestrator.render({ phase: "round", flowStateId: "round", subroutinePath: ["second"], action });

    expect(runStageAction).toHaveBeenCalledTimes(2);
  });

  it("does not remove visual game objects merely because the root subroutine changes", () => {
    const clearPointPopups = vi.fn();
    const renderVotingCards = vi.fn();
    const orchestrator = new StageRenderOrchestrator({
      applyStageState: vi.fn(),
      ...({ clearPointPopups, renderVotingCards } as Record<string, unknown>)
    });

    orchestrator.render({ phase: "intro", action: { id: "a", type: "doNothing" } });
    orchestrator.render({ phase: "round", action: { id: "b", type: "doNothing" } });

    expect(clearPointPopups).not.toHaveBeenCalled();
    expect(renderVotingCards).not.toHaveBeenCalled();
  });
});
