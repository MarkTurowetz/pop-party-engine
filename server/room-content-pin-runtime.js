"use strict";

class RoomContentPinError extends Error {
  constructor(message, { code = "ROOM_CONTENT_PIN_FAILED", details = {} } = {}) {
    super(message);
    this.name = "RoomContentPinError";
    this.code = code;
    this.details = Object.freeze({ ...details });
  }
}

function publicReleaseTuple(release) {
  if (!release) return null;
  return Object.freeze({
    gameId: String(release.gameId || ""),
    gameBuild: String(release.gameBuild || ""),
    engineVersion: String(release.engineVersion || ""),
    pluginVersion: String(release.pluginVersion || ""),
    contentRevision: String(release.contentRevision || ""),
    releaseRevision: String(release.releaseRevision || "")
  });
}

function createRoomContentPinRuntime(options = {}) {
  const contentStore = options.contentStore;
  if (!contentStore || typeof contentStore.getActiveRelease !== "function" || typeof contentStore.loadPublishedRevision !== "function") {
    throw new Error("Room content pinning requires a content store");
  }
  const expectedGameId = String(options.gameId || "");
  const validateRelease = typeof options.validateRelease === "function" ? options.validateRelease : () => ({ ok: true, diagnostics: [] });

  async function pinNewRoom(room) {
    if (!room || typeof room !== "object") throw new RoomContentPinError("Room is required", { code: "ROOM_REQUIRED" });
    if (room.releasePin || room.contentSnapshot) {
      throw new RoomContentPinError("Room already has a content revision", { code: "ROOM_ALREADY_PINNED" });
    }
    const release = await contentStore.getActiveRelease();
    if (!release?.releaseRevision || !release?.contentRevision) {
      throw new RoomContentPinError("No active release is available", { code: "ACTIVE_RELEASE_MISSING" });
    }
    if (expectedGameId && release.gameId !== expectedGameId) {
      throw new RoomContentPinError("Active release belongs to another game", {
        code: "ACTIVE_RELEASE_GAME_MISMATCH",
        details: { expectedGameId, actualGameId: release.gameId }
      });
    }
    let snapshot;
    try {
      snapshot = await contentStore.loadPublishedRevision(release.contentRevision);
    } catch (error) {
      throw new RoomContentPinError("Active content revision could not be loaded", {
        code: "ACTIVE_CONTENT_LOAD_FAILED",
        details: { contentRevision: release.contentRevision, cause: error.message }
      });
    }
    if (snapshot.revision !== release.contentRevision) {
      throw new RoomContentPinError("Loaded content does not match the active release", {
        code: "ACTIVE_CONTENT_REVISION_MISMATCH",
        details: { expectedRevision: release.contentRevision, actualRevision: snapshot.revision }
      });
    }
    if (snapshot.manifest.gameId !== release.gameId) {
      throw new RoomContentPinError("Loaded content belongs to another game", { code: "ACTIVE_CONTENT_GAME_MISMATCH" });
    }
    const validation = await validateRelease({ release, snapshot });
    if (validation?.ok === false) {
      throw new RoomContentPinError("Active release is incompatible with this game build", {
        code: "ACTIVE_RELEASE_INCOMPATIBLE",
        details: { diagnostics: validation.diagnostics || [] }
      });
    }
    room.releasePin = Object.freeze({ ...release });
    room.contentSnapshot = snapshot;
    return publicReleaseTuple(release);
  }

  function releaseRoomPin(room) {
    if (!room || typeof room !== "object") return;
    room.releasePin = null;
    room.contentSnapshot = null;
  }

  function roomRelease(room) {
    return publicReleaseTuple(room?.releasePin);
  }

  return Object.freeze({ pinNewRoom, releaseRoomPin, roomRelease });
}

module.exports = { RoomContentPinError, createRoomContentPinRuntime, publicReleaseTuple };
