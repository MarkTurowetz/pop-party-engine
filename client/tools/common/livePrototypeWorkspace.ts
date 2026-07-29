import type { ApiClient } from "../../api/http";
import {
  createWorkspaceCheckpointStore,
  type BrowserWorkspaceCheckpoint,
  type WorkspaceCheckpointStore
} from "./workspaceCheckpointStore";

interface WorkspaceResponse {
  ok: boolean;
  active: boolean;
  sessionId: string;
  baselineRevision: string;
  localCheckpointRevision: string;
  workingRevision: string;
  gitSynced: boolean;
  recoveryRequired?: boolean;
  leaseMs: number;
  release?: {
    contentRevision?: string;
    releaseRevision?: string;
  };
  checkpoint?: BrowserWorkspaceCheckpoint;
  syncedRevision?: string;
  result?: {
    contentRevision?: string;
    release?: {
      contentRevision?: string;
      releaseRevision?: string;
    };
  };
}

export type WorkspaceSyncPhase = "synced" | "saved-local" | "syncing" | "error";

export interface WorkspaceSyncStatus {
  phase: WorkspaceSyncPhase;
  message: string;
  localRevision: string;
  gitRevision: string;
}

export interface LivePrototypeWorkspace {
  save(): Promise<WorkspaceResponse>;
  syncNow(): Promise<WorkspaceResponse | null>;
  restoreFromGit(): Promise<void>;
  subscribe(listener: (status: WorkspaceSyncStatus) => void): () => void;
  getStatus(): WorkspaceSyncStatus;
  dispose(): void;
}

export function requestLivePrototypeSave(
  win: Window | null = typeof window === "undefined" ? null : window
): boolean {
  if (!win) return false;
  if (!win.sessionStorage.getItem("pop-party-authoring-session")) return false;
  const globalSaveButton = (win as Window & { globalSaveButton?: HTMLButtonElement }).globalSaveButton;
  if (!globalSaveButton) return false;
  globalSaveButton.click();
  return true;
}

function idempotencyKey(): string {
  const random = globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2);
  return `workspace:${Date.now()}:${random}`;
}

export async function beginLivePrototypeWorkspace(
  client: ApiClient,
  win: Window = window,
  checkpointStore: WorkspaceCheckpointStore = createWorkspaceCheckpointStore(win)
): Promise<LivePrototypeWorkspace | null> {
  let started: WorkspaceResponse;
  try {
    started = await client.postJson<WorkspaceResponse, Record<string, never>>(
      "/api/authoring/workspace/session",
      {}
    );
  } catch (error) {
    const status = Number((error as { status?: unknown })?.status || 0);
    if (status === 404) {
      win.sessionStorage.removeItem("pop-party-authoring-session");
      return null;
    }
    const errorCode = String(
      (error as { payload?: { errorCode?: unknown } })?.payload?.errorCode || ""
    );
    if (status === 409 && errorCode === "AUTHORING_SESSION_BUSY") {
      win.sessionStorage.removeItem("pop-party-authoring-session");
      win.setTimeout(() => {
        win.dispatchEvent(new CustomEvent("pop-party-authoring-error", {
          detail: { message: error instanceof Error ? error.message : String(error) }
        }));
      }, 0);
      return null;
    }
    throw error;
  }
  win.sessionStorage.setItem("pop-party-authoring-session", started.sessionId);
  let storedCheckpoint = await checkpointStore.read();
  if (started.recoveryRequired && !storedCheckpoint) {
    await client.postJson("/api/authoring/workspace/discard", {
      sessionId: started.sessionId
    });
    win.sessionStorage.removeItem("pop-party-authoring-session");
    started = await client.postJson<WorkspaceResponse, Record<string, never>>(
      "/api/authoring/workspace/session",
      {}
    );
    win.sessionStorage.setItem("pop-party-authoring-session", started.sessionId);
  }

  const listeners = new Set<(status: WorkspaceSyncStatus) => void>();
  let status: WorkspaceSyncStatus = {
    phase: "synced",
    message: "Git is up to date",
    localRevision: started.localCheckpointRevision || started.workingRevision,
    gitRevision: started.baselineRevision
  };
  let syncPromise: Promise<WorkspaceResponse | null> | null = null;
  let syncAgain = false;
  let recoveryConflict: Error | null = null;

  function publishStatus(next: WorkspaceSyncStatus): void {
    status = next;
    for (const listener of listeners) listener(status);
  }

  function statusForLocalCheckpoint(checkpoint: BrowserWorkspaceCheckpoint): WorkspaceSyncStatus {
    const synced = checkpoint.workingRevision === checkpoint.gitContentRevision;
    return {
      phase: synced ? "synced" : "saved-local",
      message: synced ? "Git is up to date" : "Saved on this browser · waiting to sync to Git",
      localRevision: checkpoint.workingRevision,
      gitRevision: checkpoint.gitContentRevision
    };
  }

  if (storedCheckpoint) {
    if (
      storedCheckpoint.workingRevision === started.baselineRevision
      && !started.recoveryRequired
    ) {
      storedCheckpoint = {
        ...storedCheckpoint,
        gitContentRevision: started.baselineRevision,
        gitReleaseRevision: String(started.release?.releaseRevision || "")
      };
      await checkpointStore.write(storedCheckpoint);
      publishStatus(statusForLocalCheckpoint(storedCheckpoint));
    } else {
      try {
        const restored = await client.postJson<WorkspaceResponse, {
          checkpoint: BrowserWorkspaceCheckpoint;
        }>("/api/authoring/workspace/restore-checkpoint", {
          checkpoint: storedCheckpoint
        });
        started = { ...started, ...restored };
        publishStatus(statusForLocalCheckpoint(storedCheckpoint));
      } catch (error) {
        const errorCode = String(
          (error as { payload?: { errorCode?: unknown } })?.payload?.errorCode || ""
        );
        if (errorCode !== "BROWSER_CHECKPOINT_GIT_CONFLICT") throw error;
        recoveryConflict = error instanceof Error ? error : new Error(String(error));
        publishStatus({
          phase: "error",
          message: `${recoveryConflict.message} Use Restore from Git to discard the browser copy.`,
          localRevision: storedCheckpoint.workingRevision,
          gitRevision: started.baselineRevision
        });
      }
    }
  }

  const heartbeatEvery = Math.max(2000, Math.floor(Number(started.leaseMs || 20000) / 3));
  const heartbeat = win.setInterval(() => {
    void client.postJson("/api/authoring/workspace/heartbeat", {}).catch(() => undefined);
  }, heartbeatEvery);

  const discard = () => {
    void client.postJson("/api/authoring/workspace/discard", {
      sessionId: started.sessionId
    }).catch(() => undefined);
  };
  win.addEventListener("pagehide", discard);

  async function performSync(): Promise<WorkspaceResponse | null> {
    if (recoveryConflict) throw recoveryConflict;
    const checkpoint = await checkpointStore.read();
    if (!checkpoint) {
      publishStatus({
        phase: "synced",
        message: "Git is up to date",
        localRevision: started.baselineRevision,
        gitRevision: started.baselineRevision
      });
      return null;
    }
    publishStatus({
      phase: "syncing",
      message: "Saved on this browser · syncing to Git…",
      localRevision: checkpoint.workingRevision,
      gitRevision: checkpoint.gitContentRevision
    });
    try {
      const synced = await client.postJson<WorkspaceResponse, {
        idempotencyKey: string;
        checkpointRevision: string;
      }>("/api/authoring/workspace/save", {
        idempotencyKey: idempotencyKey(),
        checkpointRevision: checkpoint.workingRevision
      });
      const latest = await checkpointStore.read();
      if (latest) {
        const updated = {
          ...latest,
          gitContentRevision: String(
            synced.result?.contentRevision
            || synced.result?.release?.contentRevision
            || synced.syncedRevision
            || checkpoint.workingRevision
          ),
          gitReleaseRevision: String(synced.result?.release?.releaseRevision || "")
        };
        await checkpointStore.write(updated);
        publishStatus(statusForLocalCheckpoint(updated));
        if (updated.workingRevision !== checkpoint.workingRevision) syncAgain = true;
      }
      return synced;
    } catch (error) {
      const errorCode = String(
        (error as { payload?: { errorCode?: unknown } })?.payload?.errorCode || ""
      );
      if (errorCode === "LOCAL_CHECKPOINT_REVISION_STALE") {
        syncAgain = true;
        return null;
      }
      publishStatus({
        phase: "error",
        message: `Saved on this browser · Git sync failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
        localRevision: checkpoint.workingRevision,
        gitRevision: checkpoint.gitContentRevision
      });
      throw error;
    }
  }

  function syncNow(): Promise<WorkspaceResponse | null> {
    if (syncPromise) return syncPromise;
    syncPromise = (async () => {
      let result: WorkspaceResponse | null;
      do {
        syncAgain = false;
        result = await performSync();
      } while (syncAgain);
      return result;
    })().finally(() => {
      syncPromise = null;
    });
    return syncPromise;
  }

  const workspace: LivePrototypeWorkspace = {
    async save() {
      if (recoveryConflict) throw recoveryConflict;
      let checkpointed: WorkspaceResponse;
      try {
        checkpointed = await client.postJson<WorkspaceResponse, Record<string, never>>(
          "/api/authoring/workspace/checkpoint",
          {}
        );
      } catch (error) {
        const errorCode = String(
          (error as { payload?: { errorCode?: unknown } })?.payload?.errorCode || ""
        );
        if (errorCode !== "LIVE_PROTOTYPE_DISABLED") throw error;
        const reconnected = await client.postJson<WorkspaceResponse, Record<string, never>>(
          "/api/authoring/workspace/session",
          {}
        );
        started = { ...started, ...reconnected };
        win.sessionStorage.setItem("pop-party-authoring-session", started.sessionId);
        checkpointed = await client.postJson<WorkspaceResponse, Record<string, never>>(
          "/api/authoring/workspace/checkpoint",
          {}
        );
      }
      if (!checkpointed.checkpoint) {
        throw new Error("The server did not return a browser workspace checkpoint");
      }
      await checkpointStore.write(checkpointed.checkpoint);
      publishStatus({
        phase: "saved-local",
        message: "Saved on this browser · waiting to sync to Git",
        localRevision: checkpointed.checkpoint.workingRevision,
        gitRevision: checkpointed.checkpoint.gitContentRevision
      });
      if (syncPromise) syncAgain = true;
      void syncNow().catch(() => undefined);
      return checkpointed;
    },
    syncNow,
    async restoreFromGit() {
      await client.postJson("/api/authoring/workspace/discard", {
        sessionId: started.sessionId
      });
      await checkpointStore.clear();
      recoveryConflict = null;
      win.sessionStorage.removeItem("pop-party-authoring-session");
      publishStatus({
        phase: "synced",
        message: "Restored from Git",
        localRevision: started.baselineRevision,
        gitRevision: started.baselineRevision
      });
    },
    subscribe(listener) {
      listeners.add(listener);
      listener(status);
      return () => listeners.delete(listener);
    },
    getStatus: () => status,
    dispose() {
      win.clearInterval(heartbeat);
      win.removeEventListener("pagehide", discard);
      discard();
      win.sessionStorage.removeItem("pop-party-authoring-session");
    }
  };
  if (
    storedCheckpoint
    && !recoveryConflict
    && storedCheckpoint.workingRevision !== storedCheckpoint.gitContentRevision
  ) {
    win.setTimeout(() => {
      void syncNow().catch(() => undefined);
    }, 0);
  }
  return workspace;
}
