import type { ApiClient } from "../../api/http";
import {
  createWorkspaceCheckpointStore,
  type BrowserWorkspaceCheckpoint,
  type WorkspaceCheckpointStore
} from "./workspaceCheckpointStore";
import {
  activeSessionDraftPublisherCount,
  republishAllSessionDraftPublishers
} from "./sessionDraftPublisher";

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
  | "offline"
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
  exportBrowserCheckpoint(): Promise<void>;
  subscribe(listener: (status: WorkspaceSyncStatus) => void): () => void;
  getStatus(): WorkspaceSyncStatus;
  dispose(): void;
}

interface AuthoringConnectionDiagnostic {
  sequence: number;
  at: string;
  event: string;
  phase: WorkspaceSyncPhase;
  attached: boolean;
  request?: "heartbeat" | "session";
  trigger?: string;
  attempt?: number;
  durationMs?: number;
}

interface AuthoringDiagnosticsWindow extends Window {
  __popPartyAuthoringDiagnostics?: {
    phase: WorkspaceSyncPhase;
    attached: boolean;
    reconnectAttempts: number;
    lastEvent: AuthoringConnectionDiagnostic;
    events: AuthoringConnectionDiagnostic[];
  };
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
  let heartbeatPromise: Promise<void> | null = null;
  let foregroundGeneration = 0;
  let lastForegroundSignalAt = 0;
  let lastForegroundSignature = "";
  let reconnectAttempts = 0;
  let diagnosticSequence = 0;
  let activeControlRequest: {
    controller: AbortController;
    request: "heartbeat" | "session";
    startedAt: number;
    trigger: string;
  } | null = null;
  const attachmentWaiters = new Set<{ resolve(): void; reject(error: unknown): void }>();

  function recordConnectionEvent(
    event: string,
    details: Omit<Partial<AuthoringConnectionDiagnostic>, "sequence" | "at" | "event" | "phase" | "attached"> = {}
  ): void {
    const entry: AuthoringConnectionDiagnostic = {
      sequence: ++diagnosticSequence,
      at: new Date().toISOString(),
      event,
      phase: status.phase,
      attached,
      ...details
    };
    const target = win as AuthoringDiagnosticsWindow;
    const events = [...(target.__popPartyAuthoringDiagnostics?.events || []), entry].slice(-40);
    target.__popPartyAuthoringDiagnostics = {
      phase: status.phase,
      attached,
      reconnectAttempts,
      lastEvent: entry,
      events
    };
  }

  function publishStatus(next: WorkspaceSyncStatus): void {
    if (recoveryConflict && next.phase !== "conflict") {
      recordConnectionEvent("status-suppressed-by-conflict", { trigger: next.phase });
      return;
    }
    status = next;
    recordConnectionEvent("status");
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
    recordConnectionEvent("reconnect-wait", { durationMs: milliseconds });
    return new Promise((resolve) => {
      reconnectTimerResolve = resolve;
      reconnectTimer = win.setTimeout(() => {
        reconnectTimer = null;
        reconnectTimerResolve = null;
        resolve();
      }, milliseconds);
    });
  }

  function wakeReconnectRetry(trigger: string): boolean {
    if (reconnectTimer === null) return false;
    win.clearTimeout(reconnectTimer);
    reconnectTimer = null;
    const resolve = reconnectTimerResolve;
    reconnectTimerResolve = null;
    recordConnectionEvent("reconnect-wake", { trigger });
    resolve?.();
    return true;
  }

  function controlRequestTimeoutMs(): number {
    return Math.max(2000, Math.min(10_000, Math.floor(Number(started.leaseMs || 20_000) / 2)));
  }

  async function postControlRequest(
    path: "/api/authoring/workspace/heartbeat" | "/api/authoring/workspace/session",
    request: "heartbeat" | "session",
    trigger: string
  ): Promise<WorkspaceResponse> {
    const controller = new AbortController();
    const token = { controller, request, startedAt: Date.now(), trigger };
    activeControlRequest = token;
    const timeoutMs = controlRequestTimeoutMs();
    const timeout = win.setTimeout(() => {
      if (controller.signal.aborted) return;
      token.trigger = "timeout";
      recordConnectionEvent("control-timeout", { request, trigger: "timeout", durationMs: timeoutMs });
      controller.abort();
    }, timeoutMs);
    recordConnectionEvent("control-start", { request, trigger });
    try {
      const response = await client.postJson<WorkspaceResponse, Record<string, never>>(
        path,
        {},
        { signal: controller.signal }
      );
      recordConnectionEvent("control-success", {
        request,
        trigger,
        durationMs: Date.now() - token.startedAt
      });
      return response;
    } catch (error) {
      recordConnectionEvent(controller.signal.aborted ? "control-abort" : "control-failure", {
        request,
        trigger: token.trigger,
        durationMs: Date.now() - token.startedAt
      });
      throw error;
    } finally {
      win.clearTimeout(timeout);
      if (activeControlRequest === token) activeControlRequest = null;
    }
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
          message: `${recoveryConflict.message} Download Browser Copy before using Restore from Git.`,
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
    const recovered = await client.postJson<WorkspaceResponse, Record<string, never>>(
      "/api/authoring/workspace/complete-recovery",
      {}
    );
    started = { ...started, ...recovered };
    if (started.recoveryRequired) throw new Error("The server did not confirm authoring recovery");
    publishStatus(storedCheckpoint
      ? statusForLocalCheckpoint(storedCheckpoint)
      : {
          phase: started.gitSynced ? "synced" : "saved-local",
          message: started.gitSynced
            ? "Browser work recovered · Git is up to date"
            : "Browser work recovered · Save All to checkpoint before Git sync",
          localRevision: started.localCheckpointRevision || started.workingRevision,
          gitRevision: started.baselineRevision
        });
    win.dispatchEvent(new CustomEvent("pop-party-authoring-recovery", {
      detail: { state: "recovered" }
    }));
  }

  function heartbeatNow(trigger = "interval"): Promise<void> {
    if (disposed || !attached) return Promise.resolve();
    if (heartbeatPromise) return heartbeatPromise;
    heartbeatPromise = postControlRequest(
      "/api/authoring/workspace/heartbeat",
      "heartbeat",
      trigger
    ).then(async (heartbeatState) => {
        started = { ...started, ...heartbeatState };
        if (heartbeatState.recoveryRequired) await recoverAuthoritativeBrowserModels();
      }).catch((error) => {
        const code = errorCode(error);
        if (code === "AUTHORING_SESSION_STALE" || code === "AUTHORING_SESSION_BUSY" || !errorStatus(error)) {
          const reason = code === "AUTHORING_SESSION_BUSY"
            ? "busy"
            : !errorStatus(error) ? "transport" : "stale";
          void reconnect(reason).catch(() => undefined);
          return;
        }
        publishStatus({
          phase: "error",
          message: error instanceof Error ? error.message : String(error),
          localRevision: storedCheckpoint?.workingRevision || started.workingRevision,
          gitRevision: started.baselineRevision
        });
      }).finally(() => {
        heartbeatPromise = null;
      });
    return heartbeatPromise;
  }

  function scheduleHeartbeat(): void {
    if (heartbeatTimer !== null) win.clearInterval(heartbeatTimer);
    const heartbeatEvery = Math.max(2000, Math.floor(Number(started.leaseMs || 20_000) / 3));
    heartbeatTimer = win.setInterval(() => {
      void heartbeatNow();
    }, heartbeatEvery);
  }

  async function attach(resuming: boolean): Promise<boolean> {
    let sessionAccepted = false;
    try {
      let response = await postControlRequest(
        "/api/authoring/workspace/session",
        "session",
        resuming ? "reconnect" : "initial"
      );
      sessionAccepted = true;
      started = { ...started, ...response };
      win.sessionStorage.setItem("pop-party-authoring-session", started.sessionId);
      if (
        started.recoveryRequired
        && !storedCheckpoint
        && (!resuming || activeSessionDraftPublisherCount() === 0)
      ) {
        await client.postJson("/api/authoring/workspace/discard", {
          sessionId: started.sessionId,
          resetRooms: false
        });
        win.sessionStorage.removeItem("pop-party-authoring-session");
        response = await postControlRequest(
          "/api/authoring/workspace/session",
          "session",
          "clean-restart"
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
      const transportFailure = !errorStatus(error);
      publishStatus({
        phase: transportFailure ? "offline" : "reconnecting",
        message: transportFailure
          ? "Authoring service unavailable or offline · browser work preserved; retrying…"
          : "Authoring connection interrupted · reconnecting without discarding browser work…",
        localRevision: storedCheckpoint?.workingRevision || started.workingRevision,
        gitRevision: started.baselineRevision
      });
      return false;
    }
  }

  async function reconnect(reason: "stale" | "busy" | "transport" = "stale"): Promise<void> {
    if (disposed) throw new Error("The authoring workspace is closed");
    if (reconnectPromise) return reconnectPromise;
    reconnectPromise = (async () => {
      attached = false;
      if (heartbeatTimer !== null) {
        win.clearInterval(heartbeatTimer);
        heartbeatTimer = null;
      }
      const reconnectPhase = reason === "busy"
        ? "busy"
        : reason === "transport" ? "offline" : "reconnecting";
      publishStatus({
        phase: reconnectPhase,
        message: reason === "busy"
          ? "Another Tools tab is editing. This tab is read-only and will reconnect automatically when that session closes."
          : reason === "transport"
            ? "Authoring service unavailable or offline · browser work preserved; retrying…"
            : "Authoring session changed · reconnecting and preserving browser work…",
        localRevision: storedCheckpoint?.workingRevision || started.workingRevision,
        gitRevision: started.baselineRevision
      });
      while (!disposed) {
        const attemptGeneration = foregroundGeneration;
        reconnectAttempts += 1;
        recordConnectionEvent("reconnect-attempt", {
          attempt: reconnectAttempts,
          trigger: reason
        });
        if (await attach(true)) return;
        if (foregroundGeneration !== attemptGeneration) {
          recordConnectionEvent("reconnect-immediate-retry", {
            attempt: reconnectAttempts,
            trigger: "foreground"
          });
          continue;
        }
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
  const resumeConnection = (trigger: "focus" | "visible" | "online") => {
    if (disposed) return;
    const signaledAt = Date.now();
    const signature = `${attached}:${status.phase}`;
    const activeNeedsDifferentSignal = Boolean(
      activeControlRequest
      && !activeControlRequest.controller.signal.aborted
      && activeControlRequest.trigger !== trigger
    );
    if (
      signaledAt - lastForegroundSignalAt < 250
      && signature === lastForegroundSignature
      && !activeNeedsDifferentSignal
      && reconnectTimer === null
    ) {
      recordConnectionEvent("foreground-coalesced", { trigger });
      return;
    }
    lastForegroundSignalAt = signaledAt;
    lastForegroundSignature = signature;
    foregroundGeneration += 1;
    recordConnectionEvent("foreground-resume", { trigger });
    wakeReconnectRetry(trigger);
    if (activeControlRequest && !activeControlRequest.controller.signal.aborted) {
      recordConnectionEvent("foreground-joined-control", {
        request: activeControlRequest.request,
        trigger
      });
      return;
    }
    if (attached) void heartbeatNow(trigger);
    else void reconnect(status.phase === "offline" ? "transport" : "stale").catch(() => undefined);
  };
  const resumeVisibleHeartbeat = () => {
    if (win.document?.visibilityState === "hidden") return;
    resumeConnection("visible");
  };
  win.addEventListener("pagehide", discard);
  const resumeFocusedHeartbeat = () => resumeConnection("focus");
  const resumeOnlineHeartbeat = () => resumeConnection("online");
  win.addEventListener("focus", resumeFocusedHeartbeat);
  win.addEventListener("online", resumeOnlineHeartbeat);
  win.document?.addEventListener("visibilitychange", resumeVisibleHeartbeat);

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
    async exportBrowserCheckpoint() {
      const checkpoint = await checkpointStore.read();
      if (!checkpoint) throw new Error("No browser workspace checkpoint is available to download");
      const blob = new Blob([JSON.stringify(checkpoint, null, 2)], { type: "application/json" });
      const href = URL.createObjectURL(blob);
      const anchor = win.document.createElement("a");
      anchor.href = href;
      anchor.download = `${checkpoint.gameId || "pop-party"}-browser-checkpoint-${checkpoint.workingRevision.slice(0, 12)}.json`;
      anchor.click();
      URL.revokeObjectURL(href);
      recordConnectionEvent("checkpoint-exported");
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
      win.removeEventListener("focus", resumeFocusedHeartbeat);
      win.removeEventListener("online", resumeOnlineHeartbeat);
      win.document?.removeEventListener("visibilitychange", resumeVisibleHeartbeat);
      if (activeControlRequest && !activeControlRequest.controller.signal.aborted) {
        activeControlRequest.trigger = "dispose";
        activeControlRequest.controller.abort();
      }
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
    if (!await attach(false)) {
      const reason = status.phase === "busy" ? "busy" : status.phase === "offline" ? "transport" : "stale";
      void reconnect(reason).catch(() => undefined);
    }
  } catch (error) {
    if (errorStatus(error) === 404) {
      win.sessionStorage.removeItem("pop-party-authoring-session");
      client.setMutationRecoveryHandler?.(null);
      win.removeEventListener("pagehide", discard);
      win.removeEventListener("focus", resumeFocusedHeartbeat);
      win.removeEventListener("online", resumeOnlineHeartbeat);
      win.document?.removeEventListener("visibilitychange", resumeVisibleHeartbeat);
      return null;
    }
    void reconnect(!errorStatus(error) ? "transport" : "stale").catch(() => undefined);
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
