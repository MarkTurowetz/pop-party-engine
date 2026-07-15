import { describe, expect, it, vi } from "vitest";
import { PartyGameStageWidgetBindings } from "./stageWidgetBindings";
import { PartyGameStageRenderOrchestrator } from "./stageRenderOrchestrator";
import { PartyGameStageDebug } from "./stageDebugPanel";

describe("PartyGameStageWidgetBindings (ported)", () => {
  it("resolves widget definitions by id and by layout element id", () => {
    expect(PartyGameStageWidgetBindings.definition("joinQr")?.compositionId).toBe("join-qr-code");
    expect(PartyGameStageWidgetBindings.definition("stageWipe")?.compositionId).toBe("wipe-widget-mc");
    expect(PartyGameStageWidgetBindings.definitionForLayoutElement("STAGECODEBADGE")?.compositionId).toBe("stage-code-widget");
    expect(PartyGameStageWidgetBindings.previewTextOverrides("waitingstatus")["status-text"]).toMatch(/Waiting/);
    expect(PartyGameStageWidgetBindings.definition("nope")).toBe(null);
  });
});

describe("PartyGameStageRenderOrchestrator (ported)", () => {
  it("actionKeyForLobby encodes phase:id:type", () => {
    expect(PartyGameStageRenderOrchestrator.actionKeyForLobby({ phase: "round", action: { id: "a1", type: "present" } })).toBe(
      "round:a1:present"
    );
  });

  it("routes a transition action through the wipe path", () => {
    const calls: string[] = [];
    const orch = PartyGameStageRenderOrchestrator.createOrchestrator({
      applyStageState: () => calls.push("apply"),
      runStageWipe: (cb) => {
        calls.push("wipe");
        cb();
      },
      completeFlowAction: () => calls.push("complete"),
      scheduleSubActions: () => calls.push("schedule")
    });
    orch.render({ phase: "round", action: { id: "t1", type: "transition" } });
    expect(calls).toEqual(["schedule", "wipe", "apply", "complete"]);
  });

  it("halts on a dead-end decision trace", () => {
    const showHalt = vi.fn();
    const orch = PartyGameStageRenderOrchestrator.createOrchestrator({ showStageDecisionHalt: showHalt, applyStageState: vi.fn() });
    orch.render({ phase: "round", action: { id: "d1", type: "decision" }, lastDecisionTrace: { selectedTarget: "none" } });
    expect(showHalt).toHaveBeenCalled();
  });
});

describe("PartyGameStageDebug (ported)", () => {
  it("createPanel returns a panel that no-ops without elements", () => {
    const panel = PartyGameStageDebug.createPanel({});
    expect(() => panel.renderAction({ phase: "round", debugAction: { actionName: "x" } })).not.toThrow();
  });
});
