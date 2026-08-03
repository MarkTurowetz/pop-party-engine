"use strict";

const crypto = require("node:crypto");
const { createBundleGameData } = require("./content-game-data-runtime");
const { parseArtAssetReplacement } = require("./art-asset-replacement-runtime");
const { createContentSnapshot, replaceSnapshotFiles } = require("./content-snapshot-runtime");

const CHECKPOINT_SCHEMA_VERSION = 1;

function randomSessionId() {
  return crypto.randomBytes(24).toString("base64url");
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function serializeWorkspaceCheckpoint(snapshot, baselineRelease, baselineSnapshot) {
  return Object.freeze({
    schemaVersion: CHECKPOINT_SCHEMA_VERSION,
    gameId: snapshot.manifest.gameId,
    workingRevision: snapshot.revision,
    gitContentRevision: baselineSnapshot.revision,
    gitReleaseRevision: String(baselineRelease.releaseRevision || ""),
    savedAt: new Date().toISOString(),
    manifest: clone(snapshot.manifest),
    files: Object.fromEntries(
      snapshot.paths.map((logicalPath) => [
        logicalPath,
        snapshot.readBytes(logicalPath).toString("base64")
      ])
    )
  });
}

function deserializeWorkspaceCheckpoint(checkpoint) {
  if (!checkpoint || typeof checkpoint !== "object" || Array.isArray(checkpoint)) {
    throw new Error("A browser workspace checkpoint is required");
  }
  if (Number(checkpoint.schemaVersion) !== CHECKPOINT_SCHEMA_VERSION) {
    throw new Error("The browser workspace checkpoint uses an unsupported schema version");
  }
  if (!checkpoint.manifest || !checkpoint.files || typeof checkpoint.files !== "object") {
    throw new Error("The browser workspace checkpoint is incomplete");
  }
  const files = Object.fromEntries(
    Object.entries(checkpoint.files).map(([logicalPath, base64]) => [
      logicalPath,
      Buffer.from(String(base64 || ""), "base64")
    ])
  );
  const snapshot = createContentSnapshot({ manifest: checkpoint.manifest, files });
  if (String(checkpoint.workingRevision || "") !== snapshot.revision) {
    throw new Error("The browser workspace checkpoint revision does not match its contents");
  }
  return snapshot;
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

function isPresentationOnlyDraft(drafts) {
  const hasPresentationDraft = Boolean(
    drafts.layouts
    || drafts.controllerLayouts
    || drafts.artCompositions
    || drafts.artOrganization
    || drafts.artAssetReplacements
    || drafts.artDeletedCompositionIds
  );
  const hasGameplayDraft = Boolean(drafts.flow || drafts.constants || drafts.hostAudios);
  return hasPresentationDraft && !hasGameplayDraft;
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
  let localCheckpointSnapshot = null;
  let workingSnapshot = null;
  let session = null;
  let activationPromise = null;
  let workingCounter = 0;

  function staleSessionError() {
    const error = new Error("The live prototype authoring session is no longer active");
    error.code = "AUTHORING_SESSION_STALE";
    error.status = 409;
    return error;
  }

  function busySessionError() {
    const error = new Error(
      "Another Tools tab has an active live prototype authoring session. Close it before editing here."
    );
    error.code = "AUTHORING_SESSION_BUSY";
    error.status = 409;
    error.details = Object.freeze({ leaseMs, retryAfterMs: Math.max(1000, Math.floor(leaseMs / 3)) });
    return error;
  }

  function requireSession(sessionId) {
    const normalized = String(sessionId || "");
    if (!session || normalized !== session.id) {
      throw staleSessionError();
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

  async function installEveryRoom(snapshot, release, installOptions = { reset: true }) {
    for (const room of rooms.values()) {
      await installRoomSnapshot(room, snapshot, release, installOptions);
    }
  }

  async function loadBaseline() {
    baselineRelease = await contentStore.getActiveRelease();
    baselineSnapshot = await contentStore.loadPublishedRevision(baselineRelease.contentRevision);
    validateSnapshot(baselineSnapshot);
    localCheckpointSnapshot = baselineSnapshot;
    workingSnapshot = baselineSnapshot;
    await onSnapshotChanged(workingSnapshot, baselineRelease);
  }

  async function initialize() {
    await loadBaseline();
    clearDraftObject(drafts);
  }

  async function activate(sessionId = "", activationOptions = {}) {
    const activation = (async () => {
      if (!baselineSnapshot) await initialize();
      await loadBaseline();
      if (!activationOptions.preserveDrafts) clearDraftObject(drafts);
      workingCounter = 0;
      const resumed = Boolean(sessionId);
      session = {
        id: sessionId || createSessionId(),
        startedAt: now(),
        lastSeenAt: now(),
        recoveryRequired: resumed
      };
      return state();
    })();
    activationPromise = activation;
    try {
      return await activation;
    } catch (error) {
      session = null;
      throw error;
    } finally {
      if (activationPromise === activation) activationPromise = null;
    }
  }

  async function begin(sessionId = "") {
    const normalized = String(sessionId || "");
    if (activationPromise) await activationPromise;
    if (session) {
      if (normalized && normalized === session.id) {
        session.lastSeenAt = now();
        return state();
      }
      throw busySessionError();
    }
    return activate(normalized);
  }

  async function ensureSession(sessionId, ensureOptions = {}) {
    const normalized = String(sessionId || "");
    if (activationPromise) await activationPromise;
    if (session) return requireSession(normalized);
    if (!normalized) throw staleSessionError();
    await activate(normalized, ensureOptions);
    return session;
  }

  async function applyDraft(sessionId) {
    // Local draft handlers normalize the incoming payload into `drafts` before
    // invoking this hook. Preserve that first recovered payload while the
    // inactive workspace reloads its durable baseline.
    const activeSession = await ensureSession(sessionId, { preserveDrafts: true });
    const candidate = buildSnapshot(localCheckpointSnapshot, drafts);
    validateSnapshot(candidate);
    const previousSnapshot = workingSnapshot;
    const previousCounter = workingCounter;
    const presentationOnly = isPresentationOnlyDraft(drafts);
    workingSnapshot = candidate;
    workingCounter += 1;
    try {
      await onSnapshotChanged(workingSnapshot, workingRelease());
      await installEveryRoom(workingSnapshot, workingRelease(), {
        reset: !presentationOnly,
        hotReload: presentationOnly
      });
      activeSession.recoveryRequired = false;
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
    await ensureSession(sessionId);
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

  async function checkpoint(sessionId) {
    const activeSession = await ensureSession(sessionId);
    if (activeSession.recoveryRequired) {
      const error = new Error(
        "The authoring session was restored, but its browser checkpoint must be reapplied first"
      );
      error.code = "AUTHORING_SESSION_RECOVERY_REQUIRED";
      error.status = 409;
      throw error;
    }
    validateSnapshot(workingSnapshot);
    localCheckpointSnapshot = workingSnapshot;
    clearDraftObject(drafts);
    return Object.freeze({
      ...state(),
      checkpoint: serializeWorkspaceCheckpoint(
        localCheckpointSnapshot,
        baselineRelease,
        baselineSnapshot
      )
    });
  }

  async function restoreCheckpoint(sessionId, checkpointValue) {
    const activeSession = await ensureSession(sessionId);
    const restoredSnapshot = deserializeWorkspaceCheckpoint(checkpointValue);
    if (restoredSnapshot.manifest.gameId !== baselineSnapshot.manifest.gameId) {
      const error = new Error("The browser checkpoint belongs to a different game");
      error.code = "BROWSER_CHECKPOINT_GAME_MISMATCH";
      error.status = 409;
      throw error;
    }
    const checkpointGitRevision = String(checkpointValue.gitContentRevision || "");
    if (
      checkpointGitRevision
      && checkpointGitRevision !== baselineSnapshot.revision
      && restoredSnapshot.revision !== baselineSnapshot.revision
    ) {
      const error = new Error(
        "Git changed after this browser checkpoint was created. Restore from Git or recover the browser checkpoint before syncing."
      );
      error.code = "BROWSER_CHECKPOINT_GIT_CONFLICT";
      error.status = 409;
      throw error;
    }
    validateSnapshot(restoredSnapshot);
    clearDraftObject(drafts);
    localCheckpointSnapshot = restoredSnapshot;
    workingSnapshot = restoredSnapshot;
    workingCounter += 1;
    activeSession.recoveryRequired = false;
    await onSnapshotChanged(workingSnapshot, workingRelease());
    await installEveryRoom(workingSnapshot, workingRelease());
    return state();
  }

  async function save(sessionId, idempotencyKey, checkpointRevision = "") {
    const activeSession = await ensureSession(sessionId);
    if (activeSession.recoveryRequired) {
      const error = new Error(
        "The authoring session was restored, but its unsaved drafts must be republished before saving"
      );
      error.code = "AUTHORING_SESSION_RECOVERY_REQUIRED";
      error.status = 409;
      throw error;
    }
    const requestedRevision = String(checkpointRevision || "");
    if (
      requestedRevision
      && (!localCheckpointSnapshot || requestedRevision !== localCheckpointSnapshot.revision)
    ) {
      const error = new Error(
        "A newer browser checkpoint is available. Sync the latest local save instead."
      );
      error.code = "LOCAL_CHECKPOINT_REVISION_STALE";
      error.status = 409;
      throw error;
    }
    // Keep the no-revision form compatible with older authoring clients that
    // synchronously save the current workspace.
    const snapshotToSave = requestedRevision ? localCheckpointSnapshot : workingSnapshot;
    if (!requestedRevision) {
      localCheckpointSnapshot = snapshotToSave;
      clearDraftObject(drafts);
    }
    const expectedActiveRevision = baselineRelease.releaseRevision;
    validateSnapshot(snapshotToSave);
    const result = await contentStore.commitWorkspace({
      snapshot: snapshotToSave,
      expectedActiveRevision,
      idempotencyKey,
      release: releaseCoordinates
    });
    baselineRelease = result.release;
    baselineSnapshot = snapshotToSave;
    workingCounter += 1;
    await onSnapshotChanged(workingSnapshot, workingRelease());
    return Object.freeze({
      ...state(),
      saved: true,
      syncedRevision: snapshotToSave.revision,
      result
    });
  }

  async function discard(sessionId, { resetRooms = true } = {}) {
    if (!session) return state();
    requireSession(sessionId);
    clearDraftObject(drafts);
    localCheckpointSnapshot = baselineSnapshot;
    workingSnapshot = baselineSnapshot;
    const release = baselineRelease;
    session = null;
    workingCounter = 0;
    await onSnapshotChanged(baselineSnapshot, baselineRelease);
    if (resetRooms) {
      await installEveryRoom(baselineSnapshot, release);
    } else {
      await installEveryRoom(baselineSnapshot, release, {
        reset: true,
        deferUntilNextSession: true
      });
    }
    return state();
  }

  async function heartbeat(sessionId) {
    await ensureSession(sessionId);
    return state();
  }

  async function sweep() {
    if (!session || now() - session.lastSeenAt <= leaseMs) return false;
    await discard(session.id, { resetRooms: false });
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
      localCheckpointRevision: localCheckpointSnapshot?.revision || "",
      workingRevision: workingSnapshot?.revision || "",
      gitSynced: Boolean(
        baselineSnapshot
        && localCheckpointSnapshot
        && baselineSnapshot.revision === localCheckpointSnapshot.revision
      ),
      release: workingRelease(),
      recoveryRequired: Boolean(session?.recoveryRequired),
      leaseMs
    });
  }

  return Object.freeze({
    applyDraft,
    begin,
    checkpoint,
    discard,
    heartbeat,
    initialize,
    pinNewRoom,
    readWorkingSnapshot: () => workingSnapshot,
    restoreCheckpoint,
    save,
    stageBinary,
    state,
    sweep
  });
}

module.exports = Object.freeze({
  buildLivePrototypeSnapshot,
  clearDraftObject,
  createLivePrototypeWorkspaceRuntime,
  deserializeWorkspaceCheckpoint,
  isPresentationOnlyDraft,
  serializeWorkspaceCheckpoint
});
