import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const { createLobbyPayloadRuntime } = require("./lobby-payload-runtime");

function runtimeFor(action) {
  return createLobbyPayloadRuntime({
    activePlayers: () => [],
    allActivePlayersHaveSubmittedInput: () => false,
    applyRoomActionEffects: vi.fn(),
    choiceInputPayload: () => null,
    craftingTimerPayload: () => null,
    currentRoomAction: () => action,
    gameConstants: () => ({ gameTitle: "Game", speechToTextSendInputBuffer: 0 }),
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
      subroutinePath: ["nested"],
      players: new Map(),
      pendingFlowEvents: new Set()
    });

    expect(payload.action).toBe(action);
    expect(payload.flowStateId).toBe("lobby");
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
});
