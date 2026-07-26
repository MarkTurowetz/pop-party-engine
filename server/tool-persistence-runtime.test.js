import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const { assertUniqueGameFlowIds, createToolPersistenceRuntime } = require("./tool-persistence-runtime");

describe("game flow persistence safeguards", () => {
  it("reads an installed live prototype snapshot without falling back to packaged content", async () => {
    const authoritative = { states: [{ id: "authoritative" }] };
    const readLocalGameFlowSource = vi.fn(() => ({ states: [{ id: "stale-local" }] }));
    const gameFlowStore = {
      storageKind: "live-prototype",
      source: authoritative,
      revision: "working-revision",
      loadedAt: Date.now(),
      error: ""
    };
    const runtime = createToolPersistenceRuntime({
      gameFlowStore,
      readGameFlowSource: () => gameFlowStore.source,
      readLocalGameFlowSource
    });

    await expect(runtime.loadGameFlowSource({ refresh: true })).resolves.toEqual(authoritative);
    expect(readLocalGameFlowSource).not.toHaveBeenCalled();
  });

  it("fails closed when a live prototype snapshot has not been installed", async () => {
    const readLocalGameFlowSource = vi.fn(() => ({ states: [{ id: "stale-local" }] }));
    const gameFlowStore = {
      storageKind: "live-prototype",
      source: { states: [] },
      revision: "",
      loadedAt: 0,
      error: ""
    };
    const runtime = createToolPersistenceRuntime({
      gameFlowStore,
      readGameFlowSource: () => gameFlowStore.source,
      readLocalGameFlowSource
    });

    await expect(runtime.loadGameFlowSource()).rejects.toThrow(/Live prototype game flow source is unavailable/);
    expect(readLocalGameFlowSource).not.toHaveBeenCalled();
    expect(gameFlowStore.error).toMatch(/unavailable/);
  });

  it("rejects direct live prototype writes instead of modifying packaged content", async () => {
    const existing = { states: [{ id: "authoritative", actions: [] }], routeNodes: [] };
    const writeJsonFile = vi.fn();
    const gameFlowStore = {
      storageKind: "live-prototype",
      source: existing,
      revision: "working-revision",
      loadedAt: Date.now(),
      error: ""
    };
    const runtime = createToolPersistenceRuntime({
      gameFlowFile: "game-flow.json",
      gameFlowBackupDir: "backups",
      gameFlowStore,
      readGameFlowSource: () => gameFlowStore.source,
      readLocalGameFlowSource: vi.fn(),
      mergeFlowWithExistingSubActions: (flow) => flow,
      normalizeGameFlow: (flow) => flow,
      backupJsonFile: vi.fn(),
      writeJsonFile
    });

    await expect(runtime.writeGameFlow(existing)).rejects.toMatchObject({
      code: "LIVE_PROTOTYPE_DIRECT_WRITE_REJECTED",
      status: 409
    });
    expect(writeJsonFile).not.toHaveBeenCalled();
  });

  it("rejects authoritative GitHub reads when credentials are missing", async () => {
    const gameFlowStore = {
      storageKind: "github",
      source: { states: [] },
      loadedAt: 0,
      remoteSha: "",
      error: ""
    };
    const runtime = createToolPersistenceRuntime({
      gameFlowGithubPath: "game-flow.json",
      gameFlowStore,
      githubToken: "",
      readGameFlowSource: () => gameFlowStore.source,
      readLocalGameFlowSource: vi.fn()
    });

    await expect(runtime.loadGameFlowSource({ refresh: true })).rejects.toThrow(/not configured for authoritative GitHub game flow storage/);
    expect(gameFlowStore.error).toMatch(/not configured/);
  });

  it("rejects missing or unavailable authoritative GitHub content without seeding it", async () => {
    const gameFlowStore = {
      storageKind: "github",
      source: { states: [{ id: "local" }] },
      loadedAt: 0,
      remoteSha: "",
      error: ""
    };
    const writeGithubGameFlowSource = vi.fn();
    const runtime = createToolPersistenceRuntime({
      gameFlowGithubPath: "game-flow.json",
      gameFlowStore,
      githubToken: "token",
      readGameFlowSource: () => gameFlowStore.source,
      readGithubGameFlowSource: vi.fn(async () => null),
      writeGithubGameFlowSource
    });

    await expect(runtime.loadGameFlowSource({ refresh: true })).rejects.toThrow(/Required GitHub game flow source is missing/);
    expect(writeGithubGameFlowSource).not.toHaveBeenCalled();
    expect(gameFlowStore.source).toEqual({ states: [{ id: "local" }] });
    expect(gameFlowStore.loadedAt).toBe(0);
  });

  it("rejects an invalid authoritative art manifest shape", async () => {
    const artManifestStore = {
      storageKind: "github",
      source: {},
      loadedAt: 0,
      remoteSha: "",
      error: ""
    };
    const runtime = createToolPersistenceRuntime({
      artManifestGithubPath: "art-manifest.json",
      artManifestStore,
      githubToken: "token",
      readArtManifestSource: () => artManifestStore.source,
      readGithubJsonSource: vi.fn(async () => ({ data: [], sha: "bad" }))
    });

    await expect(runtime.loadArtManifestSource({ refresh: true })).rejects.toThrow(/Art manifest must be a JSON object/);
    expect(artManifestStore.loadedAt).toBe(0);
    expect(artManifestStore.remoteSha).toBe("");
  });

  it("rejects duplicate nested action ids", () => {
    expect(() =>
      assertUniqueGameFlowIds({
        states: [
          {
            id: "lobby",
            actions: [
              { id: "duplicate" },
              { id: "parent", actions: [{ id: "duplicate" }] }
            ]
          }
        ]
      })
    ).toThrow(/Duplicate flow action id "duplicate"/);
  });

  it("writes the normalized flow instead of the unnormalized merge result", async () => {
    const existing = { states: [{ id: "lobby", actions: [] }], routeNodes: [] };
    const normalized = {
      states: [{ id: "lobby", actions: [{ id: "clean", type: "presentText" }] }],
      routeNodes: []
    };
    const writeJsonFile = vi.fn();
    const gameFlowStore = { storageKind: "local", source: existing, loadedAt: 0, error: "" };
    const runtime = createToolPersistenceRuntime({
      gameFlowFile: "game-flow.json",
      gameFlowBackupDir: "backups",
      gameFlowStore,
      readLocalGameFlowSource: () => existing,
      readGameFlowSource: () => gameFlowStore.source,
      mergeFlowWithExistingSubActions: (flow) => flow,
      normalizeGameFlow: () => normalized,
      backupJsonFile: vi.fn(),
      writeJsonFile
    });

    const saved = await runtime.writeGameFlow({
      states: [{ id: "lobby", actions: [{ id: "dirty", type: "presentText", stale: true }] }],
      routeNodes: []
    });

    expect(writeJsonFile).toHaveBeenCalledWith("game-flow.json", normalized);
    expect(saved).toEqual(normalized);
    expect(gameFlowStore.source).toEqual(normalized);
  });
});
