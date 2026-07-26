"use strict";

const crypto = require("crypto");
const { canonicalizeJson } = require("../shared/content-bundle-schema");
const { createContentSnapshot, replaceSnapshotFiles, snapshotFingerprint } = require("./content-snapshot-runtime");

class ContentStoreConflictError extends Error {
  constructor(message, { code, expectedRevision = "", actualRevision = "" } = {}) {
    super(message);
    this.name = "ContentStoreConflictError";
    this.code = code || "CONTENT_REVISION_CONFLICT";
    this.status = 409;
    this.expectedRevision = expectedRevision;
    this.actualRevision = actualRevision;
  }
}

function stableHash(value) {
  return crypto.createHash("sha256").update(canonicalizeJson(value)).digest("hex");
}

function requiredIdempotencyKey(value) {
  const key = String(value || "").trim();
  if (!/^[A-Za-z0-9._:-]{8,160}$/.test(key)) throw new Error("A valid idempotency key is required");
  return key;
}

function normalizeScope(value) {
  const scope = String(value || "default").trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9._-]{0,79}$/.test(scope)) throw new Error("Invalid draft scope");
  return scope;
}

function createReleaseRecord(input, previousReleaseRevision = "") {
  const record = {
    gameId: String(input.gameId || ""),
    gameBuild: String(input.gameBuild || ""),
    engineVersion: String(input.engineVersion || ""),
    pluginVersion: String(input.pluginVersion || ""),
    contentRevision: String(input.contentRevision || ""),
    previousReleaseRevision: String(previousReleaseRevision || "")
  };
  for (const key of ["gameId", "gameBuild", "engineVersion", "pluginVersion", "contentRevision"]) {
    if (!record[key]) throw new Error(`Release record requires ${key}`);
  }
  return Object.freeze({ ...record, releaseRevision: stableHash(record) });
}

function cloneRelease(release) {
  return release ? Object.freeze({ ...release }) : null;
}

function createRevisionedContentStoreRuntime(options = {}) {
  const initialSnapshot = options.initialSnapshot;
  if (!initialSnapshot?.revision) throw new Error("Revisioned content store requires an initial snapshot");
  const validateSnapshot = typeof options.validateSnapshot === "function" ? options.validateSnapshot : () => ({ ok: true, diagnostics: [] });
  const snapshots = new Map([[initialSnapshot.revision, initialSnapshot]]);
  const publishedRevisions = new Set([initialSnapshot.revision]);
  const drafts = new Map();
  const idempotentResults = new Map();
  let activeRelease = createReleaseRecord({
    gameId: initialSnapshot.manifest.gameId,
    gameBuild: options.initialRelease?.gameBuild || "development",
    engineVersion: options.initialRelease?.engineVersion || "development",
    pluginVersion: options.initialRelease?.pluginVersion || "development",
    contentRevision: initialSnapshot.revision
  });

  function snapshotCopy(snapshot) {
    const files = new Map(snapshot.paths.map((logicalPath) => [logicalPath, snapshot.readBytes(logicalPath)]));
    return createContentSnapshot({ manifest: snapshot.manifest, files });
  }

  function rememberIdempotent(operation, scope, key, fingerprint, resultFactory) {
    const storageKey = `${operation}:${scope}:${requiredIdempotencyKey(key)}`;
    const existing = idempotentResults.get(storageKey);
    if (existing) {
      if (existing.fingerprint !== fingerprint) {
        throw new ContentStoreConflictError("Idempotency key was already used for a different request", { code: "IDEMPOTENCY_KEY_REUSE" });
      }
      return existing.result;
    }
    const result = resultFactory();
    idempotentResults.set(storageKey, { fingerprint, result });
    return result;
  }

  function readDraft(scopeInput = "default") {
    const scope = normalizeScope(scopeInput);
    const snapshot = drafts.get(scope) || snapshots.get(activeRelease.contentRevision);
    return Object.freeze({ scope, revision: snapshot.revision, snapshot: snapshotCopy(snapshot) });
  }

  function writeDraft({ scope: scopeInput = "default", expectedRevision, idempotencyKey, replacements }) {
    const scope = normalizeScope(scopeInput);
    const fingerprint = stableHash({ expectedRevision, replacements: Object.entries(replacements || {}).sort(([a], [b]) => a.localeCompare(b)).map(([path, value]) => [path, Buffer.isBuffer(value) ? value.toString("base64") : value]) });
    return rememberIdempotent("draft-write", scope, idempotencyKey, fingerprint, () => {
      const current = drafts.get(scope) || snapshots.get(activeRelease.contentRevision);
      if (String(expectedRevision || "") !== current.revision) {
        throw new ContentStoreConflictError("Draft revision is stale", {
          code: "DRAFT_REVISION_CONFLICT",
          expectedRevision: String(expectedRevision || ""),
          actualRevision: current.revision
        });
      }
      const next = replaceSnapshotFiles(current, replacements, { allowNewFiles: true });
      const validation = validateSnapshot(next);
      if (validation?.ok === false) {
        const error = new Error("Draft content validation failed");
        error.code = "CONTENT_VALIDATION_FAILED";
        error.diagnostics = validation.diagnostics || [];
        throw error;
      }
      snapshots.set(next.revision, next);
      drafts.set(scope, next);
      return Object.freeze({ scope, revision: next.revision, parentRevision: current.revision, diagnostics: validation?.diagnostics || [] });
    });
  }

  function validateDraft(scopeInput = "default") {
    const draft = readDraft(scopeInput);
    const validation = validateSnapshot(draft.snapshot);
    return Object.freeze({ scope: draft.scope, revision: draft.revision, ok: validation?.ok !== false, diagnostics: Object.freeze([...(validation?.diagnostics || [])]) });
  }

  function publishDraft({ scope: scopeInput = "default", expectedDraftRevision, expectedActiveRevision, idempotencyKey, release }) {
    const scope = normalizeScope(scopeInput);
    const fingerprint = stableHash({ expectedDraftRevision, expectedActiveRevision, release });
    return rememberIdempotent("publish", scope, idempotencyKey, fingerprint, () => {
      const draft = drafts.get(scope) || snapshots.get(activeRelease.contentRevision);
      if (String(expectedDraftRevision || "") !== draft.revision) {
        throw new ContentStoreConflictError("Draft revision changed before publish", {
          code: "DRAFT_REVISION_CONFLICT",
          expectedRevision: String(expectedDraftRevision || ""),
          actualRevision: draft.revision
        });
      }
      if (String(expectedActiveRevision || "") !== activeRelease.releaseRevision) {
        throw new ContentStoreConflictError("Active release changed before publish", {
          code: "ACTIVE_RELEASE_CONFLICT",
          expectedRevision: String(expectedActiveRevision || ""),
          actualRevision: activeRelease.releaseRevision
        });
      }
      const validation = validateSnapshot(draft);
      if (validation?.ok === false) {
        const error = new Error("Published content validation failed");
        error.code = "CONTENT_VALIDATION_FAILED";
        error.diagnostics = validation.diagnostics || [];
        throw error;
      }
      publishedRevisions.add(draft.revision);
      activeRelease = createReleaseRecord({ ...release, gameId: draft.manifest.gameId, contentRevision: draft.revision }, activeRelease.releaseRevision);
      return Object.freeze({ scope, contentRevision: draft.revision, release: cloneRelease(activeRelease), diagnostics: validation?.diagnostics || [] });
    });
  }

  function commitWorkspace({ snapshot, expectedActiveRevision, idempotencyKey, release }) {
    if (!snapshot?.revision || typeof snapshot.readBytes !== "function") {
      throw new Error("Workspace commit requires a complete content snapshot");
    }
    const fingerprint = stableHash({
      expectedActiveRevision,
      release,
      contentRevision: snapshot.revision
    });
    return rememberIdempotent("workspace-commit", "active", idempotencyKey, fingerprint, () => {
      if (String(expectedActiveRevision || "") !== activeRelease.releaseRevision) {
        throw new ContentStoreConflictError("Active release changed before workspace commit", {
          code: "ACTIVE_RELEASE_CONFLICT",
          expectedRevision: String(expectedActiveRevision || ""),
          actualRevision: activeRelease.releaseRevision
        });
      }
      const validation = validateSnapshot(snapshot);
      if (validation?.ok === false) {
        const error = new Error("Workspace content validation failed");
        error.code = "CONTENT_VALIDATION_FAILED";
        error.diagnostics = validation.diagnostics || [];
        throw error;
      }
      const stored = snapshotCopy(snapshot);
      snapshots.set(stored.revision, stored);
      publishedRevisions.add(stored.revision);
      activeRelease = createReleaseRecord({
        ...release,
        gameId: stored.manifest.gameId,
        contentRevision: stored.revision
      }, activeRelease.releaseRevision);
      return Object.freeze({
        contentRevision: stored.revision,
        release: cloneRelease(activeRelease),
        diagnostics: validation?.diagnostics || []
      });
    });
  }

  function rollback({ targetContentRevision, expectedActiveRevision, idempotencyKey, release }) {
    const target = String(targetContentRevision || "");
    const fingerprint = stableHash({ target, expectedActiveRevision, release });
    return rememberIdempotent("rollback", "active", idempotencyKey, fingerprint, () => {
      if (String(expectedActiveRevision || "") !== activeRelease.releaseRevision) {
        throw new ContentStoreConflictError("Active release changed before rollback", {
          code: "ACTIVE_RELEASE_CONFLICT",
          expectedRevision: String(expectedActiveRevision || ""),
          actualRevision: activeRelease.releaseRevision
        });
      }
      if (!publishedRevisions.has(target) || !snapshots.has(target)) throw new Error(`Published content revision does not exist: ${target}`);
      const snapshot = snapshots.get(target);
      const validation = validateSnapshot(snapshot);
      if (validation?.ok === false) {
        const error = new Error("Rollback content validation failed");
        error.code = "CONTENT_VALIDATION_FAILED";
        error.diagnostics = validation.diagnostics || [];
        throw error;
      }
      activeRelease = createReleaseRecord({ ...release, gameId: snapshot.manifest.gameId, contentRevision: target }, activeRelease.releaseRevision);
      return Object.freeze({ contentRevision: target, release: cloneRelease(activeRelease), diagnostics: validation?.diagnostics || [] });
    });
  }

  function loadPublishedRevision(revision) {
    const normalized = String(revision || "");
    if (!publishedRevisions.has(normalized)) throw new Error(`Content revision is not published: ${normalized}`);
    return snapshotCopy(snapshots.get(normalized));
  }

  function getActiveRelease() {
    return cloneRelease(activeRelease);
  }

  function listRevisions() {
    return Object.freeze([...publishedRevisions].map((revision) => Object.freeze({ revision, active: revision === activeRelease.contentRevision })));
  }

  return Object.freeze({
    commitWorkspace,
    getActiveRelease,
    listRevisions,
    loadPublishedRevision,
    publishDraft,
    readDraft,
    rollback,
    validateDraft,
    writeDraft
  });
}

module.exports = {
  ContentStoreConflictError,
  createReleaseRecord,
  createRevisionedContentStoreRuntime,
  normalizeScope,
  requiredIdempotencyKey,
  stableHash
};
