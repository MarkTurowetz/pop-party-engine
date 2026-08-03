import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const { createPlayerSessionHandlersRuntime } = require("./player-session-handlers-runtime");

function createHarness(room, payload) {
  const response = {};
  const sendJson = vi.fn((_res, status, body) => Object.assign(response, { status, body }));
  let generatedPlayerIndex = 0;
  const runtimeCapabilities = {
    publicStatus: () => ({ mode: "legacy" }),
    reconnectCapability: () => "",
    newPlayerIdentity: () => {
      generatedPlayerIndex += 1;
      return { playerId: `generated-${generatedPlayerIndex}`, playerCapability: `cap-${generatedPlayerIndex}` };
    },
    issuePlayerCapability: (_room, playerId) => `cap-${playerId}`
  };
  const runtime = createPlayerSessionHandlersRuntime({
    broadcastLobby: vi.fn(),
    cleanPlayerName: (value) => String(value || "").trim(),
    gameConstants: () => ({ playerColors: ["#ff4fa3"] }),
    getExistingRoom: () => room,
    getRoom: () => room,
    lobbyPayload: () => ({ gameSessionId: room.gameSessionId }),
    normalizePlayerId: (value) => String(value || ""),
    normalizeStageCode: (value) => String(value || ""),
    publicPlayer: (player) => ({ id: player.id, name: player.name }),
    randomArrayItem: (items) => items[0],
    readJson: async () => payload,
    runtimeCapabilities,
    selectVip: vi.fn(),
    sendJson
  });
  return { response, runtime };
}

describe("player session identity", () => {
  it("restores an inactive controller during the same game session", async () => {
    const player = {
      id: "p1",
      name: "Ava",
      active: false,
      kickedFromGame: false,
      gameSessionId: 7
    };
    const room = { gameSessionId: 7, players: new Map([[player.id, player]]) };
    const { response, runtime } = createHarness(room, { stageCode: "ABCD", playerId: "p1", gameSessionId: 7 });

    await runtime.handleHeartbeat({}, {});

    expect(response).toMatchObject({
      status: 200,
      body: { player: { id: "p1", name: "Ava" } }
    });
    expect(player).toMatchObject({ active: true, gameSessionId: 7 });
  });

  it("rejects an inactive controller after a new game session has started", async () => {
    const player = {
      id: "p1",
      name: "Ava",
      active: false,
      kickedFromGame: false,
      gameSessionId: 7
    };
    const room = { gameSessionId: 8, players: new Map([[player.id, player]]) };
    const { response, runtime } = createHarness(room, { stageCode: "ABCD", playerId: "p1", gameSessionId: 7 });

    await runtime.handleHeartbeat({}, {});

    expect(response).toMatchObject({ status: 409, body: { errorCode: "KICKED_TO_LOBBY" } });
    expect(player.active).toBe(false);
  });

  it("assigns a fresh player id when an old disconnected controller joins a later session", async () => {
    const oldPlayer = {
      id: "p1",
      name: "Ava",
      active: false,
      kickedFromGame: false,
      gameSessionId: 7
    };
    const room = { gameSessionId: 8, players: new Map([[oldPlayer.id, oldPlayer]]) };
    const { response, runtime } = createHarness(room, { stageCode: "ABCD", playerId: "p1", playerName: "Ava" });

    await runtime.handleJoin({}, {});

    expect(response.status).toBe(200);
    expect(response.body.player.id).not.toBe("p1");
    expect(room.players.get(response.body.player.id)).toMatchObject({
      name: "Ava",
      active: true,
      gameSessionId: 8
    });
  });
});
