"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { createBundleGameData } = require("./content-game-data-runtime");
const { replaceSnapshotFiles } = require("./content-snapshot-runtime");
const { createReleaseRecord } = require("./revisioned-content-store-runtime");
const { assertContainedFile } = require("./local-content-bundle-provider");

const AUTHORING_JSON_PATHS = Object.freeze({
  artManifest: "art/manifest.json",
  constants: "constants.json",
  controllerLayouts: "layouts/controller.json",
  flow: "flow.json",
  hostAudios: "audio/host-audios.json",
  stageLayouts: "layouts/stage.json"
});

function requiredFunction(value, label) {
  if (typeof value !== "function") throw new Error(`Authoring session content requires ${label}`);
  return value;
}

function createAuthoringSessionContentRuntime(options = {}) {
  const baseContentStore = options.baseContentStore;
  if (!baseContentStore
    || typeof baseContentStore.getActiveRelease !== "function"
    || typeof baseContentStore.loadPublishedRevision !== "function") {
    throw new Error("Authoring session content requires a base content store");
  }
  const authoringRoot = path.resolve(options.authoringRoot || "");
  const gameId = String(options.gameId || "");
  const gameBuild = String(options.gameBuild || "");
  const engineVersion = String(options.engineVersion || "");
  const pluginVersion = String(options.pluginVersion || "");
  for (const [label, value] of Object.entries({ gameId, gameBuild, engineVersion, pluginVersion })) {
    if (!value) throw new Error(`Authoring session content requires ${label}`);
  }

  const loadSources = Object.freeze({
    artManifest: requiredFunction(options.loadArtManifest, "loadArtManifest"),
    constants: requiredFunction(options.loadConstants, "loadConstants"),
    controllerLayouts: requiredFunction(options.loadControllerLayouts, "loadControllerLayouts"),
    flow: requiredFunction(options.loadFlow, "loadFlow"),
    hostAudios: requiredFunction(options.loadHostAudios, "loadHostAudios"),
    stageLayouts: requiredFunction(options.loadStageLayouts, "loadStageLayouts")
  });
  const materializeGameData = typeof options.materializeGameData === "function"
    ? options.materializeGameData
    : createBundleGameData;
  const validateRelease = typeof options.validateRelease === "function"
    ? options.validateRelease
    : async () => ({ ok: true, diagnostics: [] });

  const snapshots = new Map();
  let current = null;
  let currentError = null;
  let refreshPromise = null;

  function completeArtManifest(baseSnapshot, authoringManifest) {
    const baseManifest = baseSnapshot.readJson(AUTHORING_JSON_PATHS.artManifest);
    const deletedCompositionIds = Array.isArray(authoringManifest?.deletedCompositionIds)
      ? authoringManifest.deletedCompositionIds.map((id) => String(id || "")).filter(Boolean)
      : [];
    const compositions = {
      ...(baseManifest.compositions || {}),
      ...(authoringManifest?.compositions || {})
    };
    for (const compositionId of deletedCompositionIds) delete compositions[compositionId];
    return {
      ...baseManifest,
      ...authoringManifest,
      compositions,
      deletedCompositionIds,
      assets: Array.isArray(authoringManifest?.assets)
        ? authoringManifest.assets
        : baseManifest.assets
    };
  }

  function referencedBlobReplacements(baseSnapshot, artManifest) {
    const replacements = {};
    for (const asset of Array.isArray(artManifest?.assets) ? artManifest.assets : []) {
      const logicalPath = String(asset?.blobPath || "");
      if (!logicalPath) continue;
      if (!logicalPath.startsWith("blobs/")) {
        throw new Error(`Saved art asset ${String(asset?.id || "(unknown)")} has an invalid bundle blob path`);
      }
      const candidatePath = path.resolve(authoringRoot, ...logicalPath.split("/"));
      if (!fs.existsSync(candidatePath)) {
        if (baseSnapshot.paths.includes(logicalPath)) continue;
        throw new Error(`Saved art asset ${String(asset?.id || "(unknown)")} is missing ${logicalPath}`);
      }
      replacements[logicalPath] = fs.readFileSync(assertContainedFile(authoringRoot, logicalPath));
    }
    return replacements;
  }

  async function buildCandidate() {
    const baseRelease = await baseContentStore.getActiveRelease();
    const baseSnapshot = await baseContentStore.loadPublishedRevision(baseRelease.contentRevision);
    const sourceEntries = await Promise.all(Object.entries(loadSources).map(async ([key, loader]) => [
      key,
      await loader({ refresh: true })
    ]));
    const sources = Object.fromEntries(sourceEntries);
    const artManifest = completeArtManifest(baseSnapshot, sources.artManifest);
    const replacements = {
      [AUTHORING_JSON_PATHS.artManifest]: artManifest,
      [AUTHORING_JSON_PATHS.constants]: sources.constants,
      [AUTHORING_JSON_PATHS.controllerLayouts]: sources.controllerLayouts,
      [AUTHORING_JSON_PATHS.flow]: sources.flow,
      [AUTHORING_JSON_PATHS.hostAudios]: sources.hostAudios,
      [AUTHORING_JSON_PATHS.stageLayouts]: sources.stageLayouts,
      ...referencedBlobReplacements(baseSnapshot, artManifest)
    };
    const snapshot = replaceSnapshotFiles(baseSnapshot, replacements, { allowNewFiles: true });
    if (snapshot.manifest.gameId !== gameId) {
      throw new Error(`Saved authoring content belongs to ${snapshot.manifest.gameId || "(missing game)"}, not ${gameId}`);
    }
    const release = createReleaseRecord({
      gameId,
      gameBuild,
      engineVersion,
      pluginVersion,
      contentRevision: snapshot.revision
    });
    const gameData = materializeGameData(snapshot);
    const validation = await validateRelease({ gameData, release, snapshot });
    if (validation?.ok === false) {
      const error = new Error("Saved authoring content is not valid for a new game session");
      error.code = "AUTHORING_CONTENT_INVALID";
      error.details = { diagnostics: validation.diagnostics || [] };
      throw error;
    }
    return Object.freeze({ release, snapshot, gameData });
  }

  async function refresh() {
    if (refreshPromise) return refreshPromise;
    refreshPromise = (async () => {
      try {
        const candidate = await buildCandidate();
        current = candidate;
        currentError = null;
        snapshots.set(candidate.snapshot.revision, candidate.snapshot);
        return candidate;
      } catch (error) {
        currentError = error;
        throw error;
      } finally {
        refreshPromise = null;
      }
    })();
    return refreshPromise;
  }

  function requireCurrent() {
    if (currentError) {
      const error = new Error(`Latest saved authoring content is unavailable: ${currentError.message}`);
      error.code = currentError.code || "AUTHORING_CONTENT_UNAVAILABLE";
      error.details = { ...(currentError.details || {}) };
      throw error;
    }
    if (!current) {
      const error = new Error("Latest saved authoring content has not been prepared");
      error.code = "AUTHORING_CONTENT_NOT_READY";
      throw error;
    }
    return current;
  }

  function pinRoomFromCache(room, { requireUnpinned = false } = {}) {
    if (!room || typeof room !== "object") throw new Error("Room is required");
    if (requireUnpinned && (room.releasePin || room.contentSnapshot || room.gameData)) {
      const error = new Error("Room already has a content revision");
      error.code = "ROOM_ALREADY_PINNED";
      throw error;
    }
    const prepared = requireCurrent();
    room.releasePin = Object.freeze({ ...prepared.release });
    room.contentSnapshot = prepared.snapshot;
    room.gameData = prepared.gameData;
    return room.releasePin;
  }

  async function pinNewRoom(room) {
    if (room?.releasePin || room?.contentSnapshot || room?.gameData) {
      const error = new Error("Room already has a content revision");
      error.code = "ROOM_ALREADY_PINNED";
      throw error;
    }
    await refresh();
    return pinRoomFromCache(room, { requireUnpinned: true });
  }

  async function refreshBeforeSessionBoundary() {
    return refresh();
  }

  function prepareLobbySession(room) {
    return pinRoomFromCache(room);
  }

  function loadPublishedRevision(revision) {
    const snapshot = snapshots.get(String(revision || ""));
    if (!snapshot) throw new Error(`Authoring content revision is unavailable: ${String(revision || "")}`);
    return snapshot;
  }

  function getActiveRelease() {
    return requireCurrent().release;
  }

  function status() {
    return Object.freeze({
      mode: "latest-saved-authoring",
      ready: Boolean(current) && !currentError,
      revision: current?.snapshot?.revision || "",
      error: currentError ? String(currentError.message || currentError) : ""
    });
  }

  return Object.freeze({
    getActiveRelease,
    loadPublishedRevision,
    pinNewRoom,
    prepareLobbySession,
    refresh,
    refreshBeforeSessionBoundary,
    status
  });
}

module.exports = Object.freeze({
  AUTHORING_JSON_PATHS,
  createAuthoringSessionContentRuntime
});
