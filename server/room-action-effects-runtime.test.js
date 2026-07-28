import { createRequire } from "node:module";
import { afterEach, describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const { createRoomActionEffectsRuntime } = require("./room-action-effects-runtime");

afterEach(() => {
  vi.useRealTimers();
});

function runtimeForScheduledEffects(broadcastLobby = vi.fn()) {
  return createRoomActionEffectsRuntime({
    broadcastLobby,
    hasAppliedActionEffect: () => false,
    markAppliedActionEffect: vi.fn(),
    resetGameSessionState: vi.fn()
  });
}

function delayedControllerLayoutParent(seconds = 2) {
  return {
    id: "parent",
    type: "doNothing",
    subActions: [{
      id: "delayed-layout",
      type: "setControllerLayout",
      controllerLayoutId: "presentation",
      timing: { mode: "S+", seconds }
    }]
  };
}

describe("scheduled room sub-action effects", () => {
  it("fires once after its parent is no longer the current node", () => {
    vi.useFakeTimers();
    const broadcastLobby = vi.fn();
    const runtime = runtimeForScheduledEffects(broadcastLobby);
    const room = {
      gameSessionId: 4,
      controllerLayoutId: "lobby",
      scheduledSubActionExecutionIds: new Set(),
      scheduledSubActionTimerIds: new Set()
    };
    const parent = delayedControllerLayoutParent();

    runtime.scheduleRoomSubActions(room, parent, 12);
    runtime.scheduleRoomSubActions(room, parent, 12);
    room.currentActionId = "the-next-node";
    vi.advanceTimersByTime(2000);

    expect(room.controllerLayoutId).toBe("presentation");
    expect(broadcastLobby).toHaveBeenCalledOnce();
    expect(room.scheduledSubActionTimerIds.size).toBe(0);
  });

  it("applies S+0 effects synchronously to the parent lobby payload", () => {
    const broadcastLobby = vi.fn();
    const runtime = runtimeForScheduledEffects(broadcastLobby);
    const room = { gameSessionId: 4, controllerLayoutId: "lobby" };

    runtime.scheduleRoomSubActions(room, delayedControllerLayoutParent(0), 13);

    expect(room.controllerLayoutId).toBe("presentation");
    expect(broadcastLobby).not.toHaveBeenCalled();
  });

  it("cancels pending effects when the game session is quit or reset", () => {
    vi.useFakeTimers();
    const broadcastLobby = vi.fn();
    const runtime = runtimeForScheduledEffects(broadcastLobby);
    const room = { gameSessionId: 4, controllerLayoutId: "lobby" };

    runtime.scheduleRoomSubActions(room, delayedControllerLayoutParent(), 14);
    runtime.clearScheduledSubActions(room);
    room.gameSessionId = 5;
    vi.advanceTimersByTime(2000);

    expect(room.controllerLayoutId).toBe("lobby");
    expect(broadcastLobby).not.toHaveBeenCalled();
    expect(room.scheduledSubActionTimerIds.size).toBe(0);
  });
});
