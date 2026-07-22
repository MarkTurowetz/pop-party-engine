import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const schema = require("../shared/content-bundle-schema");
const { buildManifest, createContentSnapshot } = require("./content-snapshot-runtime");
const { createGithubContentBundleStore } = require("./github-content-bundle-store");

function fixtureSnapshot() {
  const files = new Map(schema.REQUIRED_CONTENT_PATHS.map((logicalPath) => [logicalPath, Buffer.from(`${JSON.stringify({ path: logicalPath })}\n`)]));
  const manifest = buildManifest({
    schemaVersion: 1,
    gameId: "example-game",
    engineContentSchemaVersion: "1.0.0",
    flowExpressionLanguageVersion: 1,
    gameMigrationLevel: 0,
    semanticRolesPath: "semantic-roles.json"
  }, files);
  return createContentSnapshot({ manifest, files });
}

function fakeGit() {
  let nonce = 0;
  const next = (prefix) => `${prefix}-${++nonce}`;
  const refs = new Map([["heads/main", "base-commit"]]);
  const blobs = new Map();
  const trees = new Map([["base-tree", []]]);
  const commits = new Map([["base-commit", { sha: "base-commit", treeSha: "base-tree", parentShas: [], message: "base" }]]);
  return {
    refs,
    createBlob: vi.fn(async (bytes) => { const sha = next("blob"); blobs.set(sha, Buffer.from(bytes)); return sha; }),
    readBlob: vi.fn(async (sha) => Buffer.from(blobs.get(sha))),
    createTree: vi.fn(async (entries) => { const sha = next("tree"); trees.set(sha, entries.map((entry) => ({ ...entry, type: "blob" }))); return sha; }),
    readTree: vi.fn(async (sha) => trees.get(sha).map((entry) => ({ ...entry }))),
    createCommit: vi.fn(async ({ message, treeSha, parentSha }) => { const sha = next("commit"); commits.set(sha, { sha, treeSha, parentShas: parentSha ? [parentSha] : [], message }); return sha; }),
    getCommit: vi.fn(async (sha) => ({ ...commits.get(sha) })),
    getRef: vi.fn(async (ref) => refs.has(ref) ? { ref, sha: refs.get(ref) } : null),
    createRef: vi.fn(async (ref, sha) => {
      if (refs.has(ref)) throw Object.assign(new Error("exists"), { status: 422 });
      refs.set(ref, sha);
      return { ref, sha };
    }),
    updateRefCas: vi.fn(async (ref, expectedSha, sha) => {
      const actual = refs.get(ref) || "";
      if (actual !== expectedSha) throw Object.assign(new Error("conflict"), { status: 409, code: "GITHUB_REF_CONFLICT", expectedSha, actualSha: actual });
      refs.set(ref, sha);
      return { ref, sha };
    })
  };
}

const release = { gameBuild: "1055", engineVersion: "1.0.0", pluginVersion: "1.0.0" };

describe("GitHub content bundle store", () => {
  it("persists complete drafts, restart-safe idempotency, publish, and rollback", async () => {
    const git = fakeGit();
    let store = createGithubContentBundleStore({ git });
    const initial = fixtureSnapshot();
    const initialized = await store.initialize({ initialSnapshot: initial, release });
    expect(initialized.contentRevision).toBe(initial.revision);

    const draft = await store.initializeDraft("mark");
    const saveRequest = {
      scope: "mark",
      expectedRevision: draft.revision,
      idempotencyKey: "draft-save-0001",
      replacements: { "constants.json": { gameTitle: "Flip 7" } }
    };
    const saved = await store.writeDraft(saveRequest);
    expect(saved.revision).not.toBe(initial.revision);

    store = createGithubContentBundleStore({ git });
    await expect(store.writeDraft(saveRequest)).resolves.toMatchObject({ revision: saved.revision, parentRevision: initial.revision });
    const activeBefore = await store.getActiveRelease();
    const published = await store.publishDraft({
      scope: "mark",
      expectedDraftRevision: saved.revision,
      expectedActiveRevision: activeBefore.releaseRevision,
      idempotencyKey: "publish-save-0001",
      release: { ...release, gameBuild: "1056" }
    });
    expect(published.contentRevision).toBe(saved.revision);
    expect((await store.loadPublishedRevision(saved.revision)).readJson("constants.json")).toEqual({ gameTitle: "Flip 7" });

    store = createGithubContentBundleStore({ git });
    await expect(store.publishDraft({
      scope: "mark",
      expectedDraftRevision: saved.revision,
      expectedActiveRevision: activeBefore.releaseRevision,
      idempotencyKey: "publish-save-0001",
      release: { ...release, gameBuild: "1056" }
    })).resolves.toMatchObject({ contentRevision: saved.revision });

    const rolledBack = await store.rollback({
      targetContentRevision: initial.revision,
      expectedActiveRevision: published.release.releaseRevision,
      idempotencyKey: "rollback-save-0001",
      release: { ...release, gameBuild: "1057" }
    });
    expect(rolledBack.contentRevision).toBe(initial.revision);
    expect((await store.getActiveRelease()).contentRevision).toBe(initial.revision);
    store = createGithubContentBundleStore({ git });
    await expect(store.rollback({
      targetContentRevision: initial.revision,
      expectedActiveRevision: published.release.releaseRevision,
      idempotencyKey: "rollback-save-0001",
      release: { ...release, gameBuild: "1057" }
    })).resolves.toMatchObject({ contentRevision: initial.revision, release: { releaseRevision: rolledBack.release.releaseRevision } });
    expect(await store.listRevisions()).toEqual(expect.arrayContaining([
      { revision: initial.revision, active: true },
      { revision: saved.revision, active: false }
    ]));
  });

  it("rejects stale draft and active release revisions without updating refs", async () => {
    const git = fakeGit();
    const store = createGithubContentBundleStore({ git });
    const initial = fixtureSnapshot();
    await store.initialize({ initialSnapshot: initial, release });
    await store.initializeDraft();
    const updatesBefore = git.updateRefCas.mock.calls.length;

    await expect(store.writeDraft({
      expectedRevision: "stale",
      idempotencyKey: "draft-save-0001",
      replacements: { "flow.json": { states: [] } }
    })).rejects.toMatchObject({ code: "DRAFT_REVISION_CONFLICT", status: 409 });
    await expect(store.publishDraft({
      expectedDraftRevision: initial.revision,
      expectedActiveRevision: "stale",
      idempotencyKey: "publish-save-0001",
      release
    })).rejects.toMatchObject({ code: "ACTIVE_RELEASE_CONFLICT", status: 409 });
    expect(git.updateRefCas.mock.calls.length).toBe(updatesBefore);
  });

  it("never substitutes another revision when an index entry is missing", async () => {
    const git = fakeGit();
    const store = createGithubContentBundleStore({ git });
    await store.initialize({ initialSnapshot: fixtureSnapshot(), release });
    await expect(store.loadPublishedRevision("f".repeat(64))).rejects.toThrow(/not published/);
  });
});
