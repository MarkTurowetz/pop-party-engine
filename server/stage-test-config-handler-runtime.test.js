import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const { createStageTestConfigHandlerRuntime } = require("./stage-test-config-handler-runtime");

describe("stage test-flow configuration", () => {
  it("installs a normalized room-local flow and resets traversal state", async () => {
    const room = {
      actionCompletionPendingId: "pending",
      actionIndex: 9,
      phase: "lobby",
      presentedAction: { id: "old" },
      runtimeFlowOverride: null,
      subroutinePath: [1],
      subroutineStack: [{ id: "old" }]
    };
    let response = null;
    const normalizedFlow = { states: [{ id: "lobby", actions: [{ id: "new" }] }] };
    const runtime = createStageTestConfigHandlerRuntime({
      broadcastLobby: vi.fn(),
      clearAppliedActionEffects: vi.fn(),
      getRoom: () => room,
      getStateActions: () => normalizedFlow.states[0].actions,
      lobbyPayload: () => ({ phase: room.phase }),
      normalizeGameFlow: () => normalizedFlow,
      readJson: async () => ({ flow: { dirty: true } }),
      sendJson: (_res, status, body) => {
        response = { status, body };
      }
    });

    await runtime.handleStageTestConfig({}, {}, "ABCD");

    expect(room.runtimeFlowOverride).toBe(normalizedFlow);
    expect(room.actionCompletionPendingId).toBe("");
    expect(room.actionIndex).toBe(0);
    expect(room.presentedAction).toBeNull();
    expect(room.subroutinePath).toEqual([]);
    expect(room.subroutineStack).toEqual([]);
    expect(response).toEqual({
      status: 200,
      body: { ok: true, lobby: { phase: "lobby" }, hasTestFlow: true }
    });
  });
});
