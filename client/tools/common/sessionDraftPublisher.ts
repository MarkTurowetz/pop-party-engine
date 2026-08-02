import type { JsonObject } from "../../types/game-data";

export interface SessionDraftPublisherOptions {
  postDraft(message: JsonObject): Promise<unknown>;
  savedSnapshot: string;
  hasDraft?: boolean;
  delayMs?: number;
  clearMessage: JsonObject;
  draftMessage: (snapshot: string) => JsonObject;
  onCleared?: () => void;
  onPublished?: () => void;
}

export interface SessionDraftPublisher {
  markSaved(snapshot: string): void;
  schedule(snapshot: string): void;
  publish(snapshot: string, options?: { force?: boolean }): Promise<void>;
  clear(): Promise<void>;
  dispose(options?: { clear?: boolean }): void;
}

interface ActivePublisher {
  flush(): Promise<void>;
  republish(): Promise<void>;
}

const activePublishers = new Set<ActivePublisher>();

function reportAuthoringError(error: unknown): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("pop-party-authoring-error", {
    detail: { message: error instanceof Error ? error.message : String(error) }
  }));
}

function reportAuthoringRecovery(state: "required" | "recovered"): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("pop-party-authoring-recovery", {
    detail: { state }
  }));
}

export async function flushAllSessionDraftPublishers(): Promise<void> {
  await Promise.all([...activePublishers].map(({ flush }) => flush()));
}

export async function republishAllSessionDraftPublishers(): Promise<void> {
  await Promise.all([...activePublishers].map(({ republish }) => republish()));
}

function isRecoveredAuthoringSession(error: unknown): boolean {
  const errorCode = String(
    (error as { payload?: { errorCode?: unknown } })?.payload?.errorCode || ""
  );
  return errorCode === "AUTHORING_SESSION_RECOVERY_REQUIRED";
}

/**
 * Flush only edits that have not reached the live workspace before checkpointing.
 * A full republish is reserved for the explicit server-recovery response, where
 * the browser must reconstruct drafts lost during a server restart.
 */
export async function checkpointSessionDraftPublishers<T>(
  checkpoint: () => Promise<T>
): Promise<T> {
  await flushAllSessionDraftPublishers();
  try {
    return await checkpoint();
  } catch (error) {
    if (!isRecoveredAuthoringSession(error)) throw error;
    reportAuthoringRecovery("required");
    await republishAllSessionDraftPublishers();
    const recovered = await checkpoint();
    reportAuthoringRecovery("recovered");
    return recovered;
  }
}

/**
 * Debounced publisher for unsaved, in-memory tool-data drafts.
 *
 * The draft is intentionally session-scoped: callers use `schedule` while the
 * tool data differs from the saved snapshot, `markSaved` after a durable save,
 * and `dispose({ clear: true })` when the editor session ends.
 */
export function createSessionDraftPublisher(
  options: SessionDraftPublisherOptions
): SessionDraftPublisher {
  let savedSnapshot = options.savedSnapshot;
  let lastPublishedSnapshot = options.hasDraft ? "" : savedSnapshot;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pendingSnapshot: string | null = null;
  const delayMs = Math.max(0, Number(options.delayMs ?? 75));

  function clearTimer(): void {
    if (!timer) return;
    clearTimeout(timer);
    timer = null;
  }

  async function publish(snapshot: string, publishOptions: { force?: boolean } = {}): Promise<void> {
    if (!publishOptions.force && snapshot === lastPublishedSnapshot) return;
    const previousSnapshot = lastPublishedSnapshot;
    lastPublishedSnapshot = snapshot;
    try {
      await options.postDraft(options.draftMessage(snapshot));
    } catch (error) {
      lastPublishedSnapshot = previousSnapshot;
      pendingSnapshot = snapshot;
      throw error;
    }
    options.onPublished?.();
  }

  async function clear(): Promise<void> {
    if (lastPublishedSnapshot === savedSnapshot) return;
    const previousSnapshot = lastPublishedSnapshot;
    lastPublishedSnapshot = savedSnapshot;
    try {
      await options.postDraft(options.clearMessage);
    } catch (error) {
      lastPublishedSnapshot = previousSnapshot;
      pendingSnapshot = savedSnapshot;
      throw error;
    }
    options.onCleared?.();
  }

  const flush = async (): Promise<void> => {
    clearTimer();
    if (pendingSnapshot === null) return;
    const snapshot = pendingSnapshot;
    pendingSnapshot = null;
    await (snapshot === savedSnapshot ? clear() : publish(snapshot));
  };
  const republish = async (): Promise<void> => {
    await flush();
    if (lastPublishedSnapshot === savedSnapshot) return;
    await publish(lastPublishedSnapshot, { force: true });
  };
  const activePublisher = { flush, republish };
  activePublishers.add(activePublisher);

  return {
    markSaved(snapshot) {
      savedSnapshot = snapshot;
      lastPublishedSnapshot = snapshot;
      pendingSnapshot = null;
      clearTimer();
    },
    schedule(snapshot) {
      clearTimer();
      pendingSnapshot = snapshot;
      timer = setTimeout(() => {
        timer = null;
        void flush().catch(reportAuthoringError);
      }, delayMs);
    },
    publish,
    clear,
    dispose(disposeOptions = {}) {
      clearTimer();
      activePublishers.delete(activePublisher);
      if (disposeOptions.clear) void clear().catch(() => undefined);
    }
  };
}
