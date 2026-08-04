import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const { createInactivePlayerSweepRuntime } = require("./inactive-player-sweep-runtime");
const { createPlayerStateRuntime } = require("./player-state-runtime");

describe("inactive player sweep", () => {
  it("expires only controller availability while preserving roster and VIP identity", () => {
    const player = {
      id: "p1",
      name: "Ava",
      active: true,
      joined: true,
      controllerConnected: true,
      lastSeen: 100
    };
    const room = {
      players: new Map([[player.id, player]]),
      vipPlayerId: player.id,
      startToken: "stable-token"
    };
    const rooms = new Map([["ROOM", room]]);
    const onPlayerDisconnected = vi.fn();
    const broadcastLobby = vi.fn();
    const runtime = createInactivePlayerSweepRuntime({
      broadcastLobby,
      controllerTimeoutMs: 10_000,
      now: () => 10_101,
      onPlayerDisconnected,
      rooms
    });

    runtime.sweepInactivePlayers();
    runtime.sweepInactivePlayers();

    expect(player).toMatchObject({ active: true, joined: true, controllerConnected: false });
    expect(onPlayerDisconnected).toHaveBeenCalledTimes(1);
    expect(onPlayerDisconnected).toHaveBeenCalledWith(room, player.id);
    expect(broadcastLobby).not.toHaveBeenCalled();
    const playerState = createPlayerStateRuntime({ randomToken: () => "replacement" });
    expect(playerState.joinedPlayers(room)).toEqual([player]);
    playerState.selectVip(room);
    expect(room).toMatchObject({ vipPlayerId: player.id, startToken: "stable-token" });
  });
});
