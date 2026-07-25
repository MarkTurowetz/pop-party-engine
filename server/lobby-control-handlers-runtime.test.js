import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const { createLobbyControlHandlersRuntime } = require("./lobby-control-handlers-runtime");

describe("lobby control handlers", () => {
  it("exposes lobby and quit controls without the removed Present HI THERE handler", () => {
    const runtime = createLobbyControlHandlersRuntime({
      getExistingRoom: vi.fn(),
      getRoom: vi.fn(),
      lobbyPayload: vi.fn(),
      normalizeStageCode: vi.fn(),
      quitRoomToLobby: vi.fn(),
      readJson: vi.fn(),
      sendJson: vi.fn()
    });

    expect(Object.keys(runtime).sort()).toEqual(["handleLobby", "handleQuitToLobby"]);
    expect(runtime.handlePresentHi).toBeUndefined();
  });

  it("refreshes authoring content before entering the quit lobby", async () => {
    const room = { stageCode: "ABCD" };
    const calls = [];
    const response = {};
    const runtime = createLobbyControlHandlersRuntime({
      getExistingRoom: () => room,
      getRoom: vi.fn(),
      lobbyPayload: () => ({ phase: room.phase }),
      normalizeStageCode: (value) => value,
      prepareQuitToLobby: async () => {
        calls.push("refresh");
      },
      quitRoomToLobby: () => {
        calls.push("quit");
        room.phase = "lobby";
      },
      readJson: async () => ({ stageCode: "ABCD" }),
      sendJson: (_res, status, body) => {
        response.status = status;
        response.body = body;
      }
    });

    await runtime.handleQuitToLobby({}, {});

    expect(calls).toEqual(["refresh", "quit"]);
    expect(response).toEqual({ status: 200, body: { ok: true, lobby: { phase: "lobby" } } });
  });
});
