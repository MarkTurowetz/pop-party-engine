"use strict";

const crypto = require("node:crypto");
const { createBundleGameData } = require("./content-game-data-runtime");
const { parseArtAssetReplacement } = require("./art-asset-replacement-runtime");
const { replaceSnapshotFiles } = require("./content-snapshot-runtime");

function randomSessionId() {
  return crypto.randomBytes(24).toString("base64url");
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function compositionRecord(composition) {
  const record = { ...clone(composition) };
  delete record.id;
  return record;
}

function buildLivePrototypeSnapshot(baseline, drafts, options = {}) {
  if (!baseline?.revision) throw new Error("A baseline content snapshot is required");
  const replacements = {};
  if (drafts.flow) replacements["flow.json"] = drafts.flow;
  if (drafts.constants) replacements["constants.json"] = drafts.constants;
  if (drafts.layouts) replacements["layouts/stage.json"] = drafts.layouts;
  if (drafts.controllerLayouts) replacements["layouts/controller.json"] = drafts.controllerLayouts;
  if (drafts.hostAudios) replacements["audio/host-audios.json"] = drafts.hostAudios;

  const hasArtDraft = Boolean(
    drafts.artCompositions ||
    drafts.artOrganization ||
    drafts.artAssetReplacements ||
    drafts.artDeletedCompositionIds
  );
  if (hasArtDraft) {
    const manifest = clone(baseline.readJson("art/manifest.json"));
    if (Array.isArray(drafts.artCompositions)) {
      manifest.compositions = Object.fromEntries(
        drafts.artCompositions.map((composition) => [composition.id, compositionRecord(composition)])
      );
      const restored = new Set(drafts.artCompositions.map((composition) => String(composition.id)));
      manifest.deletedCompositionIds = (manifest.deletedCompositionIds || [])
        .filter((compositionId) => !restored.has(String(compositionId)));
    }
    if (Array.isArray(drafts.artDeletedCompositionIds)) {
      const deleted = new Set(drafts.artDeletedCompositionIds.map(String));
      for (const compositionId of deleted) delete manifest.compositions[compositionId];
      manifest.deletedCompositionIds = [
        ...new Set([...(manifest.deletedCompositionIds || []), ...deleted])
      ];
    }
    if (drafts.artOrganization) manifest.organization = clone(drafts.artOrganization);
    for (const [assetId, replacement] of Object.entries(drafts.artAssetReplacements || {})) {
      const asset = (manifest.assets || []).find((candidate) => candidate.id === assetId);
      if (!asset) throw new Error(`Unknown art asset id: ${assetId}`);
      const parsed = parseArtAssetReplacement(replacement, {
        acceptedArtTypes: options.acceptedArtTypes || {}
      });
      const sha256 = crypto.createHash("sha256").update(parsed.buffer).digest("hex");
      const blobPath = `blobs/${sha256}${parsed.expectedExtension}`;
      Object.assign(asset, {
        blobPath,
        sha256,
        mimeType: parsed.mimeType,
        sourceName: parsed.fileName
      });
      replacements[blobPath] = parsed.buffer;
    }
    replacements["art/manifest.json"] = manifest;
  }

  for (const [logicalPath, bytes] of Object.entries(drafts.binaryFiles || {})) {
    replacements[logicalPath] = Buffer.from(bytes);
  }
  return replaceSnapshotFiles(baseline, replacements, { allowNewFiles: true });
}

function clearDraftObject(drafts) {
  for (const key of [
    "flow",
    "constants",
    "layouts",
    "controllerLayouts",
    "hostAudios",
    "artCompositions",
    "artOrganization",
    "artAssetReplacements",
    "artDeletedCompositionIds"
  ]) {
    drafts[key] = null;
  }
  drafts.binaryFiles = {};
}

function createLivePrototypeWorkspaceRuntime(options = {}) {
  const contentStore = options.contentStore;
  if (!contentStore
    || typeof contentStore.getActiveRelease !== "function"
    || typeof contentStore.loadPublishedRevision !== "function"
    || typeof contentStore.commitWorkspace !== "function") {
    throw new Error("Live prototype authoring requires a revisioned content store with atomic workspace commits");
  }
  const drafts = options.localDraftStore || {};
  const rooms = options.rooms || new Map();
  const installRoomSnapshot = options.installRoomSnapshot;
  const validateSnapshot = options.validateSnapshot || ((snapshot) => createBundleGameData(snapshot));
  const buildSnapshot = options.buildSnapshot || ((baseline, values) => buildLivePrototypeSnapshot(baseline, values, options));
  const now = options.now || Date.now;
  const createSessionId = options.createSessionId || randomSessionId;
  const leaseMs = Math.max(5000, Number(options.leaseMs || 20000));
  const releaseCoordinates = Object.freeze({ ...(options.release || {}) });
  const onSnapshotChanged = typeof options.onSnapshotChanged === "function"
    ? options.onSnapshotChanged
    : async () => {};
  let baselineRelease = null;
  let baselineSnapshot = null;
  let workingSnapshot = null;
  let session = null;
  let workingCounter = 0;

  function requireSession(sessionId) {
    const normalized = String(sessionId || "");
    if (!session || normalized !== session.id) {
      const error = new Error("The live prototype authoring session is no longer active");
      error.code = "AUTHORING_SESSION_STALE";
      error.status = 409;
      throw error;
    }
    session.lastSeenAt = now();
    return session;
  }

  function workingRelease() {
    if (!session || !workingSnapshot) return baselineRelease;
    return Object.freeze({
      ...baselineRelease,
      contentRevision: workingSnapshot.revision,
      releaseRevision: `working:${session.id}:${workingCounter}`,
      contentSource: "live-prototype"
    });
  }

  async function installEveryRoom(snapshot, release) {
    for (const room of rooms.values()) {
      await installRoomSnapshot(room, snapshot, release, { reset: true });
    }
  }

  async function loadBaseline() {
    baselineRelease = await contentStore.getActiveRelease();
    baselineSnapshot = await contentStore.loadPublishedRevision(baselineRelease.contentRevision);
    validateSnapshot(baselineSnapshot);
    workingSnapshot = baselineSnapshot;
    await onSnapshotChanged(workingSnapshot, baselineRelease);
  }

  async function initialize() {
    await loadBaseline();
    clearDraftObject(drafts);
  }

  async function begin() {
    if (!baselineSnapshot) await initialize();
    if (session) await discard(session.id);
    await loadBaseline();
    clearDraftObject(drafts);
    workingCounter = 0;
    session = { id: createSessionId(), startedAt: now(), lastSeenAt: now() };
    await installEveryRoom(baselineSnapshot, workingRelease());
    return state();
  }

  async function applyDraft(sessionId) {
    requireSession(sessionId);
    const candidate = buildSnapshot(baselineSnapshot, drafts);
    validateSnapshot(candidate);
    const previousSnapshot = workingSnapshot;
    const previousCounter = workingCounter;
    workingSnapshot = candidate;
    workingCounter += 1;
    try {
      await onSnapshotChanged(workingSnapshot, workingRelease());
      await installEveryRoom(workingSnapshot, workingRelease());
      return state();
    } catch (error) {
      workingSnapshot = previousSnapshot;
      workingCounter = previousCounter;
      await onSnapshotChanged(workingSnapshot, workingRelease()).catch(() => {});
      await installEveryRoom(workingSnapshot, workingRelease()).catch(() => {});
      throw error;
    }
  }

  async function stageBinary(sessionId, logicalPath, bytes, mutateDrafts) {
    requireSession(sessionId);
    const previousBinaryFiles = { ...(drafts.binaryFiles || {}) };
    const previousHostAudios = drafts.hostAudios;
    try {
      drafts.binaryFiles = { ...previousBinaryFiles, [logicalPath]: Buffer.from(bytes) };
      mutateDrafts?.(drafts);
      return await applyDraft(sessionId);
    } catch (error) {
      drafts.binaryFiles = previousBinaryFiles;
      drafts.hostAudios = previousHostAudios;
      throw error;
    }
  }

  async function save(sessionId, idempotencyKey) {
    requireSession(sessionId);
    validateSnapshot(workingSnapshot);
    const result = await contentStore.commitWorkspace({
      snapshot: workingSnapshot,
      expectedActiveRevision: baselineRelease.releaseRevision,
      idempotencyKey,
      release: releaseCoordinates
    });
    baselineRelease = result.release;
    baselineSnapshot = workingSnapshot;
    clearDraftObject(drafts);
    workingCounter += 1;
    await onSnapshotChanged(baselineSnapshot, baselineRelease);
    await installEveryRoom(baselineSnapshot, {
      ...baselineRelease,
      contentSource: "live-prototype"
    });
    return Object.freeze({ ...state(), saved: true, result });
  }

  async function discard(sessionId) {
    requireSession(sessionId);
    clearDraftObject(drafts);
    workingSnapshot = baselineSnapshot;
    const release = baselineRelease;
    session = null;
    workingCounter = 0;
    await onSnapshotChanged(baselineSnapshot, baselineRelease);
    await installEveryRoom(baselineSnapshot, release);
    return state();
  }

  async function heartbeat(sessionId) {
    requireSession(sessionId);
    return state();
  }

  async function sweep() {
    if (!session || now() - session.lastSeenAt <= leaseMs) return false;
    await discard(session.id);
    return true;
  }

  async function pinNewRoom(room) {
    const snapshot = session ? workingSnapshot : baselineSnapshot;
    const release = session ? workingRelease() : baselineRelease;
    await installRoomSnapshot(room, snapshot, release, { reset: false });
    return release;
  }

  function state() {
    return Object.freeze({
      active: Boolean(session),
      sessionId: session?.id || "",
      baselineRevision: baselineSnapshot?.revision || "",
      workingRevision: workingSnapshot?.revision || "",
      release: workingRelease(),
      leaseMs
    });
  }

  return Object.freeze({
    applyDraft,
    begin,
    discard,
    heartbeat,
    initialize,
    pinNewRoom,
    readWorkingSnapshot: () => workingSnapshot,
    save,
    stageBinary,
    state,
    sweep
  });
}

module.exports = Object.freeze({
  buildLivePrototypeSnapshot,
  clearDraftObject,
  createLivePrototypeWorkspaceRuntime
});
