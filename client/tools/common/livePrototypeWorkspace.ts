import type { ApiClient } from "../../api/http";
import {
  createWorkspaceCheckpointStore,
  type BrowserWorkspaceCheckpoint,
  type WorkspaceCheckpointStore
} from "./workspaceCheckpointStore";
import { republishAllSessionDraftPublishers } from "./sessionDraftPublisher";

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

export type WorkspaceSyncPhase =
  | "synced"
  | "saved-local"
  | "syncing"
  | "reconnecting"
  | "busy"
  | "conflict"
  | "error";

export interface WorkspaceSyncStatus {
  phase: WorkspaceSyncPhase;
  message: string;
  localRevision: string;
  gitRevision: string;
}

export interface LivePrototypeWorkspace {
  whenAttached(): Promise<void>;
  reconnect(): Promise<void>;
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
  let started: WorkspaceResponse = {
    ok: true,
    active: false,
    sessionId: String(win.sessionStorage.getItem("pop-party-authoring-session") || ""),
    baselineRevision: "",
    localCheckpointRevision: "",
    workingRevision: "",
    gitSynced: false,
    leaseMs: 20_000
  };
  let storedCheckpoint = await checkpointStore.read();
  const listeners = new Set<(status: WorkspaceSyncStatus) => void>();
  let status: WorkspaceSyncStatus = {
    phase: "reconnecting",
    message: "Connecting to the authoring workspace…",
    localRevision: storedCheckpoint?.workingRevision || "",
    gitRevision: storedCheckpoint?.gitContentRevision || ""
  };
  let syncPromise: Promise<WorkspaceResponse | null> | null = null;
  let syncAgain = false;
  let recoveryConflict: Error | null = null;
  let attached = false;
  let disposed = false;
  let reconnectPromise: Promise<void> | null = null;
  let reconnectTimer: number | null = null;
  let reconnectTimerResolve: (() => void) | null = null;
  let heartbeatTimer: number | null = null;
  const attachmentWaiters = new Set<{ resolve(): void; reject(error: unknown): void }>();

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

  function errorCode(error: unknown): string {
    return String((error as { payload?: { errorCode?: unknown; code?: unknown } })?.payload?.errorCode
      || (error as { payload?: { code?: unknown } })?.payload?.code
      || "");
  }

  function errorStatus(error: unknown): number {
    return Number((error as { status?: unknown })?.status || 0);
  }

  function resolveAttachmentWaiters(): void {
    for (const waiter of attachmentWaiters) waiter.resolve();
    attachmentWaiters.clear();
  }

  function rejectAttachmentWaiters(error: unknown): void {
    for (const waiter of attachmentWaiters) waiter.reject(error);
    attachmentWaiters.clear();
  }

  function waitForRetry(milliseconds: number): Promise<void> {
    return new Promise((resolve) => {
      reconnectTimerResolve = resolve;
      reconnectTimer = win.setTimeout(() => {
        reconnectTimer = null;
        reconnectTimerResolve = null;
        resolve();
      }, milliseconds);
    });
  }

  async function restoreBrowserCheckpoint(): Promise<void> {
    if (!storedCheckpoint) return;
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
          phase: "conflict",
          message: `${recoveryConflict.message} Use Restore from Git to discard the browser copy.`,
          localRevision: storedCheckpoint.workingRevision,
          gitRevision: started.baselineRevision
        });
      }
    }
  }

  async function recoverAuthoritativeBrowserModels(): Promise<void> {
    publishStatus({
      phase: "reconnecting",
      message: "Server session restored · republishing browser Art, Layout, and Flow models…",
      localRevision: storedCheckpoint?.workingRevision || started.workingRevision,
      gitRevision: started.baselineRevision
    });
    win.dispatchEvent(new CustomEvent("pop-party-authoring-recovery", {
      detail: { state: "required" }
    }));
    await republishAllSessionDraftPublishers();
    started = {
      ...started,
      recoveryRequired: false
    };
    win.dispatchEvent(new CustomEvent("pop-party-authoring-recovery", {
      detail: { state: "recovered" }
    }));
  }

  function scheduleHeartbeat(): void {
    if (heartbeatTimer !== null) win.clearInterval(heartbeatTimer);
    const heartbeatEvery = Math.max(2000, Math.floor(Number(started.leaseMs || 20_000) / 3));
    heartbeatTimer = win.setInterval(() => {
      void client.postJson<WorkspaceResponse, Record<string, never>>(
        "/api/authoring/workspace/heartbeat",
        {}
      ).then(async (heartbeatState) => {
        started = { ...started, ...heartbeatState };
        if (heartbeatState.recoveryRequired) await recoverAuthoritativeBrowserModels();
      }).catch((error) => {
        const code = errorCode(error);
        if (code === "AUTHORING_SESSION_STALE" || code === "AUTHORING_SESSION_BUSY" || !errorStatus(error)) {
          void reconnect(code === "AUTHORING_SESSION_BUSY" ? "busy" : "stale").catch(() => undefined);
          return;
        }
        publishStatus({
          phase: "error",
          message: error instanceof Error ? error.message : String(error),
          localRevision: storedCheckpoint?.workingRevision || started.workingRevision,
          gitRevision: started.baselineRevision
        });
      });
    }, heartbeatEvery);
  }

  async function attach(resuming: boolean): Promise<boolean> {
    let sessionAccepted = false;
    try {
      let response = await client.postJson<WorkspaceResponse, Record<string, never>>(
        "/api/authoring/workspace/session",
        {}
      );
      sessionAccepted = true;
      started = { ...started, ...response };
      win.sessionStorage.setItem("pop-party-authoring-session", started.sessionId);
      if (started.recoveryRequired && !storedCheckpoint && !resuming) {
        await client.postJson("/api/authoring/workspace/discard", {
          sessionId: started.sessionId,
          resetRooms: false
        });
        win.sessionStorage.removeItem("pop-party-authoring-session");
        response = await client.postJson<WorkspaceResponse, Record<string, never>>(
          "/api/authoring/workspace/session",
          {}
        );
        sessionAccepted = true;
        started = { ...started, ...response };
        win.sessionStorage.setItem("pop-party-authoring-session", started.sessionId);
      }
      await restoreBrowserCheckpoint();
      if (started.recoveryRequired && resuming && !recoveryConflict) {
        await recoverAuthoritativeBrowserModels();
      }
      attached = true;
      scheduleHeartbeat();
      if (!recoveryConflict) {
        publishStatus(storedCheckpoint
          ? statusForLocalCheckpoint(storedCheckpoint)
          : {
              phase: "synced",
              message: "Git is up to date",
              localRevision: started.localCheckpointRevision || started.workingRevision,
              gitRevision: started.baselineRevision
            });
      }
      if (!recoveryConflict) resolveAttachmentWaiters();
      return true;
    } catch (error) {
      const code = errorCode(error);
      if (errorStatus(error) === 404) throw error;
      attached = false;
      if (code === "AUTHORING_SESSION_BUSY") {
        publishStatus({
          phase: "busy",
          message: "Another Tools tab is editing. This tab is read-only and will reconnect automatically when that session closes.",
          localRevision: storedCheckpoint?.workingRevision || started.workingRevision,
          gitRevision: started.baselineRevision
        });
        return false;
      }
      if (code !== "AUTHORING_SESSION_STALE" && errorStatus(error) > 0) {
        if (!sessionAccepted) throw error;
        attached = true;
        scheduleHeartbeat();
        publishStatus({
          phase: "error",
          message: error instanceof Error ? error.message : String(error),
          localRevision: storedCheckpoint?.workingRevision || started.workingRevision,
          gitRevision: started.baselineRevision
        });
        resolveAttachmentWaiters();
        return true;
      }
      publishStatus({
        phase: "reconnecting",
        message: "Authoring connection interrupted · reconnecting without discarding browser work…",
        localRevision: storedCheckpoint?.workingRevision || started.workingRevision,
        gitRevision: started.baselineRevision
      });
      return false;
    }
  }

  async function reconnect(reason = "stale"): Promise<void> {
    if (disposed) throw new Error("The authoring workspace is closed");
    if (attached && reason !== "stale") return;
    if (reconnectPromise) return reconnectPromise;
    reconnectPromise = (async () => {
      attached = false;
      if (heartbeatTimer !== null) {
        win.clearInterval(heartbeatTimer);
        heartbeatTimer = null;
      }
      publishStatus({
        phase: reason === "busy" ? "busy" : "reconnecting",
        message: reason === "busy"
          ? "Another Tools tab is editing. This tab is read-only and will reconnect automatically when that session closes."
          : "Authoring session changed · reconnecting and preserving browser work…",
        localRevision: storedCheckpoint?.workingRevision || started.workingRevision,
        gitRevision: started.baselineRevision
      });
      while (!disposed) {
        if (await attach(true)) return;
        await waitForRetry(Math.max(1000, Math.min(5000, Math.floor(Number(started.leaseMs || 6000) / 3))));
      }
      throw new Error("The authoring workspace was closed before reconnecting");
    })().finally(() => {
      reconnectPromise = null;
    });
    return reconnectPromise;
  }

  async function whenAttached(): Promise<void> {
    if (attached && !recoveryConflict) return;
    if (disposed) throw new Error("The authoring workspace is closed");
    return new Promise((resolve, reject) => {
      attachmentWaiters.add({ resolve, reject });
    });
  }

  const discard = () => {
    if (!attached) return;
    void client.postJson("/api/authoring/workspace/discard", {
      sessionId: started.sessionId,
      resetRooms: false
    }).catch(() => undefined);
  };
  win.addEventListener("pagehide", discard);

  async function performSync(): Promise<WorkspaceResponse | null> {
    if (recoveryConflict) throw recoveryConflict;
    if (!attached) await whenAttached();
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
    whenAttached,
    reconnect: () => reconnect("stale"),
    async save() {
      if (recoveryConflict) throw recoveryConflict;
      await whenAttached();
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
        sessionId: started.sessionId,
        resetRooms: true
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
      disposed = true;
      if (heartbeatTimer !== null) win.clearInterval(heartbeatTimer);
      if (reconnectTimer !== null) {
        win.clearTimeout(reconnectTimer);
        reconnectTimer = null;
        reconnectTimerResolve?.();
        reconnectTimerResolve = null;
      }
      win.removeEventListener("pagehide", discard);
      discard();
      rejectAttachmentWaiters(new Error("The authoring workspace is closed"));
      client.setMutationRecoveryHandler?.(null);
      win.sessionStorage.removeItem("pop-party-authoring-session");
    }
  };
  client.setMutationRecoveryHandler?.(async () => {
    await reconnect("stale");
  });
  try {
    if (!await attach(false)) void reconnect("busy").catch(() => undefined);
  } catch (error) {
    if (errorStatus(error) === 404) {
      win.sessionStorage.removeItem("pop-party-authoring-session");
      client.setMutationRecoveryHandler?.(null);
      win.removeEventListener("pagehide", discard);
      return null;
    }
    void reconnect("stale").catch(() => undefined);
  }
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
