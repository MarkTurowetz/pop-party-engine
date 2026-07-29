import { describe, expect, it, vi } from "vitest";
import { beginLivePrototypeWorkspace, requestLivePrototypeSave } from "./livePrototypeWorkspace";
import type { ApiClient } from "../../api/http";
import type {
  BrowserWorkspaceCheckpoint,
  WorkspaceCheckpointStore
} from "./workspaceCheckpointStore";

function checkpoint(overrides: Partial<BrowserWorkspaceCheckpoint> = {}): BrowserWorkspaceCheckpoint {
  return {
    schemaVersion: 1,
    gameId: "game-one",
    workingRevision: "local-one",
    gitContentRevision: "git-one",
    gitReleaseRevision: "release-one",
    savedAt: "2026-07-28T00:00:00.000Z",
    manifest: {},
    files: {},
    ...overrides
  };
}

function memoryCheckpointStore(initial: BrowserWorkspaceCheckpoint | null = null): {
  store: WorkspaceCheckpointStore;
  current: () => BrowserWorkspaceCheckpoint | null;
} {
  let value = initial;
  return {
    store: {
      read: vi.fn(async () => value),
      write: vi.fn(async (next) => {
        value = structuredClone(next);
      }),
      clear: vi.fn(async () => {
        value = null;
      })
    },
    current: () => value
  };
}

function browserWindow() {
  const storage = new Map<string, string>();
  const listeners = new Map<string, EventListener>();
  const win = {
    location: { origin: "https://tools.example", reload: vi.fn() },
    sessionStorage: {
      getItem: (key: string) => storage.get(key) || null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key)
    },
    setInterval: vi.fn(() => 7),
    clearInterval: vi.fn(),
    setTimeout: vi.fn(() => 8),
    addEventListener: vi.fn((type: string, listener: EventListener) => listeners.set(type, listener)),
    removeEventListener: vi.fn(),
    globalSaveButton: { click: vi.fn() }
  } as unknown as Window & { globalSaveButton: { click(): void } };
  return { listeners, storage, win };
}

function sessionResponse() {
  return {
    ok: true,
    active: true,
    sessionId: "session-one",
    baselineRevision: "git-one",
    localCheckpointRevision: "git-one",
    workingRevision: "git-one",
    gitSynced: true,
    leaseMs: 6000,
    release: {
      contentRevision: "git-one",
      releaseRevision: "release-one"
    }
  };
}

describe("live prototype browser workspace", () => {
  it("checkpoints locally before background Git sync completes", async () => {
    let finishGitSync: (value: unknown) => void = () => undefined;
    const gitSync = new Promise((resolve) => {
      finishGitSync = resolve;
    });
    const localCheckpoint = checkpoint();
    const postJson = vi.fn(async (path: string) => {
      if (path.endsWith("/session")) return sessionResponse();
      if (path.endsWith("/checkpoint")) {
        return { ...sessionResponse(), checkpoint: localCheckpoint };
      }
      if (path.endsWith("/save")) return gitSync;
      return { ok: true };
    });
    const persisted = memoryCheckpointStore();
    const { storage, win } = browserWindow();
    const workspace = await beginLivePrototypeWorkspace(
      { postJson } as unknown as ApiClient,
      win,
      persisted.store
    );

    expect(storage.get("pop-party-authoring-session")).toBe("session-one");
    expect(requestLivePrototypeSave(win)).toBe(true);
    expect(win.globalSaveButton.click).toHaveBeenCalledTimes(1);
    await workspace?.save();

    expect(persisted.current()?.workingRevision).toBe("local-one");
    expect(workspace?.getStatus().phase).toBe("syncing");

    finishGitSync({
      ...sessionResponse(),
      saved: true,
      syncedRevision: "local-one",
      result: {
        contentRevision: "local-one",
        release: { contentRevision: "local-one", releaseRevision: "release-two" }
      }
    });
    await workspace?.syncNow();
    expect(workspace?.getStatus().phase).toBe("synced");

    workspace?.dispose();
    expect(postJson.mock.calls.map(([path]) => path)).toEqual([
      "/api/authoring/workspace/session",
      "/api/authoring/workspace/checkpoint",
      "/api/authoring/workspace/save",
      "/api/authoring/workspace/discard"
    ]);
    expect(storage.has("pop-party-authoring-session")).toBe(false);
  });

  it("restores a browser checkpoint before editors mount", async () => {
    const localCheckpoint = checkpoint();
    const postJson = vi.fn(async (path: string) => {
      if (path.endsWith("/session")) return sessionResponse();
      if (path.endsWith("/restore-checkpoint")) {
        return {
          ...sessionResponse(),
          localCheckpointRevision: localCheckpoint.workingRevision,
          workingRevision: localCheckpoint.workingRevision,
          gitSynced: false
        };
      }
      return { ok: true };
    });
    const persisted = memoryCheckpointStore(localCheckpoint);
    const { win } = browserWindow();

    const workspace = await beginLivePrototypeWorkspace(
      { postJson } as unknown as ApiClient,
      win,
      persisted.store
    );

    expect(postJson.mock.calls[1]).toEqual([
      "/api/authoring/workspace/restore-checkpoint",
      { checkpoint: localCheckpoint }
    ]);
    expect(workspace?.getStatus()).toMatchObject({
      phase: "saved-local",
      localRevision: "local-one",
      gitRevision: "git-one"
    });
    expect(win.setTimeout).toHaveBeenCalledTimes(1);
  });

  it("starts a clean session when an expired session has no browser checkpoint", async () => {
    let sessionStarts = 0;
    const postJson = vi.fn(async (path: string) => {
      if (path.endsWith("/session")) {
        sessionStarts += 1;
        return {
          ...sessionResponse(),
          sessionId: `session-${sessionStarts}`,
          recoveryRequired: sessionStarts === 1
        };
      }
      return { ok: true };
    });
    const persisted = memoryCheckpointStore();
    const { storage, win } = browserWindow();

    await beginLivePrototypeWorkspace(
      { postJson } as unknown as ApiClient,
      win,
      persisted.store
    );

    expect(postJson.mock.calls.map(([path]) => path)).toEqual([
      "/api/authoring/workspace/session",
      "/api/authoring/workspace/discard",
      "/api/authoring/workspace/session"
    ]);
    expect(storage.get("pop-party-authoring-session")).toBe("session-2");
  });

  it("clears a stale browser session when live prototype authoring is unavailable", async () => {
    const unavailable = Object.assign(new Error("Live prototype authoring is not enabled"), {
      status: 404,
      payload: { errorCode: "LIVE_PROTOTYPE_DISABLED" }
    });
    const postJson = vi.fn(async () => {
      throw unavailable;
    });
    const { storage, win } = browserWindow();
    storage.set("pop-party-authoring-session", "stale-session");

    const workspace = await beginLivePrototypeWorkspace(
      { postJson } as unknown as ApiClient,
      win,
      memoryCheckpointStore().store
    );

    expect(workspace).toBeNull();
    expect(storage.has("pop-party-authoring-session")).toBe(false);
  });

  it("reconnects once when a checkpoint reaches a transient non-authoring instance", async () => {
    let checkpoints = 0;
    const localCheckpoint = checkpoint();
    const unavailable = Object.assign(new Error("Live prototype authoring is not enabled"), {
      status: 404,
      payload: { errorCode: "LIVE_PROTOTYPE_DISABLED" }
    });
    const postJson = vi.fn(async (path: string) => {
      if (path.endsWith("/session")) return sessionResponse();
      if (path.endsWith("/checkpoint")) {
        checkpoints += 1;
        if (checkpoints === 1) throw unavailable;
        return { ...sessionResponse(), checkpoint: localCheckpoint };
      }
      if (path.endsWith("/save")) {
        return {
          ...sessionResponse(),
          syncedRevision: localCheckpoint.workingRevision
        };
      }
      return { ok: true };
    });
    const { win } = browserWindow();
    const workspace = await beginLivePrototypeWorkspace(
      { postJson } as unknown as ApiClient,
      win,
      memoryCheckpointStore().store
    );

    await workspace?.save();

    expect(postJson.mock.calls.map(([path]) => path)).toEqual([
      "/api/authoring/workspace/session",
      "/api/authoring/workspace/checkpoint",
      "/api/authoring/workspace/session",
      "/api/authoring/workspace/checkpoint",
      "/api/authoring/workspace/save"
    ]);
  });

  it("clears the browser checkpoint when explicitly restoring Git", async () => {
    const postJson = vi.fn(async (path: string) => {
      if (path.endsWith("/session")) return sessionResponse();
      return { ok: true };
    });
    const persisted = memoryCheckpointStore(checkpoint({
      workingRevision: "git-one",
      gitContentRevision: "git-one"
    }));
    const { storage, win } = browserWindow();
    const workspace = await beginLivePrototypeWorkspace(
      { postJson } as unknown as ApiClient,
      win,
      persisted.store
    );

    await workspace?.restoreFromGit();

    expect(persisted.current()).toBeNull();
    expect(storage.has("pop-party-authoring-session")).toBe(false);
    expect(postJson.mock.calls.at(-1)?.[0]).toBe("/api/authoring/workspace/discard");
  });

  it("preserves a conflicting browser checkpoint until Restore from Git is explicit", async () => {
    const conflict = Object.assign(new Error("Git changed after this browser save"), {
      payload: { errorCode: "BROWSER_CHECKPOINT_GIT_CONFLICT" }
    });
    const postJson = vi.fn(async (path: string) => {
      if (path.endsWith("/session")) return {
        ...sessionResponse(),
        baselineRevision: "git-two",
        workingRevision: "git-two"
      };
      if (path.endsWith("/restore-checkpoint")) throw conflict;
      return { ok: true };
    });
    const persisted = memoryCheckpointStore(checkpoint());
    const { win } = browserWindow();

    const workspace = await beginLivePrototypeWorkspace(
      { postJson } as unknown as ApiClient,
      win,
      persisted.store
    );

    expect(workspace?.getStatus()).toMatchObject({ phase: "error" });
    await expect(workspace?.save()).rejects.toThrow(/Git changed/);
    expect(persisted.current()?.workingRevision).toBe("local-one");

    await workspace?.restoreFromGit();
    expect(persisted.current()).toBeNull();
  });
});
