import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const {
  createLivePrototypeRoomContentRuntime
} = require("./live-prototype-room-content-runtime");

function fixture() {
  const enterLobbyPhase = vi.fn((room) => {
    room.phase = "lobby";
  });
  const broadcastLobby = vi.fn();
  const runtime = createLivePrototypeRoomContentRuntime({
    materializeGameData: (snapshot) => ({ title: snapshot.title }),
    validateRelease: vi.fn(async () => ({ ok: true, diagnostics: [] })),
    enterLobbyPhase,
    broadcastLobby,
    release: {
      gameId: "fixture",
      gameBuild: "1.0.0",
      engineVersion: "1.0.0",
      pluginVersion: "1.0.0"
    }
  });
  return { broadcastLobby, enterLobbyPhase, runtime };
}

describe("live prototype room content", () => {
  it("defers an authoring reset while a game is active and applies it at the lobby boundary", async () => {
    const { broadcastLobby, enterLobbyPhase, runtime } = fixture();
    const originalSnapshot = { title: "Active game content" };
    const baselineSnapshot = { title: "Restored Git content" };
    const room = {
      phase: "voting-moment",
      releasePin: Object.freeze({ contentRevision: "working-revision" }),
      contentSnapshot: originalSnapshot,
      gameData: { title: originalSnapshot.title }
    };

    const result = await runtime.installRoomSnapshot(
      room,
      baselineSnapshot,
      { contentRevision: "baseline-revision", releaseRevision: "baseline-release" },
      { reset: true }
    );

    expect(result).toEqual({ deferred: true });
    expect(room.phase).toBe("voting-moment");
    expect(room.contentSnapshot).toBe(originalSnapshot);
    expect(room.gameData.title).toBe("Active game content");
    expect(enterLobbyPhase).not.toHaveBeenCalled();
    expect(broadcastLobby).not.toHaveBeenCalled();

    expect(runtime.prepareLobbySession(room)).toBe(true);
    expect(room.contentSnapshot).toBe(baselineSnapshot);
    expect(room.gameData.title).toBe("Restored Git content");
    expect(room.releasePin).toMatchObject({
      contentRevision: "baseline-revision",
      contentSource: "live-prototype"
    });
    expect(runtime.prepareLobbySession(room)).toBe(false);
  });

  it("updates an idle lobby immediately so authoring changes remain previewable", async () => {
    const { broadcastLobby, enterLobbyPhase, runtime } = fixture();
    const room = { phase: "lobby" };
    const snapshot = { title: "New preview content" };

    const result = await runtime.installRoomSnapshot(
      room,
      snapshot,
      { contentRevision: "working-revision", contentSource: "live-prototype" },
      { reset: true }
    );

    expect(result).toEqual({ deferred: false });
    expect(room.contentSnapshot).toBe(snapshot);
    expect(room.gameData.title).toBe("New preview content");
    expect(enterLobbyPhase).toHaveBeenCalledOnce();
    expect(broadcastLobby).toHaveBeenCalledOnce();
  });
});
