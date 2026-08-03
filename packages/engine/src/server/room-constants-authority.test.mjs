import { createRequire } from "node:module";
import { afterEach, describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const { createCountdownRuntime } = require("./countdown-runtime");
const { createCraftingTimerRuntime } = require("./crafting-timer-runtime");
const { createDecisionRuntime } = require("./decision-runtime");
const { createPlayerStateRuntime } = require("./player-state-runtime");

afterEach(() => vi.useRealTimers());

describe("room constant and player authority", () => {
  it("passes the room to decision constant lookup", () => {
    const room = { players: new Map(), numSequentialGames: 0 };
    const gameConstants = vi.fn((candidate) => ({
      gameTitle: candidate === room ? "Pinned" : "Wrong",
      numberOfRounds: 3,
      playerColors: ["#123456"]
    }));
    const runtime = createDecisionRuntime({
      activePlayers: () => [],
      flowActionIndexById: () => -1,
      gameConstants,
      isNoActionTarget: () => true,
      normalizeDecisionBranches: () => [],
      normalizeDecisionValueType: (value) => value
    });

    expect(runtime.decisionVariableValue(room, "gameTitle")).toBe("Pinned");
    expect(gameConstants).toHaveBeenCalledWith(room);
  });

  it("derives countdown and crafting durations from the current room", () => {
    vi.useFakeTimers();
    const room = {};
    const countdownDurationMs = vi.fn((candidate) => candidate === room ? 4000 : 1);
    const countdown = createCountdownRuntime({
      broadcastLobby() {},
      completeCountdownTrigger() {},
      countdownDurationMs,
      startGoHoldMs: 0
    });
    countdown.enterStartingPhase(room);
    expect(room.countdownEndsAt - room.countdownStartedAt).toBe(4000);
    expect(countdownDurationMs).toHaveBeenCalledWith(room);
    countdown.clearCountdownTimer(room);

    const durationMs = vi.fn((candidate) => candidate === room ? 9000 : 1);
    const crafting = createCraftingTimerRuntime({
      clearActiveInputFlowEvent() {},
      clearAnswersSubmittedAdvanceTimer() {},
      durationMs,
      emitInputFlowEvent() {}
    });
    crafting.setCraftingTimerShown(room, true);
    expect(room.craftingTimerDurationMs).toBe(9000);
    expect(durationMs).toHaveBeenCalledWith(room);
  });

  it("tracks active players and VIP authority without requiring presentation data", () => {
    const room = {
      players: new Map([
        ["p1", { id: "p1", active: false }],
        ["p2", { id: "p2", active: true }]
      ]),
      vipPlayerId: "",
      startToken: ""
    };
    const runtime = createPlayerStateRuntime({ randomToken: () => "token" });

    expect(runtime.activePlayers(room)).toEqual([{ id: "p2", active: true }]);
    runtime.selectVip(room);
    expect(room).toMatchObject({ vipPlayerId: "p2", startToken: "token" });
  });
});
