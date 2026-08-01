import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const {
  createStageActionHandlersRuntime,
  createStartHandlersRuntime
} = require("../packages/engine/src/server");

function responseCapture() {
  let response = null;
  return {
    sendJson: (_res, status, body) => { response = { status, body }; },
    value: () => response
  };
}

describe("controller mutation response projections", () => {
  it("returns the VIP's Controller projection from start and cancel requests", async () => {
    const player = { id: "vip", active: true };
    const room = {
      countdownEndsAt: Date.now() + 10_000,
      phase: "lobby",
      players: new Map([[player.id, player]]),
      startToken: "start-token",
      vipPlayerId: player.id
    };
    const lobbyPayload = vi.fn((_room, viewerPlayerId = "") => ({
      surface: viewerPlayerId ? "controller" : "stage",
      viewerPlayerId
    }));
    const response = responseCapture();
    let requestPayload = { stageCode: "TEST", playerId: player.id, startToken: room.startToken };
    const runtime = createStartHandlersRuntime({
      broadcastLobby: vi.fn(),
      enterLobbyPhase: (target) => { target.phase = "lobby"; },
      enterStartingPhase: (target) => { target.phase = "starting"; },
      getExistingRoom: () => room,
      lobbyPayload,
      normalizePlayerId: (value) => String(value || ""),
      normalizeStageCode: (value) => String(value || ""),
      readJson: async () => requestPayload,
      selectVip: vi.fn(),
      sendJson: response.sendJson
    });

    await runtime.handleStart({}, {});
    expect(response.value()).toMatchObject({
      status: 200,
      body: { lobby: { surface: "controller", viewerPlayerId: player.id } }
    });
    expect(lobbyPayload).toHaveBeenLastCalledWith(room, player.id);

    requestPayload = { ...requestPayload, startToken: room.startToken };
    await runtime.handleCancelStart({}, {});
    expect(response.value()).toMatchObject({
      status: 200,
      body: { lobby: { surface: "controller", viewerPlayerId: player.id } }
    });
    expect(lobbyPayload).toHaveBeenLastCalledWith(room, player.id);
  });

  it("returns a Controller projection for controller-originated input events and Stage for Stage events", async () => {
    const room = { players: new Map([["vip", { id: "vip", active: true }]]) };
    const lobbyPayload = vi.fn((_room, viewerPlayerId = "") => ({
      surface: viewerPlayerId ? "controller" : "stage",
      viewerPlayerId
    }));
    const response = responseCapture();
    let requestPayload = { stageCode: "TEST", playerId: "vip", actionId: "present", eventType: "stageClick" };
    const controllerViewerPlayerId = vi.fn((_req, _room, payload) => String(payload.playerId || ""));
    const runtime = createStageActionHandlersRuntime({
      applyRoomActionEffects: vi.fn(),
      broadcastLobby: vi.fn(),
      completeCurrentAction: vi.fn(),
      controllerViewerPlayerId,
      currentRoomAction: () => ({ id: "present", type: "present" }),
      emitInputFlowEvent: vi.fn(() => true),
      getExistingRoom: () => room,
      lobbyPayload,
      normalizeStageCode: (value) => String(value || ""),
      readJson: async () => requestPayload,
      resolveRoomActionText: (action) => action,
      sendJson: response.sendJson
    });

    await runtime.handleInputEvent({}, {});
    expect(response.value()).toMatchObject({
      status: 200,
      body: { lobby: { surface: "controller", viewerPlayerId: "vip" } }
    });
    expect(lobbyPayload).toHaveBeenLastCalledWith(room, "vip");

    requestPayload = { stageCode: "TEST", actionId: "present", eventType: "stageClick" };
    controllerViewerPlayerId.mockReturnValueOnce("");
    await runtime.handleInputEvent({}, {});
    expect(response.value()).toMatchObject({
      status: 200,
      body: { lobby: { surface: "stage", viewerPlayerId: "" } }
    });
    expect(lobbyPayload).toHaveBeenLastCalledWith(room, "");
  });
});
