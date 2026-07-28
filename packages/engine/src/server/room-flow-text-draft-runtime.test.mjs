import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const { createRoomFlowHelpersRuntime } = require("./room-flow-helpers-runtime");

describe("room flow text draft finalization", () => {
  it("finalizes text drafts before timer-end cleanup clears the active input", () => {
    const calls = [];
    const action = {
      id: "write",
      type: "textSubmissionInput",
      timerEndTargetActionId: "next"
    };
    const room = {
      activeInputFlowEventKey: "",
      craftingTimerRunning: false,
      presentedAction: action
    };
    const runtime = createRoomFlowHelpersRuntime({
      activePlayers: () => [],
      advanceRoomFromMomentReturn: vi.fn(),
      advanceRoomFromRouteAction: vi.fn(),
      broadcastLobby: vi.fn(),
      clearActionTimer: vi.fn(),
      clearActiveInputFlowEvent: vi.fn(),
      clearAnswersSubmittedAdvanceTimer: vi.fn(),
      clearAppliedActionEffects: vi.fn(),
      clearChoiceInput: vi.fn(),
      clearCraftingTimerTimeout: vi.fn(),
      clearMicrophoneAccessInput: vi.fn(),
      clearTextInput: () => calls.push("clear"),
      clearVotingInput: vi.fn(),
      entryActionIndexForPhase: () => 0,
      finalizeTextInputDrafts: () => calls.push("finalize"),
      flowActionIndexById: () => 1,
      flowActionTarget: () => "",
      flowEventTargetForAction: (_action, eventType) => eventType === "timerEnd" ? "next" : "",
      getFlowState: vi.fn(),
      getStateActions: () => [],
      enterGamePhase: vi.fn(),
      isNoActionTarget: () => false,
      isReturnActionTarget: () => false,
      pauseCraftingTimer: vi.fn(),
      publicFlowAction: (value) => value,
      resolveDecisionActionIndex: vi.fn(),
      runtimeGameFlow: () => ({ routeNodes: [] })
    });

    expect(runtime.emitInputFlowEvent(room, "timerEnd")).toBe(true);
    expect(calls).toEqual(["finalize", "clear"]);
  });
});
