import type { JsonObject } from "../../types/game-data";

export interface SessionDraftLifecycleOptions {
  document?: Document;
  clearMessage: JsonObject;
  postDraft(message: JsonObject): Promise<unknown>;
  resetOnMount?: boolean;
}

export interface SessionDraftLifecycle {
  clear(): Promise<unknown>;
  dispose(): void;
}

export async function installSessionDraftLifecycle(
  options: SessionDraftLifecycleOptions
): Promise<SessionDraftLifecycle> {
  const doc = options.document || document;
  const win = doc.defaultView || window;
  const body = JSON.stringify(options.clearMessage);
  const clear = () => options.postDraft(options.clearMessage).catch(() => undefined);

  if (options.resetOnMount !== false) await clear();

  const clearOnPageHide = () => {
    if (win.navigator?.sendBeacon) {
      const blob = new Blob([body], { type: "application/json" });
      win.navigator.sendBeacon("/api/tool-drafts", blob);
      return;
    }
    void fetch("/api/tool-drafts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true
    }).catch(() => undefined);
  };

  win.addEventListener("pagehide", clearOnPageHide);

  return {
    clear,
    dispose() {
      win.removeEventListener("pagehide", clearOnPageHide);
      void clear();
    }
  };
}
