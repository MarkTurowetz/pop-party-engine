import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { afterEach, describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const { createReleaseRecord } = require("../packages/engine/src/server/revisioned-content-store-runtime");
const {
  activateReferenceRelease,
  parseArguments: parseCoordinateArguments,
  rollbackReferenceRelease
} = require("./coordinate-reference-release");
const {
  deployHookUrl,
  triggerRenderDeploy
} = require("./trigger-render-deploy");
const {
  deployReferencePreview,
  parseArguments: parsePreviewArguments,
  previewChecks,
  verifyPreviewDeployment
} = require("./deploy-reference-preview");
const {
  probeProduction,
  verifyProductionRelease
} = require("./verify-production-release");
const {
  publishPublicPackage,
  publishedPackageSnapshotSpec
} = require("./publish-public-package");

const temporaryRoots = [];

function jsonBytes(value) {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function gitFixture(initialRelease) {
  let refSha = "commit-1";
  let counter = 1;
  let currentEntries = [
    { path: "active-release.json", sha: "active-1" },
    { path: "published-revisions.json", sha: "revisions-1" }
  ];
  const blobs = new Map([
    ["active-1", jsonBytes(initialRelease)],
    ["revisions-1", jsonBytes({
      [initialRelease.contentRevision]: {
        contentCommitSha: "content-commit",
        publishedByRelease: initialRelease.releaseRevision
      },
      operations: {}
    })]
  ]);
  let pendingEntries = null;
  return {
    async getRef() {
      return { ref: "heads/game-releases", sha: refSha };
    },
    async getCommit() {
      return { sha: refSha, treeSha: `tree-${counter}` };
    },
    async readTree() {
      return currentEntries;
    },
    async readBlob(sha) {
      return blobs.get(sha);
    },
    async createBlob(bytes) {
      const sha = `blob-${++counter}`;
      blobs.set(sha, Buffer.from(bytes));
      return sha;
    },
    async createTree(entries) {
      pendingEntries = entries.map((entry) => ({ ...entry }));
      return `tree-${++counter}`;
    },
    async createCommit() {
      return `commit-${++counter}`;
    },
    async updateRefCas(_ref, expected, next) {
      if (expected !== refSha) throw new Error("fixture CAS conflict");
      refSha = next;
      currentEntries = pendingEntries;
    },
    current() {
      const entries = new Map(currentEntries.map((entry) => [entry.path, entry.sha]));
      return {
        refSha,
        release: JSON.parse(blobs.get(entries.get("active-release.json")).toString("utf8")),
        revisions: JSON.parse(blobs.get(entries.get("published-revisions.json")).toString("utf8"))
      };
    },
    replaceRelease(release) {
      const activeEntry = currentEntries.find((entry) => entry.path === "active-release.json");
      blobs.set(activeEntry.sha, jsonBytes(release));
    }
  };
}

function response({ status = 200, json, text }) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return json;
    },
    async text() {
      return text ?? JSON.stringify(json);
    }
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  for (const root of temporaryRoots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe("reference release coordination", () => {
  it("requires an exact activation version and explicit rollback state", () => {
    expect(parseCoordinateArguments([
      "activate",
      "--engine-version", "1.4.0",
      "--operation-key", "engine-1.4.0-release",
      "--state-file", "state.json"
    ])).toMatchObject({ command: "activate", engineVersion: "1.4.0" });
    expect(() => parseCoordinateArguments([
      "activate",
      "--engine-version", "latest",
      "--operation-key", "engine-latest-release",
      "--state-file", "state.json"
    ])).toThrow(/exact/);
  });

  it("advances only release coordinates while preserving active content", async () => {
    const initial = createReleaseRecord({
      gameId: "pop-party-reference",
      gameBuild: "1.0.17",
      engineVersion: "1.3.8",
      pluginVersion: "1.0.17",
      contentRevision: "content-123"
    });
    const git = gitFixture(initial);
    const activation = await activateReferenceRelease({
      git,
      releaseRef: "heads/game-releases",
      engineVersion: "1.3.9",
      operationKey: "engine-1.3.9-build-1200",
      gameDefinition: {
        gameId: "pop-party-reference",
        version: "1.0.17",
        engineCompatibility: "1.3.9"
      }
    });
    const current = git.current();
    expect(activation.changed).toBe(true);
    expect(current.release).toMatchObject({
      engineVersion: "1.3.9",
      contentRevision: "content-123",
      previousReleaseRevision: initial.releaseRevision
    });
    expect(current.revisions.operations["engine-1.3.9-build-1200"]).toMatchObject({
      contentRevision: "content-123",
      release: { releaseRevision: current.release.releaseRevision }
    });
  });

  it("atomically activates the checked-in reference bundle with the engine coordinates", async () => {
    const initial = createReleaseRecord({
      gameId: "pop-party-reference",
      gameBuild: "1.0.17",
      engineVersion: "1.3.38",
      pluginVersion: "1.0.17",
      contentRevision: "content-old"
    });
    const git = gitFixture(initial);
    const nextSnapshot = { revision: "content-new" };
    const nextRelease = createReleaseRecord({
      gameId: "pop-party-reference",
      gameBuild: "1.0.17",
      engineVersion: "1.4.0",
      pluginVersion: "1.0.17",
      contentRevision: "content-new"
    }, initial.releaseRevision);
    const commitWorkspace = vi.fn(async () => ({
      contentRevision: nextSnapshot.revision,
      release: nextRelease,
      diagnostics: []
    }));
    const activation = await activateReferenceRelease({
      git,
      releaseRef: "heads/game-releases",
      engineVersion: "1.4.0",
      operationKey: "engine-1.4.0-build-1271",
      workspaceSnapshot: nextSnapshot,
      store: { commitWorkspace },
      gameDefinition: {
        gameId: "pop-party-reference",
        version: "1.0.17",
        engineCompatibility: "1.4.0"
      }
    });
    expect(commitWorkspace).toHaveBeenCalledWith({
      snapshot: nextSnapshot,
      expectedActiveRevision: initial.releaseRevision,
      idempotencyKey: "engine-1.4.0-build-1271",
      release: {
        gameBuild: "1.0.17",
        engineVersion: "1.4.0",
        pluginVersion: "1.0.17"
      }
    });
    expect(activation).toMatchObject({
      changed: true,
      previousRelease: { contentRevision: "content-old" },
      activeRelease: { contentRevision: "content-new", engineVersion: "1.4.0" }
    });
  });

  it("writes a compensating release on deployment failure without moving content backward", async () => {
    const initial = createReleaseRecord({
      gameId: "pop-party-reference",
      gameBuild: "1.0.17",
      engineVersion: "1.3.8",
      pluginVersion: "1.0.17",
      contentRevision: "content-123"
    });
    const git = gitFixture(initial);
    const activation = await activateReferenceRelease({
      git,
      releaseRef: "heads/game-releases",
      engineVersion: "1.3.9",
      operationKey: "engine-1.3.9-build-1200",
      gameDefinition: {
        gameId: "pop-party-reference",
        version: "1.0.17",
        engineCompatibility: "1.3.9"
      }
    });
    const rollback = await rollbackReferenceRelease({
      git,
      releaseRef: "heads/game-releases",
      operationKey: "engine-1.3.9-build-1200",
      activation
    });
    expect(rollback.changed).toBe(true);
    expect(git.current().release).toMatchObject({
      engineVersion: "1.3.8",
      contentRevision: "content-123",
      previousReleaseRevision: activation.activeRelease.releaseRevision
    });
    await expect(activateReferenceRelease({
      git,
      releaseRef: "heads/game-releases",
      engineVersion: "1.3.9",
      operationKey: "engine-1.3.9-build-1200-attempt-2",
      gameDefinition: {
        gameId: "pop-party-reference",
        version: "1.0.17",
        engineCompatibility: "1.3.9"
      }
    })).resolves.toMatchObject({ changed: true });
  });

  it("refuses rollback when another release mutation won the CAS boundary", async () => {
    const initial = createReleaseRecord({
      gameId: "pop-party-reference",
      gameBuild: "1.0.17",
      engineVersion: "1.3.8",
      pluginVersion: "1.0.17",
      contentRevision: "content-123"
    });
    const git = gitFixture(initial);
    const activation = await activateReferenceRelease({
      git,
      releaseRef: "heads/game-releases",
      engineVersion: "1.3.9",
      operationKey: "engine-1.3.9-build-1200",
      gameDefinition: {
        gameId: "pop-party-reference",
        version: "1.0.17",
        engineCompatibility: "1.3.9"
      }
    });
    git.replaceRelease(createReleaseRecord({
      gameId: "pop-party-reference",
      gameBuild: "1.0.17",
      engineVersion: "1.3.9",
      pluginVersion: "1.0.18",
      contentRevision: "content-123"
    }, activation.activeRelease.releaseRevision));
    await expect(rollbackReferenceRelease({
      git,
      releaseRef: "heads/game-releases",
      operationKey: "engine-1.3.9-build-1200",
      activation
    })).rejects.toThrow(/refusing to overwrite concurrent/);
  });
});

describe("Render deployment trigger", () => {
  it("pins the deploy hook to the exact released commit without exposing the hook", async () => {
    const commit = "a".repeat(40);
    const url = deployHookUrl("https://api.render.com/deploy/srv-example?key=secret", commit);
    expect(url.searchParams.get("ref")).toBe(commit);
    const fetchImpl = vi.fn(async (requestUrl) => {
      expect(requestUrl.searchParams.get("key")).toBe("secret");
      return response({ status: 200, json: { deploy: { id: "dep-123" } } });
    });
    await expect(triggerRenderDeploy({
      hookUrl: "https://api.render.com/deploy/srv-example?key=secret",
      commit,
      fetchImpl
    })).resolves.toMatchObject({ accepted: true, deployId: "dep-123" });
  });
});

describe("reference preview deployment", () => {
  it("requires exact preview coordinates", () => {
    expect(parsePreviewArguments([
      "--base-url", "https://preview.example.com",
      "--release-authority-url", "https://production.example.com",
      "--engine-version", "1.3.19",
      "--commit", "a".repeat(40)
    ])).toMatchObject({
      baseUrl: "https://preview.example.com",
      releaseAuthorityUrl: "https://production.example.com",
      engineVersion: "1.3.19",
      commit: "a".repeat(40)
    });
    expect(() => parsePreviewArguments([
      "--base-url", "http://preview.example.com",
      "--release-authority-url", "https://production.example.com",
      "--engine-version", "1.3.19",
      "--commit", "a".repeat(40)
    ])).toThrow(/HTTPS/);
  });

  it("requires the preview channel, exact commit, and coordinated engine", () => {
    const commit = "a".repeat(40);
    expect(previewChecks({
      ok: true,
      application: { channel: "preview", commit: commit.slice(0, 8) },
      game: { engineCompatibility: "1.3.19" },
      engine: { version: "1.3.19" },
      release: { engineVersion: "1.3.19" }
    }, { commit, engineVersion: "1.3.19" })).toEqual({
      healthy: true,
      channel: true,
      commit: true,
      gameEngine: true,
      runtimeEngine: true,
      releaseEngine: true
    });
  });

  it("defers version-bump commits until production release coordinates are active", async () => {
    const fetchImpl = vi.fn(async () => response({
      json: {
        ok: true,
        release: { engineVersion: "1.3.19" }
      }
    }));
    await expect(deployReferencePreview({
      baseUrl: "https://preview.example.com",
      releaseAuthorityUrl: "https://production.example.com",
      engineVersion: "1.3.20",
      commit: "b".repeat(40),
      hookUrl: "https://api.render.com/deploy/srv-preview?key=secret",
      timeoutMs: 100,
      authorityTimeoutMs: 100,
      intervalMs: 10,
      fetchImpl
    })).resolves.toMatchObject({
      ok: true,
      deployed: false,
      reason: "release-coordinate-pending"
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("triggers and verifies the exact preview commit when coordinates match", async () => {
    const commit = "c".repeat(40);
    let healthReads = 0;
    const fetchImpl = vi.fn(async (url) => {
      if (String(url).includes("api.render.com")) {
        return response({ json: { deploy: { id: "dep-preview" } } });
      }
      healthReads += 1;
      if (healthReads === 1) {
        return response({ json: { ok: true, release: { engineVersion: "1.3.19" } } });
      }
      return response({
        json: {
          ok: true,
          application: { channel: "preview", commit: commit.slice(0, 8) },
          game: { engineCompatibility: "1.3.19" },
          engine: { version: "1.3.19" },
          release: { engineVersion: "1.3.19" }
        }
      });
    });
    await expect(deployReferencePreview({
      baseUrl: "https://preview.example.com",
      releaseAuthorityUrl: "https://production.example.com",
      engineVersion: "1.3.19",
      commit,
      hookUrl: "https://api.render.com/deploy/srv-preview?key=secret",
      timeoutMs: 100,
      authorityTimeoutMs: 100,
      intervalMs: 10,
      fetchImpl
    })).resolves.toMatchObject({
      ok: true,
      deployed: true,
      deployId: "dep-preview"
    });
  });

  it("retries until the exact preview commit is live", async () => {
    const commit = "d".repeat(40);
    let request = 0;
    let clock = 0;
    const fetchImpl = vi.fn(async () => {
      request += 1;
      return response({
        json: {
          ok: true,
          application: {
            channel: "preview",
            commit: (request < 2 ? "e".repeat(40) : commit).slice(0, 8)
          },
          game: { engineCompatibility: "1.3.19" },
          engine: { version: "1.3.19" },
          release: { engineVersion: "1.3.19" }
        }
      });
    });
    await expect(verifyPreviewDeployment({
      baseUrl: "https://preview.example.com",
      engineVersion: "1.3.19",
      commit,
      timeoutMs: 100,
      intervalMs: 10,
      fetchImpl,
      now: () => clock,
      wait: async (milliseconds) => {
        clock += milliseconds;
      }
    })).resolves.toMatchObject({ ok: true });
  });
});

describe("production release verification", () => {
  it("requires health, engine, release, and rendered build to agree", async () => {
    const fetchImpl = vi.fn(async (url) => url.includes("/api/health")
      ? response({
        json: {
          ok: true,
          game: { engineCompatibility: "1.3.9" },
          engine: {
            version: "1.3.9",
            capabilities: { browserWorkspaceCheckpoints: true }
          },
          release: { engineVersion: "1.3.9", releaseRevision: "release-123" }
        }
      })
      : response({ text: "<div class=\"version-badge\">v1.0.17.1200</div>" }));
    await expect(probeProduction({
      baseUrl: "https://example.com",
      engineVersion: "1.3.9",
      releaseRevision: "release-123",
      appVersion: "1.0.17.1200",
      fetchImpl,
      nonce: 1
    })).resolves.toMatchObject({ ok: true });
  });

  it("rejects a mixed deployment whose server lacks browser checkpoints", async () => {
    const fetchImpl = vi.fn(async (url) => url.includes("/api/health")
      ? response({
        json: {
          ok: true,
          game: { engineCompatibility: "1.3.9" },
          engine: {
            version: "1.3.8",
            capabilities: { browserWorkspaceCheckpoints: false }
          },
          release: { engineVersion: "1.3.9", releaseRevision: "release-123" }
        }
      })
      : response({ text: "<div class=\"version-badge\">v1.0.17.1200</div>" }));
    await expect(probeProduction({
      baseUrl: "https://example.com",
      engineVersion: "1.3.9",
      releaseRevision: "release-123",
      appVersion: "1.0.17.1200",
      fetchImpl,
      nonce: 1
    })).resolves.toMatchObject({
      ok: false,
      checks: {
        runtimeEngine: false,
        browserWorkspaceCheckpoints: false
      }
    });
  });

  it("retries boundedly until the new Render instance is serving", async () => {
    let request = 0;
    const fetchImpl = vi.fn(async (url) => {
      if (url.includes("/api/health")) {
        request += 1;
        return response({
          json: {
            ok: true,
            game: { engineCompatibility: request < 2 ? "1.3.8" : "1.3.9" },
            engine: {
              version: request < 2 ? "1.3.8" : "1.3.9",
              capabilities: { browserWorkspaceCheckpoints: true }
            },
            release: {
              engineVersion: request < 2 ? "1.3.8" : "1.3.9",
              releaseRevision: request < 2 ? "old" : "release-123"
            }
          }
        });
      }
      return response({ text: request < 2 ? "v1.0.17.1199" : "v1.0.17.1200" });
    });
    let clock = 0;
    await expect(verifyProductionRelease({
      baseUrl: "https://example.com",
      engineVersion: "1.3.9",
      releaseRevision: "release-123",
      appVersion: "1.0.17.1200",
      timeoutMs: 100,
      intervalMs: 10,
      fetchImpl,
      now: () => clock,
      wait: async (milliseconds) => {
        clock += milliseconds;
      }
    })).resolves.toMatchObject({ ok: true });
  });
});

describe("idempotent public package publication", () => {
  it("verifies an already-published package from the exact registry tarball metadata", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "pop-party-publish-"));
    temporaryRoots.push(root);
    fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({
      name: "@pop-party/example",
      version: "1.0.0"
    }));
    const spawnSync = vi.fn();
    let tarballAttempts = 0;
    const snapshotFactory = vi.fn(async (spec) => {
      if (spec === "@pop-party/example@1.0.0") {
        throw new Error("package-spec lookup has not propagated");
      }
      if (spec.startsWith("https://") && tarballAttempts++ === 0) {
        throw new Error("registry tarball has not propagated");
      }
      return {
        id: "@pop-party/example@1.0.0",
        digest: "matching-content"
      };
    });
    let clock = 0;
    const result = await publishPublicPackage({
      packagePath: root,
      snapshotFactory,
      fetchImpl: async () => response({
        json: {
          name: "@pop-party/example",
          version: "1.0.0",
          dist: {
            integrity: "sha512-registry-archive",
            tarball: "https://registry.npmjs.org/@pop-party/example/-/example-1.0.0.tgz"
          }
        }
      }),
      now: () => clock,
      wait: async (milliseconds) => {
        clock += milliseconds;
      },
      spawnSync
    });
    expect(result.status).toBe("already-published");
    expect(snapshotFactory).toHaveBeenNthCalledWith(1, path.resolve(root));
    expect(snapshotFactory).toHaveBeenNthCalledWith(
      2,
      "https://registry.npmjs.org/@pop-party/example/-/example-1.0.0.tgz"
    );
    expect(snapshotFactory).toHaveBeenNthCalledWith(
      3,
      "https://registry.npmjs.org/@pop-party/example/-/example-1.0.0.tgz"
    );
    expect(spawnSync).not.toHaveBeenCalled();
  });

  it("waits for a newly-published registry tarball to become downloadable", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "pop-party-publish-"));
    temporaryRoots.push(root);
    fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({
      name: "@pop-party/example",
      version: "1.0.0"
    }));
    let registryRequests = 0;
    const fetchImpl = vi.fn(async () => {
      registryRequests += 1;
      if (registryRequests === 1) return response({ status: 404 });
      return response({
        json: {
          dist: {
            tarball: "https://registry.npmjs.org/@pop-party/example/-/example-1.0.0.tgz"
          }
        }
      });
    });
    let tarballAttempts = 0;
    const snapshotFactory = vi.fn(async (spec) => {
      if (spec === path.resolve(root)) {
        return { id: "@pop-party/example@1.0.0", digest: "matching-content" };
      }
      if (tarballAttempts++ === 0) throw new Error("registry tarball returned HTTP 404");
      return { id: "@pop-party/example@1.0.0", digest: "matching-content" };
    });
    const spawnSync = vi.fn(() => ({ status: 0 }));
    let clock = 0;

    await expect(publishPublicPackage({
      packagePath: root,
      snapshotFactory,
      fetchImpl,
      spawnSync,
      now: () => clock,
      wait: async (milliseconds) => {
        clock += milliseconds;
      }
    })).resolves.toMatchObject({ status: "published" });

    expect(spawnSync).toHaveBeenCalledOnce();
    expect(snapshotFactory).toHaveBeenCalledTimes(3);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("fails closed when an existing immutable version has different bytes", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "pop-party-publish-"));
    temporaryRoots.push(root);
    fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({
      name: "@pop-party/example",
      version: "1.0.0"
    }));
    await expect(publishPublicPackage({
      packagePath: root,
      snapshotFactory: async (spec) => ({
        id: "@pop-party/example@1.0.0",
        digest: spec === path.resolve(root) ? "local-content" : "remote-content"
      }),
      fetchImpl: async () => response({
        json: {
          dist: {
            integrity: "sha512-remote",
            tarball: "https://registry.npmjs.org/@pop-party/example/-/example-1.0.0.tgz"
          }
        }
      })
    })).rejects.toThrow(/does not match this commit/);
  });

  it("rejects missing or untrusted registry tarball coordinates", () => {
    expect(() => publishedPackageSnapshotSpec({}, "@pop-party/example@1.0.0"))
      .toThrow(/valid tarball URL/);
    expect(() => publishedPackageSnapshotSpec({
      dist: { tarball: "https://example.com/example-1.0.0.tgz" }
    }, "@pop-party/example@1.0.0")).toThrow(/untrusted tarball URL/);
  });
});
