"use strict";

const { createContentSnapshot, replaceSnapshotFiles } = require("./content-snapshot-runtime");
const {
  ContentStoreConflictError,
  createReleaseRecord,
  normalizeScope,
  requiredIdempotencyKey,
  stableHash
} = require("./revisioned-content-store-runtime");

const MANIFEST_PATH = "content-bundle.json";
const DRAFT_STATE_PATH = "draft-state.json";
const ACTIVE_RELEASE_PATH = "active-release.json";
const PUBLISHED_REVISIONS_PATH = "published-revisions.json";

function jsonBytes(value) {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function parseJson(bytes, logicalPath) {
  try {
    return JSON.parse(Buffer.from(bytes).toString("utf8"));
  } catch (error) {
    throw new Error(`Git content JSON is invalid at ${logicalPath}: ${error.message}`);
  }
}

function createGithubContentBundleStore(options = {}) {
  const git = options.git;
  if (!git) throw new Error("GitHub content bundle store requires a Git Data runtime");
  const contentRef = options.contentRef || "heads/game-data";
  const draftRefPrefix = options.draftRefPrefix || "heads/game-drafts/";
  const releaseRef = options.releaseRef || "heads/game-releases";
  const baseRef = options.baseRef || "heads/main";
  const validateSnapshot = typeof options.validateSnapshot === "function" ? options.validateSnapshot : () => ({ ok: true, diagnostics: [] });

  function draftRef(scope) {
    return `${draftRefPrefix}${normalizeScope(scope)}`;
  }

  async function blobEntries(files, prefix = "") {
    const entries = [];
    for (const [logicalPath, bytes] of files) {
      entries.push({ path: `${prefix}${logicalPath}`, sha: await git.createBlob(bytes) });
    }
    return entries;
  }

  function snapshotFiles(snapshot, prefix = "") {
    const files = new Map([[`${prefix}${MANIFEST_PATH}`, snapshot.manifestBytes()]]);
    for (const logicalPath of snapshot.paths) files.set(`${prefix}${logicalPath}`, snapshot.readBytes(logicalPath));
    return files;
  }

  async function commitFiles({ files, message, parentSha }) {
    const entries = await blobEntries(files);
    const treeSha = await git.createTree(entries);
    return git.createCommit({ message, treeSha, parentSha });
  }

  async function treeFileMap(commitSha) {
    const commit = await git.getCommit(commitSha);
    const tree = await git.readTree(commit.treeSha);
    return { commit, entries: new Map(tree.map((entry) => [entry.path, entry])) };
  }

  async function readFile(entries, logicalPath) {
    const entry = entries.get(logicalPath);
    if (!entry?.sha) throw new Error(`Git content file is missing: ${logicalPath}`);
    return git.readBlob(entry.sha);
  }

  async function loadSnapshotAtCommit(commitSha, prefix = "") {
    const { entries } = await treeFileMap(commitSha);
    const manifest = parseJson(await readFile(entries, `${prefix}${MANIFEST_PATH}`), `${prefix}${MANIFEST_PATH}`);
    const files = new Map();
    for (const file of manifest.files || []) {
      files.set(file.path, await readFile(entries, `${prefix}${file.path}`));
    }
    return createContentSnapshot({ manifest, files });
  }

  async function readDraftState(scopeInput = "default") {
    const scope = normalizeScope(scopeInput);
    const ref = await git.getRef(draftRef(scope));
    if (!ref?.sha) throw new Error(`Draft scope is not initialized: ${scope}`);
    const { entries } = await treeFileMap(ref.sha);
    const state = parseJson(await readFile(entries, DRAFT_STATE_PATH), DRAFT_STATE_PATH);
    const snapshot = await loadSnapshotAtCommit(ref.sha, "bundle/");
    if (state.revision !== snapshot.revision) throw new Error("Draft state revision does not match its bundle");
    return { scope, ref, state, snapshot };
  }

  async function readReleaseState() {
    const ref = await git.getRef(releaseRef);
    if (!ref?.sha) throw new Error("Release state is not initialized");
    const { entries } = await treeFileMap(ref.sha);
    const release = parseJson(await readFile(entries, ACTIVE_RELEASE_PATH), ACTIVE_RELEASE_PATH);
    const revisions = parseJson(await readFile(entries, PUBLISHED_REVISIONS_PATH), PUBLISHED_REVISIONS_PATH);
    if (stableHash({
      gameId: release.gameId,
      gameBuild: release.gameBuild,
      engineVersion: release.engineVersion,
      pluginVersion: release.pluginVersion,
      contentRevision: release.contentRevision,
      previousReleaseRevision: release.previousReleaseRevision || ""
    }) !== release.releaseRevision) throw new Error("Active release record hash is invalid");
    return { ref, release: Object.freeze({ ...release }), revisions };
  }

  async function initialize({ initialSnapshot, release }) {
    const existingContent = await git.getRef(contentRef);
    const existingRelease = await git.getRef(releaseRef);
    if (existingContent || existingRelease) throw new Error("GitHub content store is already initialized");
    const base = await git.getRef(baseRef);
    if (!base?.sha) throw new Error(`Base Git reference does not exist: ${baseRef}`);
    const validation = await validateSnapshot(initialSnapshot);
    if (validation?.ok === false) throw Object.assign(new Error("Initial content validation failed"), { code: "CONTENT_VALIDATION_FAILED", diagnostics: validation.diagnostics || [] });
    const contentCommitSha = await commitFiles({
      files: snapshotFiles(initialSnapshot),
      message: `Publish initial content ${initialSnapshot.revision}`,
      parentSha: base.sha
    });
    await git.createRef(contentRef, contentCommitSha);
    const active = createReleaseRecord({ ...release, gameId: initialSnapshot.manifest.gameId, contentRevision: initialSnapshot.revision });
    const revisions = { [initialSnapshot.revision]: { contentCommitSha, publishedByRelease: active.releaseRevision } };
    const releaseCommitSha = await commitFiles({
      files: new Map([[ACTIVE_RELEASE_PATH, jsonBytes(active)], [PUBLISHED_REVISIONS_PATH, jsonBytes(revisions)]]),
      message: `Activate initial release ${active.releaseRevision}`,
      parentSha: base.sha
    });
    await git.createRef(releaseRef, releaseCommitSha);
    return { contentRevision: initialSnapshot.revision, release: active };
  }

  async function initializeDraft(scopeInput = "default") {
    const scope = normalizeScope(scopeInput);
    const refName = draftRef(scope);
    const existing = await git.getRef(refName);
    if (existing?.sha) return readDraft(scope);
    const releaseState = await readReleaseState();
    const published = releaseState.revisions[releaseState.release.contentRevision];
    if (!published?.contentCommitSha) throw new Error("Active release content commit is missing from the revision index");
    const snapshot = await loadSnapshotAtCommit(published.contentCommitSha);
    const state = { scope, revision: snapshot.revision, operations: {} };
    const commitSha = await commitFiles({
      files: new Map([...snapshotFiles(snapshot, "bundle/"), [DRAFT_STATE_PATH, jsonBytes(state)]]),
      message: `Initialize draft ${scope} at ${snapshot.revision}`,
      parentSha: published.contentCommitSha
    });
    try {
      await git.createRef(refName, commitSha);
    } catch (error) {
      if (error.status !== 422) throw error;
    }
    return readDraft(scope);
  }

  async function readDraft(scopeInput = "default") {
    const draft = await readDraftState(scopeInput);
    return Object.freeze({ scope: draft.scope, revision: draft.snapshot.revision, snapshot: draft.snapshot });
  }

  async function writeDraft({ scope: scopeInput = "default", expectedRevision, idempotencyKey, replacements }) {
    const scope = normalizeScope(scopeInput);
    const key = requiredIdempotencyKey(idempotencyKey);
    const fingerprint = stableHash({ expectedRevision, replacements });
    const draft = await readDraftState(scope);
    const prior = draft.state.operations?.[key];
    if (prior) {
      if (prior.fingerprint !== fingerprint) throw new ContentStoreConflictError("Idempotency key was already used for a different request", { code: "IDEMPOTENCY_KEY_REUSE" });
      return Object.freeze({ scope, revision: prior.resultRevision, parentRevision: prior.parentRevision, diagnostics: [] });
    }
    if (String(expectedRevision || "") !== draft.snapshot.revision) {
      throw new ContentStoreConflictError("Draft revision is stale", { code: "DRAFT_REVISION_CONFLICT", expectedRevision: String(expectedRevision || ""), actualRevision: draft.snapshot.revision });
    }
    const next = replaceSnapshotFiles(draft.snapshot, replacements, { allowNewFiles: true });
    const validation = await validateSnapshot(next);
    if (validation?.ok === false) throw Object.assign(new Error("Draft content validation failed"), { code: "CONTENT_VALIDATION_FAILED", diagnostics: validation.diagnostics || [] });
    const operations = { ...(draft.state.operations || {}), [key]: { fingerprint, parentRevision: draft.snapshot.revision, resultRevision: next.revision } };
    const operationKeys = Object.keys(operations);
    for (const staleKey of operationKeys.slice(0, Math.max(0, operationKeys.length - 100))) delete operations[staleKey];
    const state = { scope, revision: next.revision, operations };
    const commitSha = await commitFiles({
      files: new Map([...snapshotFiles(next, "bundle/"), [DRAFT_STATE_PATH, jsonBytes(state)]]),
      message: `Save draft ${scope} ${next.revision} [${key}]`,
      parentSha: draft.ref.sha
    });
    await git.updateRefCas(draft.ref.ref, draft.ref.sha, commitSha);
    return Object.freeze({ scope, revision: next.revision, parentRevision: draft.snapshot.revision, diagnostics: validation?.diagnostics || [] });
  }

  async function validateDraft(scopeInput = "default") {
    const draft = await readDraft(scopeInput);
    const validation = await validateSnapshot(draft.snapshot);
    return Object.freeze({ scope: draft.scope, revision: draft.revision, ok: validation?.ok !== false, diagnostics: validation?.diagnostics || [] });
  }

  async function publishDraft({ scope: scopeInput = "default", expectedDraftRevision, expectedActiveRevision, idempotencyKey, release }) {
    const scope = normalizeScope(scopeInput);
    const key = requiredIdempotencyKey(idempotencyKey);
    const draft = await readDraftState(scope);
    const releaseState = await readReleaseState();
    const fingerprint = stableHash({ scope, expectedDraftRevision, expectedActiveRevision, release, contentRevision: draft.snapshot.revision });
    const prior = releaseState.revisions.operations?.[key];
    if (prior) {
      if (prior.fingerprint !== fingerprint) throw new ContentStoreConflictError("Idempotency key was already used for a different publish", { code: "IDEMPOTENCY_KEY_REUSE" });
      return Object.freeze({ scope, contentRevision: prior.contentRevision, release: Object.freeze(prior.release), diagnostics: [] });
    }
    if (String(expectedDraftRevision || "") !== draft.snapshot.revision) throw new ContentStoreConflictError("Draft revision changed before publish", { code: "DRAFT_REVISION_CONFLICT", expectedRevision: String(expectedDraftRevision || ""), actualRevision: draft.snapshot.revision });
    if (String(expectedActiveRevision || "") !== releaseState.release.releaseRevision) throw new ContentStoreConflictError("Active release changed before publish", { code: "ACTIVE_RELEASE_CONFLICT", expectedRevision: String(expectedActiveRevision || ""), actualRevision: releaseState.release.releaseRevision });
    const validation = await validateSnapshot(draft.snapshot);
    if (validation?.ok === false) throw Object.assign(new Error("Published content validation failed"), { code: "CONTENT_VALIDATION_FAILED", diagnostics: validation.diagnostics || [] });
    const contentHead = await git.getRef(contentRef);
    let contentCommitSha = releaseState.revisions[draft.snapshot.revision]?.contentCommitSha || "";
    if (!contentCommitSha) {
      contentCommitSha = await commitFiles({ files: snapshotFiles(draft.snapshot), message: `Publish content ${draft.snapshot.revision}`, parentSha: contentHead.sha });
      await git.updateRefCas(contentRef, contentHead.sha, contentCommitSha);
    }
    const active = createReleaseRecord({ ...release, gameId: draft.snapshot.manifest.gameId, contentRevision: draft.snapshot.revision }, releaseState.release.releaseRevision);
    const operations = { ...(releaseState.revisions.operations || {}), [key]: { fingerprint, contentRevision: draft.snapshot.revision, release: active } };
    const revisions = { ...releaseState.revisions, [draft.snapshot.revision]: { contentCommitSha, publishedByRelease: active.releaseRevision }, operations };
    const releaseCommitSha = await commitFiles({
      files: new Map([[ACTIVE_RELEASE_PATH, jsonBytes(active)], [PUBLISHED_REVISIONS_PATH, jsonBytes(revisions)]]),
      message: `Activate release ${active.releaseRevision} [${key}]`,
      parentSha: releaseState.ref.sha
    });
    await git.updateRefCas(releaseRef, releaseState.ref.sha, releaseCommitSha);
    return Object.freeze({ scope, contentRevision: draft.snapshot.revision, release: active, diagnostics: validation?.diagnostics || [] });
  }

  async function getActiveRelease() {
    return (await readReleaseState()).release;
  }

  async function loadPublishedRevision(revision) {
    const state = await readReleaseState();
    const entry = state.revisions[String(revision || "")];
    if (!entry?.contentCommitSha) throw new Error(`Content revision is not published: ${String(revision || "")}`);
    const snapshot = await loadSnapshotAtCommit(entry.contentCommitSha);
    if (snapshot.revision !== revision) throw new Error("Published revision index does not match bundle content");
    return snapshot;
  }

  async function listRevisions() {
    const state = await readReleaseState();
    return Object.freeze(Object.entries(state.revisions)
      .filter(([revision, entry]) => revision !== "operations" && entry?.contentCommitSha)
      .map(([revision]) => Object.freeze({ revision, active: revision === state.release.contentRevision })));
  }

  async function rollback({ targetContentRevision, expectedActiveRevision, idempotencyKey, release }) {
    const key = requiredIdempotencyKey(idempotencyKey);
    const state = await readReleaseState();
    const target = String(targetContentRevision || "");
    const entry = state.revisions[target];
    if (!entry?.contentCommitSha) throw new Error(`Published content revision does not exist: ${target}`);
    const fingerprint = stableHash({ target, expectedActiveRevision, release });
    const prior = state.revisions.operations?.[key];
    if (prior) {
      if (prior.fingerprint !== fingerprint) throw new ContentStoreConflictError("Idempotency key was already used for a different rollback", { code: "IDEMPOTENCY_KEY_REUSE" });
      return Object.freeze({ contentRevision: prior.contentRevision, release: Object.freeze(prior.release), diagnostics: [] });
    }
    if (String(expectedActiveRevision || "") !== state.release.releaseRevision) throw new ContentStoreConflictError("Active release changed before rollback", { code: "ACTIVE_RELEASE_CONFLICT", expectedRevision: String(expectedActiveRevision || ""), actualRevision: state.release.releaseRevision });
    const snapshot = await loadSnapshotAtCommit(entry.contentCommitSha);
    const validation = await validateSnapshot(snapshot);
    if (validation?.ok === false) throw Object.assign(new Error("Rollback content validation failed"), { code: "CONTENT_VALIDATION_FAILED", diagnostics: validation.diagnostics || [] });
    const active = createReleaseRecord({ ...release, gameId: snapshot.manifest.gameId, contentRevision: target }, state.release.releaseRevision);
    const revisions = { ...state.revisions, operations: { ...(state.revisions.operations || {}), [key]: { fingerprint, contentRevision: target, release: active } } };
    const commitSha = await commitFiles({ files: new Map([[ACTIVE_RELEASE_PATH, jsonBytes(active)], [PUBLISHED_REVISIONS_PATH, jsonBytes(revisions)]]), message: `Rollback release ${active.releaseRevision} [${key}]`, parentSha: state.ref.sha });
    await git.updateRefCas(releaseRef, state.ref.sha, commitSha);
    return Object.freeze({ contentRevision: target, release: active, diagnostics: validation?.diagnostics || [] });
  }

  return Object.freeze({ getActiveRelease, initialize, initializeDraft, listRevisions, loadPublishedRevision, publishDraft, readDraft, rollback, validateDraft, writeDraft });
}

module.exports = { createGithubContentBundleStore };
