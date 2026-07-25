"use strict";

const path = require("node:path");
const { assertSafeSvg, svgResponseHeaders } = require("./svg-sanitizer");

function createRoomRuntimeContentRuntime(options = {}) {
  const getExistingRoom = options.getExistingRoom;
  const normalizeStageCode = options.normalizeStageCode;
  const sendJson = options.sendJson;
  if (typeof getExistingRoom !== "function" || typeof normalizeStageCode !== "function" || typeof sendJson !== "function") {
    throw new Error("Room runtime content requires room lookup, stage normalization, and JSON responses");
  }

  function pinnedRoom(res, rawStageCode) {
    const stageCode = normalizeStageCode(rawStageCode);
    const room = getExistingRoom(stageCode);
    if (!room) {
      sendJson(res, 404, { ok: false, error: "Room not found", errorCode: "ROOM_NOT_FOUND" });
      return null;
    }
    if (!room.releasePin || !room.contentSnapshot || !room.gameData) {
      sendJson(res, 409, { ok: false, error: "Room has no pinned runtime content", errorCode: "ROOM_CONTENT_NOT_PINNED" });
      return null;
    }
    return { room, stageCode };
  }

  function publicArtAsset(asset, stageCode) {
    const url = `/api/stage/${encodeURIComponent(stageCode)}/content/art-assets/${encodeURIComponent(String(asset.id || ""))}`;
    return {
      id: String(asset.id || ""),
      name: String(asset.name || asset.id || "Art Asset"),
      category: String(asset.category || ""),
      parent: String(asset.parent || ""),
      use: String(asset.use || ""),
      sharedBy: Array.isArray(asset.sharedBy) ? [...asset.sharedBy] : [],
      expectedTypes: asset.mimeType ? [String(asset.mimeType)] : [],
      defaultUrl: url,
      currentUrl: url,
      requiresAuthenticatedFetch: true,
      hasCustom: false,
      fileName: String(asset.sourceName || path.posix.basename(String(asset.blobPath || ""))),
      updatedAt: null
    };
  }

  function sendRoomRuntimeContent(res, rawStageCode, kind) {
    const pinned = pinnedRoom(res, rawStageCode);
    if (!pinned) return;
    const { room, stageCode } = pinned;
    if (kind === "stage-layouts") {
      sendJson(res, 200, { ok: true, layouts: room.gameData.defaultStageLayouts, revision: room.releasePin.contentRevision });
      return;
    }
    if (kind === "controller-layouts") {
      sendJson(res, 200, { ok: true, layouts: room.gameData.defaultControllerLayouts, revision: room.releasePin.contentRevision });
      return;
    }
    if (kind === "art-assets") {
      sendJson(res, 200, {
        ok: true,
        groups: room.gameData.artGroups,
        assets: room.gameData.artAssets.map((asset) => publicArtAsset(asset, stageCode)),
        compositions: room.gameData.defaultArtCompositions,
        organization: room.gameData.artOrganization || {},
        revision: room.releasePin.contentRevision
      });
      return;
    }
    sendJson(res, 404, { ok: false, error: "Runtime content kind not found", errorCode: "ROOM_CONTENT_KIND_NOT_FOUND" });
  }

  function serveRoomArtAsset(res, rawStageCode, rawAssetId) {
    const pinned = pinnedRoom(res, rawStageCode);
    if (!pinned) return;
    const { room } = pinned;
    const assetId = String(rawAssetId || "");
    const asset = room.gameData.artAssets.find((candidate) => candidate.id === assetId);
    if (!asset?.blobPath) {
      sendJson(res, 404, { ok: false, error: "Pinned art asset not found", errorCode: "ROOM_ART_ASSET_NOT_FOUND" });
      return;
    }
    let bytes;
    try {
      bytes = room.contentSnapshot.readBytes(asset.blobPath);
      if (asset.mimeType === "image/svg+xml") assertSafeSvg(bytes);
    } catch (error) {
      sendJson(res, 500, { ok: false, error: "Pinned art asset is invalid", errorCode: "ROOM_ART_ASSET_INVALID" });
      return;
    }
    const mimeType = String(asset.mimeType || "application/octet-stream");
    res.writeHead(200, {
      "Content-Type": mimeType,
      "Content-Length": bytes.length,
      "Cache-Control": "private, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
      ...(mimeType === "image/svg+xml" ? svgResponseHeaders() : {})
    });
    res.end(bytes);
  }

  function serveRoomHostAudio(res, rawStageCode, rawLineId) {
    const pinned = pinnedRoom(res, rawStageCode);
    if (!pinned) return;
    const { room } = pinned;
    const lineId = String(rawLineId || "");
    const line = room.gameData.defaultHostAudios.hostAudios
      .flatMap((hostAudio) => hostAudio.lines || [])
      .find((candidate) => candidate.id === lineId);
    if (!line?.blobPath) {
      sendJson(res, 404, { ok: false, error: "Pinned Host Audio asset not found", errorCode: "ROOM_HOST_AUDIO_NOT_FOUND" });
      return;
    }
    try {
      const bytes = room.contentSnapshot.readBytes(line.blobPath);
      res.writeHead(200, {
        "Content-Type": String(line.mimeType || "application/octet-stream"),
        "Content-Length": bytes.length,
        "Cache-Control": "private, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff"
      });
      res.end(bytes);
    } catch (error) {
      sendJson(res, 500, { ok: false, error: "Pinned Host Audio asset is invalid", errorCode: "ROOM_HOST_AUDIO_INVALID" });
    }
  }

  return Object.freeze({ sendRoomRuntimeContent, serveRoomArtAsset, serveRoomHostAudio });
}

module.exports = Object.freeze({ createRoomRuntimeContentRuntime });
