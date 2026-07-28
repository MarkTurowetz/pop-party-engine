import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const { createGithubContentBundleStore } = require("./github-content-bundle-store");
const { createLocalContentBundleProvider } = require("./local-content-bundle-provider");
const { replaceSnapshotFiles } = require("./content-snapshot-runtime");

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

function fakeGit() {
  let nonce = 0;
  const next = (prefix) => `${prefix}-${++nonce}`;
  const refs = new Map([["heads/main", "base-commit"]]);
  const blobs = new Map();
  const trees = new Map([["base-tree", []]]);
  const commits = new Map([["base-commit", {
    sha: "base-commit",
    treeSha: "base-tree",
    parentShas: [],
    message: "base"
  }]]);
  return {
    refs,
    createBlob: vi.fn(async (bytes) => {
      const buffer = Buffer.from(bytes);
      const sha = crypto
        .createHash("sha1")
        .update(`blob ${buffer.length}\0`)
        .update(buffer)
        .digest("hex");
      blobs.set(sha, Buffer.from(bytes));
      return sha;
    }),
    readBlob: vi.fn(async (sha) => Buffer.from(blobs.get(sha))),
    createTree: vi.fn(async (entries) => {
      const sha = next("tree");
      trees.set(sha, entries.map((entry) => ({ ...entry, type: "blob" })));
      return sha;
    }),
    readTree: vi.fn(async (sha) => trees.get(sha).map((entry) => ({ ...entry }))),
    createCommit: vi.fn(async ({ message, treeSha, parentSha }) => {
      const sha = next("commit");
      commits.set(sha, { sha, treeSha, parentShas: parentSha ? [parentSha] : [], message });
      return sha;
    }),
    getCommit: vi.fn(async (sha) => ({ ...commits.get(sha) })),
    getRef: vi.fn(async (ref) => refs.has(ref) ? { ref, sha: refs.get(ref) } : null),
    createRef: vi.fn(async (ref, sha) => {
      refs.set(ref, sha);
      return { ref, sha };
    }),
    updateRefCas: vi.fn(async (ref, expectedSha, sha) => {
      if (refs.get(ref) !== expectedSha) {
        throw Object.assign(new Error("conflict"), { status: 409, code: "GITHUB_REF_CONFLICT" });
      }
      refs.set(ref, sha);
      return { ref, sha };
    })
  };
}

function snapshot() {
  return createLocalContentBundleProvider({
    root: path.join(projectRoot, "apps/reference/content")
  }).loadPublishedRevision();
}

const release = {
  gameBuild: "1.0.17",
  engineVersion: "1.3.0",
  pluginVersion: "1.0.17"
};

describe("GitHub atomic workspace commit", () => {
  it("activates content with one final release-ref CAS and survives restart", async () => {
    const git = fakeGit();
    let store = createGithubContentBundleStore({ git });
    const initial = snapshot();
    await store.initialize({ initialSnapshot: initial, release });
    const active = await store.getActiveRelease();
    const constants = initial.readJson("constants.json");
    const working = replaceSnapshotFiles(initial, {
      "constants.json": { ...constants, gameTitle: "Atomic workspace" },
      "blobs/atomic.bin": Buffer.from("atomic")
    }, { allowNewFiles: true });
    const updatesBefore = git.updateRefCas.mock.calls.length;
    git.createBlob.mockClear();
    const committed = await store.commitWorkspace({
      snapshot: working,
      expectedActiveRevision: active.releaseRevision,
      idempotencyKey: "workspace-atomic-0001",
      release
    });
    expect(git.updateRefCas.mock.calls.slice(updatesBefore)).toEqual([
      ["heads/game-releases", expect.any(String), expect.any(String)]
    ]);
    expect(git.createBlob).toHaveBeenCalledTimes(5);
    store = createGithubContentBundleStore({ git });
    expect((await store.getActiveRelease()).contentRevision).toBe(working.revision);
    expect((await store.loadPublishedRevision(committed.contentRevision)).readBytes("blobs/atomic.bin"))
      .toEqual(Buffer.from("atomic"));
  });

  it("uploads only changed workspace blobs with bounded concurrency", async () => {
    const git = fakeGit();
    const store = createGithubContentBundleStore({ git, blobUploadConcurrency: 2 });
    const initial = snapshot();
    await store.initialize({ initialSnapshot: initial, release });
    const active = await store.getActiveRelease();
    const working = replaceSnapshotFiles(initial, {
      "constants.json": { ...initial.readJson("constants.json"), gameTitle: "Concurrent workspace" },
      "flow.json": { ...initial.readJson("flow.json"), version: "concurrent-workspace" },
      "layouts/stage.json": { ...initial.readJson("layouts/stage.json"), version: "concurrent-workspace" },
      "layouts/controller.json": {
        ...initial.readJson("layouts/controller.json"),
        version: "concurrent-workspace"
      }
    });
    let activeUploads = 0;
    let maxActiveUploads = 0;
    const createBlob = git.createBlob.getMockImplementation();
    git.createBlob.mockClear();
    git.createBlob.mockImplementation(async (bytes) => {
      activeUploads += 1;
      maxActiveUploads = Math.max(maxActiveUploads, activeUploads);
      await new Promise((resolve) => setTimeout(resolve, 2));
      try {
        return await createBlob(bytes);
      } finally {
        activeUploads -= 1;
      }
    });

    await store.commitWorkspace({
      snapshot: working,
      expectedActiveRevision: active.releaseRevision,
      idempotencyKey: "workspace-concurrent-0001",
      release
    });

    expect(maxActiveUploads).toBe(2);
    expect(git.createBlob).toHaveBeenCalledTimes(7);
  });

  it("leaves the previous release authoritative when the final CAS fails", async () => {
    const git = fakeGit();
    let store = createGithubContentBundleStore({ git });
    const initial = snapshot();
    await store.initialize({ initialSnapshot: initial, release });
    const active = await store.getActiveRelease();
    const working = replaceSnapshotFiles(initial, {
      "constants.json": { ...initial.readJson("constants.json"), gameTitle: "Must stay orphaned" }
    });
    git.updateRefCas.mockRejectedValueOnce(Object.assign(new Error("simulated conflict"), {
      status: 409,
      code: "GITHUB_REF_CONFLICT"
    }));
    await expect(store.commitWorkspace({
      snapshot: working,
      expectedActiveRevision: active.releaseRevision,
      idempotencyKey: "workspace-failed-0001",
      release
    })).rejects.toMatchObject({ code: "GITHUB_REF_CONFLICT" });

    store = createGithubContentBundleStore({ git });
    expect((await store.getActiveRelease()).contentRevision).toBe(initial.revision);
    await expect(store.loadPublishedRevision(working.revision)).rejects.toThrow(/not published/);
  });
});
