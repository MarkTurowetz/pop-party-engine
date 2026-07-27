import type { ApiClient } from "../../api/http";

interface WorkspaceResponse {
  ok: boolean;
  active: boolean;
  sessionId: string;
  workingRevision: string;
  leaseMs: number;
}

export interface LivePrototypeWorkspace {
  save(): Promise<WorkspaceResponse>;
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
  win: Window = window
): Promise<LivePrototypeWorkspace | null> {
  let started: WorkspaceResponse;
  try {
    started = await client.postJson<WorkspaceResponse, Record<string, never>>(
      "/api/authoring/workspace/session",
      {}
    );
  } catch (error) {
    const status = Number((error as { status?: unknown })?.status || 0);
    if (status === 404) return null;
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

  return {
    save: () => client.postJson("/api/authoring/workspace/save", {
      idempotencyKey: idempotencyKey()
    }),
    dispose() {
      win.clearInterval(heartbeat);
      win.removeEventListener("pagehide", discard);
      discard();
      win.sessionStorage.removeItem("pop-party-authoring-session");
    }
  };
}
