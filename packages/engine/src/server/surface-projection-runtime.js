"use strict";

const { createHash } = require("node:crypto");

const TRANSPORT_ONLY_FIELDS = new Set(["revision", "serverNow", "surface", "surfaceRevision"]);

function canonicalJson(value, root = false) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  const keys = Object.keys(value)
    .filter((key) => !root || !TRANSPORT_ONLY_FIELDS.has(key))
    .sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
}

function semanticProjectionFingerprint(payload) {
  return createHash("sha256").update(canonicalJson(payload, true)).digest("base64url");
}

function projectionStore(room) {
  if (!room.surfaceProjections || typeof room.surfaceProjections !== "object") {
    room.surfaceProjections = {
      stage: { fingerprint: "", revision: 0, publishedRevision: 0 },
      controllers: new Map()
    };
  }
  if (!(room.surfaceProjections.controllers instanceof Map)) room.surfaceProjections.controllers = new Map();
  return room.surfaceProjections;
}

function createSurfaceProjectionRuntime() {
  function projectionState(room, viewerPlayerId = "") {
    const store = projectionStore(room);
    const playerId = String(viewerPlayerId || "");
    if (!playerId) return store.stage;
    if (!store.controllers.has(playerId)) {
      store.controllers.set(playerId, { fingerprint: "", revision: 0 });
    }
    return store.controllers.get(playerId);
  }

  function project(room, viewerPlayerId, payload) {
    const playerId = String(viewerPlayerId || "");
    const state = projectionState(room, playerId);
    const fingerprint = semanticProjectionFingerprint(payload);
    if (state.fingerprint !== fingerprint) {
      state.fingerprint = fingerprint;
      state.revision += 1;
    }
    return {
      ...payload,
      surface: playerId ? "controller" : "stage",
      surfaceRevision: state.revision
    };
  }

  function shouldPublishStage(room, payload) {
    const state = projectionState(room);
    return Number(payload?.surfaceRevision || 0) > Number(state.publishedRevision || 0);
  }

  function markStagePublished(room, payload) {
    const state = projectionState(room);
    state.publishedRevision = Math.max(
      Number(state.publishedRevision || 0),
      Number(payload?.surfaceRevision || 0)
    );
  }

  return Object.freeze({ markStagePublished, project, shouldPublishStage });
}

module.exports = {
  createSurfaceProjectionRuntime,
  semanticProjectionFingerprint
};
