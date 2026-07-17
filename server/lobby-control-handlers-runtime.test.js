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
});
