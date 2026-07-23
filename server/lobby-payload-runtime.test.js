import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const { createLobbyPayloadRuntime } = require("./lobby-payload-runtime");

function runtimeFor(action) {
  const applyRoomActionEffects = vi.fn();
  const currentRoomAction = vi.fn(() => action);
  const gameConstants = vi.fn(() => ({ gameTitle: "Game", speechToTextSendInputBuffer: 0 }));
  const runtime = createLobbyPayloadRuntime({
    activePlayers: () => [],
    allActivePlayersHaveSubmittedInput: () => false,
    applyRoomActionEffects,
    choiceInputPayload: () => null,
    craftingTimerPayload: () => null,
    currentRoomAction,
    gameConstants,
    microphoneAccessPayload: () => null,
    normalizePlayerFilter: () => "all",
    publicPlayer: (player) => player,
    resolveRoomActionText: (currentAction) => currentAction,
    runtimeGameFlow: () => ({ states: [{ id: "lobby", name: "Lobby" }] }),
    scheduleMicrophoneAccessAdvance: vi.fn(),
    selectVip: vi.fn(),
    serializeVotingCards: () => [],
    textInputPayload: () => null
  });
  return { ...runtime, applyRoomActionEffects, currentRoomAction, gameConstants };
}

describe("lobby payload flow action exposure", () => {
  it.each(["lobby", "starting"])("exposes the active flow action during %s", (phase) => {
    const action = { id: "header", name: "Display Header", type: "displayText", index: 2 };
    const runtime = runtimeFor(action);
    const payload = runtime.lobbyPayload({
      stageCode: "TEST",
      revision: 1,
      phase,
      flowStateId: "lobby",
      momentVisitId: 4,
      subroutinePath: ["nested"],
      players: new Map(),
      pendingFlowEvents: new Set()
    });

    expect(payload.action).toBe(action);
    expect(payload.flowStateId).toBe("lobby");
    expect(payload.momentVisitId).toBe(4);
    expect(payload.subroutinePath).toEqual(["nested"]);
    expect(payload.debugAction.actionId).toBe("header");
  });

  it("exposes prepared trivia prompt text as setup data without a visibility command", () => {
    const runtime = runtimeFor({ id: "timer", type: "startCraftingTimer" });
    const payload = runtime.lobbyPayload({
      stageCode: "TEST",
      revision: 2,
      phase: "crafting-game-state",
      flowStateId: "crafting-game-state",
      triviaPromptText: "Which dinosaur had three horns?",
      players: new Map(),
      pendingFlowEvents: new Set()
    });

    expect(payload.triviaPromptText).toBe("Which dinosaur had three horns?");
  });

  it("reads constants from the room that owns the payload", () => {
    const runtime = runtimeFor(null);
    const room = {
      stageCode: "TEST",
      revision: 1,
      phase: "lobby",
      flowStateId: "lobby",
      players: new Map()
    };
    runtime.lobbyPayload(room);
    expect(runtime.gameConstants).toHaveBeenCalledWith(room);
  });

  it("exposes a runtime fault without evaluating or applying another flow action", () => {
    const runtime = runtimeFor({ id: "should-not-run", type: "displayText" });
    const runtimeFault = { id: "1:4:VOTING_SOURCE_INVALID", code: "VOTING_SOURCE_INVALID", message: "No answers" };
    const payload = runtime.lobbyPayload({
      stageCode: "TEST",
      revision: 3,
      phase: "voting-moment",
      flowStateId: "voting-moment",
      players: new Map(),
      runtimeFault
    });

    expect(payload.runtimeFault).toEqual(runtimeFault);
    expect(payload.action).toBeNull();
    expect(runtime.currentRoomAction).not.toHaveBeenCalled();
    expect(runtime.applyRoomActionEffects).not.toHaveBeenCalled();
  });
});
