import { afterEach, describe, expect, it, vi } from "vitest";
import { StageSubActionScheduler } from "./stageSubActionScheduler";

afterEach(() => {
  vi.useRealTimers();
});

function parentAction(seconds = 2) {
  return {
    id: "parent",
    subActions: [{
      id: "delayed",
      type: "setGameObjectShown",
      timing: { mode: "S+", seconds }
    }]
  };
}

describe("StageSubActionScheduler", () => {
  it("fires after its delay even when another node starts in the same game session", () => {
    vi.useFakeTimers();
    const currentGameSessionId = 7;
    const run = vi.fn();
    const scheduler = new StageSubActionScheduler({
      currentGameSessionId: () => currentGameSessionId,
      run
    });

    scheduler.schedule(parentAction(), "lobby:display", currentGameSessionId);
    scheduler.enterGameSession(currentGameSessionId);
    vi.advanceTimersByTime(2000);

    expect(run).toHaveBeenCalledWith(
      expect.objectContaining({ id: "delayed" }),
      "lobby:display"
    );
    expect(scheduler.pendingCount()).toBe(0);
  });

  it("cancels pending sub-actions when the game session changes", () => {
    vi.useFakeTimers();
    let currentGameSessionId = 7;
    const run = vi.fn();
    const scheduler = new StageSubActionScheduler({
      currentGameSessionId: () => currentGameSessionId,
      run
    });

    scheduler.schedule(parentAction(), "lobby:display", currentGameSessionId);
    currentGameSessionId = 8;
    scheduler.enterGameSession(currentGameSessionId);
    vi.advanceTimersByTime(2000);

    expect(run).not.toHaveBeenCalled();
    expect(scheduler.pendingCount()).toBe(0);
  });

  it("cancels pending sub-actions during an explicit quit teardown", () => {
    vi.useFakeTimers();
    const run = vi.fn();
    const scheduler = new StageSubActionScheduler({
      currentGameSessionId: () => 7,
      run
    });

    scheduler.schedule(parentAction(), "lobby:display", 7);
    scheduler.clear();
    vi.advanceTimersByTime(2000);

    expect(run).not.toHaveBeenCalled();
    expect(scheduler.pendingCount()).toBe(0);
  });
});
