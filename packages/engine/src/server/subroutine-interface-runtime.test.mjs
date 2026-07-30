import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const { applyDynamicGameStateCode } = require("./dynamic-game-state-runtime");
const { createFlowNavigationRuntime } = require("./flow-navigation-runtime");
const { createRoomFlowHelpersRuntime } = require("./room-flow-helpers-runtime");
const {
  coerceSubroutineValue,
  evaluateSubroutineValue,
  normalizeSubroutineInputs,
  normalizeSubroutineOutputs
} = require("./subroutine-interface-runtime");

function flowTarget(value) {
  return String(value || "");
}

function createNestedRuntime() {
  const flow = {
    states: [{
      id: "play",
      entryTargetActionId: "turn-input",
      actions: [
        {
          id: "turn-input",
          name: "Resolve Turn Input",
          type: "subroutine",
          entryTargetActionId: "choose",
          nextTargetActionId: "after",
          inputs: [
            { name: "playerId", valueType: "string", source: "g.currentPlayerId" },
            { name: "bonus", valueType: "integer", source: "l.parentBonus" }
          ],
          outputs: [
            { name: "choice", valueType: "string", source: "l.choice", target: "l.turnChoice" },
            { name: "total", valueType: "integer", source: "l.total", target: "g.lastTotal" }
          ],
          actions: [{
            id: "choose",
            name: "Choose",
            type: "codeNode",
            code: "l.choice = 'hit'; l.total = l.bonus + 2",
            nextTargetActionId: "return"
          }]
        },
        {
          id: "after",
          name: "After",
          type: "presentText",
          nextTargetActionId: "none"
        }
      ]
    }],
    routeNodes: []
  };
  const navigation = createFlowNavigationRuntime({
    flowActionTarget: flowTarget,
    isNoActionTarget: (target) => !target || target === "none",
    isReturnActionTarget: (target) => target === "return",
    localDraftStore: {},
    normalizeFlowId: (value) => String(value || ""),
    readGameFlow: () => flow
  });
  const room = {
    phase: "play",
    flowStateId: "play",
    actionIndex: -1,
    subroutinePath: [],
    subroutineStack: [],
    localVariables: { parentBonus: 4 },
    G: { currentPlayerId: "p1" },
    players: new Map(),
    pendingFlowEvents: new Set()
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
    clearTextInput: vi.fn(),
    clearVotingInput: vi.fn(),
    entryActionIndexForPhase: (targetRoom, phase) => {
      const state = flow.states.find((item) => item.id === phase);
      return state.actions.findIndex((action) => action.id === state.entryTargetActionId);
    },
    enterGamePhase: vi.fn(),
    flowActionTarget: flowTarget,
    flowActionIndexById: navigation.flowActionIndexById,
    flowEventTargetForAction: () => "",
    getFlowState: navigation.getFlowState,
    getStateActions: navigation.getStateActions,
    isNoActionTarget: (target) => !target || target === "none",
    isReturnActionTarget: (target) => target === "return",
    pauseCraftingTimer: vi.fn(),
    publicFlowAction: (action, index) => ({ ...action, index }),
    resolveDecisionActionIndex: vi.fn(),
    runtimeGameFlow: navigation.runtimeGameFlow
  });
  return { room, runtime };
}

describe("subroutine interface runtime", () => {
  it("normalizes typed interfaces with unique local names", () => {
    expect(normalizeSubroutineInputs([
      { name: "Current Player", valueType: "string", source: "g.currentPlayerId" },
      { name: "Current Player", valueType: "wat", source: "l.player" }
    ])).toEqual([
      { name: "CurrentPlayer", valueType: "string", source: "g.currentPlayerId" },
      { name: "CurrentPlayer2", valueType: "string", source: "l.player" }
    ]);
    expect(normalizeSubroutineOutputs([
      { name: "score", valueType: "integer" }
    ])).toEqual([
      { name: "score", valueType: "integer", source: "l.score", target: "" }
    ]);
  });

  it("evaluates g/l expressions and enforces authored value types", () => {
    const room = { G: { base: 3 }, localVariables: { bonus: 2 } };
    expect(evaluateSubroutineValue(room, "g.base + l.bonus")).toBe(5);
    expect(coerceSubroutineValue("7", "integer")).toBe(7);
    expect(() => coerceSubroutineValue("7.5", "integer", "Count")).toThrow(/Count must be an integer/);
  });

  it("isolates child locals and returns declared outputs to parent l and g scopes", () => {
    const { room, runtime } = createNestedRuntime();
    const action = runtime.currentRoomAction(room);
    expect(action.id).toBe("choose");
    expect(room.subroutinePath).toEqual(["turn-input"]);
    expect(room.localVariables).toEqual({ playerId: "p1", bonus: 4 });

    expect(applyDynamicGameStateCode(room, action.code)).toMatchObject({ applied: 2, errors: [] });
    runtime.advanceRoomAfterAction(room, action);

    expect(room.subroutinePath).toEqual([]);
    expect(room.localVariables).toEqual({ parentBonus: 4, turnChoice: "hit" });
    expect(room.G).toEqual({ currentPlayerId: "p1", lastTotal: 6 });
    expect(runtime.currentRoomAction(room).id).toBe("after");
  });
});
