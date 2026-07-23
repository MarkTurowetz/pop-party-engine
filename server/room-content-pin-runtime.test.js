import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const { createRoomContentPinRuntime } = require("./room-content-pin-runtime");

function harness(overrides = {}) {
  const release = {
    gameId: "example-game",
    gameBuild: "1051",
    engineVersion: "1.0.0",
    pluginVersion: "1.0.0",
    contentRevision: "a".repeat(64),
    releaseRevision: "b".repeat(64)
  };
  const snapshot = { revision: release.contentRevision, manifest: { gameId: release.gameId } };
  const gameData = Object.freeze({ defaultGameFlow: { states: [{ id: "lobby" }] } });
  const contentStore = {
    getActiveRelease: vi.fn(async () => release),
    loadPublishedRevision: vi.fn(async () => snapshot),
    ...overrides.contentStore
  };
  return {
    contentStore,
    release,
    gameData,
    runtime: createRoomContentPinRuntime({
      contentStore,
      gameId: "example-game",
      materializeGameData: overrides.materializeGameData || (() => gameData),
      validateRelease: overrides.validateRelease
    }),
    snapshot
  };
}

describe("room content revision pinning", () => {
  it("pins one complete active release before room use", async () => {
    const { runtime, release, snapshot, gameData } = harness();
    const room = {};
    await expect(runtime.pinNewRoom(room)).resolves.toEqual(release);

    expect(room.releasePin).toEqual(release);
    expect(room.contentSnapshot).toBe(snapshot);
    expect(room.gameData).toBe(gameData);
    expect(() => { room.releasePin.contentRevision = "changed"; }).toThrow();
  });

  it("does not allow an existing room to silently adopt a newer release", async () => {
    const { runtime } = harness();
    const room = {};
    await runtime.pinNewRoom(room);
    await expect(runtime.pinNewRoom(room)).rejects.toMatchObject({ code: "ROOM_ALREADY_PINNED" });
  });

  it("fails closed when the active content cannot load or validate", async () => {
    const missing = harness({ contentStore: { loadPublishedRevision: vi.fn(async () => { throw new Error("missing"); }) } });
    await expect(missing.runtime.pinNewRoom({})).rejects.toMatchObject({ code: "ACTIVE_CONTENT_LOAD_FAILED" });

    const incompatible = harness({ validateRelease: vi.fn(async () => ({ ok: false, diagnostics: [{ code: "ENGINE_VERSION" }] })) });
    await expect(incompatible.runtime.pinNewRoom({})).rejects.toMatchObject({
      code: "ACTIVE_RELEASE_INCOMPATIBLE",
      details: { diagnostics: [{ code: "ENGINE_VERSION" }] }
    });

    const rejected = harness({
      validateRelease: vi.fn(async () => {
        const error = new Error("semantic role mismatch");
        error.code = "SEMANTIC_ROLE_MISMATCH";
        error.details = { role: "engine.stage.votingCard" };
        throw error;
      })
    });
    await expect(rejected.runtime.pinNewRoom({})).rejects.toMatchObject({
      code: "ACTIVE_RELEASE_INCOMPATIBLE",
      details: {
        validationCode: "SEMANTIC_ROLE_MISMATCH",
        validationDetails: { role: "engine.stage.votingCard" }
      }
    });
  });

  it("fails closed when the pinned snapshot cannot produce complete game data", async () => {
    const invalid = harness({ materializeGameData: () => { throw new Error("missing flow"); } });
    await expect(invalid.runtime.pinNewRoom({})).rejects.toMatchObject({
      code: "ACTIVE_CONTENT_GAME_DATA_INVALID",
      details: { cause: "missing flow" }
    });
  });

  it("releases the tuple, immutable snapshot, and materialized game data when a room ends", async () => {
    const { runtime } = harness();
    const room = {};
    await runtime.pinNewRoom(room);
    runtime.releaseRoomPin(room);
    expect(room).toMatchObject({ releasePin: null, contentSnapshot: null, gameData: null });
  });
});
