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
});
