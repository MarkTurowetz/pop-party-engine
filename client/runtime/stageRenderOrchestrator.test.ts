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

  it("replays the same authored action on a new moment visit", () => {
    const runStageAction = vi.fn();
    const orchestrator = new StageRenderOrchestrator({ applyStageState: vi.fn(), runStageAction });
    const action = { id: "show-cards", type: "setVotingCardsShown" };

    orchestrator.render({ revision: 1, phase: "voting", momentVisitId: 3, action });
    orchestrator.render({ revision: 2, phase: "voting", momentVisitId: 4, action });

    expect(runStageAction).toHaveBeenCalledTimes(2);
    expect(orchestrator.actionKey()).toBe("voting@4::show-cards:setVotingCardsShown");
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

  it("ignores duplicate and stale room revisions so reconciliation cannot interrupt an active action", () => {
    const applyStageState = vi.fn();
    const runStageAction = vi.fn();
    const orchestrator = new StageRenderOrchestrator({ applyStageState, runStageAction });

    orchestrator.render({ revision: 10, phase: "lobby", action: { id: "display", type: "displayText" } });
    orchestrator.render({ revision: 10, phase: "lobby", action: { id: "display", type: "displayText" } });
    orchestrator.render({ revision: 9, phase: "lobby", action: { id: "setup", type: "setupGame" } });

    expect(applyStageState).toHaveBeenCalledTimes(1);
    expect(runStageAction).toHaveBeenCalledTimes(1);
    expect(orchestrator.actionKey()).toBe("lobby::display:displayText");
  });

  it("allows an explicit same-revision refresh to reconcile new art without replaying the action", () => {
    const applyStageState = vi.fn();
    const runStageAction = vi.fn();
    const orchestrator = new StageRenderOrchestrator({ applyStageState, runStageAction });
    const lobby = { revision: 12, phase: "lobby", action: { id: "display", type: "displayText" } };

    orchestrator.render(lobby);
    orchestrator.render(lobby, { force: true });

    expect(applyStageState).toHaveBeenCalledTimes(2);
    expect(runStageAction).toHaveBeenCalledTimes(1);
  });

  it("renders a visible runtime fault and never runs the authored action", () => {
    const applyStageState = vi.fn();
    const runStageAction = vi.fn();
    const showRuntimeFault = vi.fn();
    const orchestrator = new StageRenderOrchestrator({ applyStageState, runStageAction, showRuntimeFault });
    const lobby = {
      revision: 20,
      phase: "voting-moment",
      runtimeFault: { code: "VOTING_SOURCE_INVALID", message: "No answers" },
      action: { id: "show-cards", type: "setVotingCardsShown" }
    };

    orchestrator.render(lobby);

    expect(showRuntimeFault).toHaveBeenCalledWith(lobby);
    expect(runStageAction).not.toHaveBeenCalled();
    expect(applyStageState).toHaveBeenCalledWith({ ...lobby, action: null });
  });
});
