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
  const contentStore = {
    getActiveRelease: vi.fn(async () => release),
    loadPublishedRevision: vi.fn(async () => snapshot),
    ...overrides.contentStore
  };
  return {
    contentStore,
    release,
    runtime: createRoomContentPinRuntime({ contentStore, gameId: "example-game", validateRelease: overrides.validateRelease }),
    snapshot
  };
}

describe("room content revision pinning", () => {
  it("pins one complete active release before room use", async () => {
    const { runtime, release, snapshot } = harness();
    const room = {};
    await expect(runtime.pinNewRoom(room)).resolves.toEqual(release);

    expect(room.releasePin).toEqual(release);
    expect(room.contentSnapshot).toBe(snapshot);
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
  });

  it("releases both the tuple and immutable snapshot when a room ends", async () => {
    const { runtime } = harness();
    const room = {};
    await runtime.pinNewRoom(room);
    runtime.releaseRoomPin(room);
    expect(room).toMatchObject({ releasePin: null, contentSnapshot: null });
  });
});
