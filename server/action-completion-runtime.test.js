import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const { createActionCompletionRuntime } = require("./action-completion-runtime");

function setup(action) {
  const room = {
    action,
    actionCompletionPendingId: "",
    actionTimerId: null,
    isPaused: false
  };
  const advanceRoomAfterAction = vi.fn();
  const applyRoomActionEffects = vi.fn();
  const runtime = createActionCompletionRuntime({
    advanceRoomAfterAction,
    applyRoomActionEffects,
    broadcastLobby: vi.fn(),
    clearChoiceInput: vi.fn(),
    clearMicrophoneAccessInput: vi.fn(),
    clearTextInput: vi.fn(),
    currentRoomAction: (targetRoom) => targetRoom.action,
    enterGamePhase: vi.fn()
  });
  return { advanceRoomAfterAction, applyRoomActionEffects, room, runtime };
}

describe("action timing completion contract", () => {
  it("starts E+ timing only after the action callback", () => {
    vi.useFakeTimers();
    const action = { id: "end-plus", type: "displayText", timing: { mode: "E+", seconds: 1 } };
    const { advanceRoomAfterAction, room, runtime } = setup(action);

    expect(runtime.completeCurrentAction(room, action.id, "callback")).toBe(true);
    expect(advanceRoomAfterAction).not.toHaveBeenCalled();
    vi.advanceTimersByTime(999);
    expect(advanceRoomAfterAction).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(advanceRoomAfterAction).toHaveBeenCalledWith(room, action);
    vi.useRealTimers();
  });

  it.each([0, 1])("S+%s ignores action callbacks and advances only from the start timer", (seconds) => {
    const action = { id: `start-plus-${seconds}`, type: "displayText", timing: { mode: "S+", seconds } };
    const { advanceRoomAfterAction, room, runtime } = setup(action);

    expect(runtime.completeCurrentAction(room, action.id, "callback")).toBe(false);
    expect(advanceRoomAfterAction).not.toHaveBeenCalled();
    expect(runtime.completeCurrentAction(room, action.id, "startTimer")).toBe(true);
    expect(advanceRoomAfterAction).toHaveBeenCalledWith(room, action);
  });
});
