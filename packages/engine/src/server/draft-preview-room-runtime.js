"use strict";

const { createBundleGameData } = require("./content-game-data-runtime");
const { RoomContentPinError, publicReleaseTuple } = require("./room-content-pin-runtime");

function createDraftPreviewRoomRuntime(options = {}) {
  const contentStore = options.contentStore;
  const scope = String(options.scope || "default");
  const gameId = String(options.gameId || "");
  const gameBuild = String(options.gameBuild || "");
  const engineVersion = String(options.engineVersion || "");
  const pluginVersion = String(options.pluginVersion || "");
  const validateRelease = typeof options.validateRelease === "function"
    ? options.validateRelease
    : () => ({ ok: true, diagnostics: [] });
  if (!contentStore || typeof contentStore.readDraft !== "function") {
    throw new Error("Draft preview rooms require a revisioned content store");
  }

  async function pinPreviewRoom(room) {
    if (!room || typeof room !== "object") throw new RoomContentPinError("Room is required", { code: "ROOM_REQUIRED" });
    if (room.releasePin || room.contentSnapshot || room.gameData) {
      throw new RoomContentPinError("Room already has a content revision", { code: "ROOM_ALREADY_PINNED" });
    }
    if (typeof contentStore.initializeDraft === "function") await contentStore.initializeDraft(scope);
    const draft = await contentStore.readDraft(scope);
    if (!draft?.snapshot || draft.snapshot.revision !== draft.revision) {
      throw new RoomContentPinError("Complete authoring draft could not be loaded", { code: "DRAFT_PREVIEW_LOAD_FAILED" });
    }
    if (gameId && draft.snapshot.manifest.gameId !== gameId) {
      throw new RoomContentPinError("Authoring draft belongs to another game", { code: "DRAFT_PREVIEW_GAME_MISMATCH" });
    }
    let gameData;
    try {
      gameData = createBundleGameData(draft.snapshot);
    } catch (error) {
      throw new RoomContentPinError("Authoring draft cannot materialize complete room game data", {
        code: "DRAFT_PREVIEW_GAME_DATA_INVALID",
        details: { cause: String(error?.message || error), contentRevision: draft.revision }
      });
    }
    const release = Object.freeze({
      gameId,
      gameBuild,
      engineVersion,
      pluginVersion,
      contentRevision: draft.revision,
      releaseRevision: `draft:${scope}:${draft.revision}`,
      contentSource: "draft-preview"
    });
    const validation = await validateRelease({ gameData, release, snapshot: draft.snapshot });
    if (validation?.ok === false) {
      throw new RoomContentPinError("Authoring draft is incompatible with this game build", {
        code: "DRAFT_PREVIEW_INCOMPATIBLE",
        details: { diagnostics: validation.diagnostics || [] }
      });
    }
    room.releasePin = release;
    room.contentSnapshot = draft.snapshot;
    room.gameData = gameData;
    return publicReleaseTuple(release);
  }

  return Object.freeze({ pinPreviewRoom });
}

module.exports = Object.freeze({ createDraftPreviewRoomRuntime });
