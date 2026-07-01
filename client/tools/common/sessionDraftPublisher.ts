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
  const delayMs = Math.max(0, Number(options.delayMs ?? 75));

  function clearTimer(): void {
    if (!timer) return;
    clearTimeout(timer);
    timer = null;
  }

  async function publish(snapshot: string, publishOptions: { force?: boolean } = {}): Promise<void> {
    if (!publishOptions.force && snapshot === lastPublishedSnapshot) return;
    lastPublishedSnapshot = snapshot;
    await options.postDraft(options.draftMessage(snapshot));
    options.onPublished?.();
  }

  async function clear(): Promise<void> {
    if (lastPublishedSnapshot === savedSnapshot) return;
    lastPublishedSnapshot = savedSnapshot;
    await options.postDraft(options.clearMessage);
    options.onCleared?.();
  }

  return {
    markSaved(snapshot) {
      savedSnapshot = snapshot;
      lastPublishedSnapshot = snapshot;
      clearTimer();
    },
    schedule(snapshot) {
      clearTimer();
      timer = setTimeout(() => {
        timer = null;
        const action = snapshot === savedSnapshot ? clear() : publish(snapshot);
        void action.catch(() => undefined);
      }, delayMs);
    },
    publish,
    clear,
    dispose(disposeOptions = {}) {
      clearTimer();
      if (disposeOptions.clear) void clear().catch(() => undefined);
    }
  };
}
