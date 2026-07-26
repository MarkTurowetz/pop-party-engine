import { describe, expect, it, vi } from "vitest";
import { beginLivePrototypeWorkspace, requestLivePrototypeSave } from "./livePrototypeWorkspace";
import type { ApiClient } from "../../api/http";

describe("live prototype browser workspace", () => {
  it("stores the server session, heartbeats, saves, and discards on teardown", async () => {
    const postJson = vi.fn(async (path: string) => {
      if (path.endsWith("/session")) {
        return {
          ok: true,
          active: true,
          sessionId: "session-one",
          workingRevision: "revision-one",
          leaseMs: 6000
        };
      }
      return { ok: true };
    });
    const storage = new Map<string, string>();
    const listeners = new Map<string, EventListener>();
    const win = {
      sessionStorage: {
        getItem: (key: string) => storage.get(key) || null,
        setItem: (key: string, value: string) => storage.set(key, value),
        removeItem: (key: string) => storage.delete(key)
      },
      setInterval: vi.fn(() => 7),
      clearInterval: vi.fn(),
      addEventListener: vi.fn((type: string, listener: EventListener) => listeners.set(type, listener)),
      removeEventListener: vi.fn(),
      globalSaveButton: { click: vi.fn() }
    } as unknown as Window & { globalSaveButton: { click(): void } };
    const workspace = await beginLivePrototypeWorkspace({ postJson } as unknown as ApiClient, win);
    expect(storage.get("pop-party-authoring-session")).toBe("session-one");
    expect(requestLivePrototypeSave(win)).toBe(true);
    expect(win.globalSaveButton.click).toHaveBeenCalledTimes(1);
    await workspace?.save();
    workspace?.dispose();
    expect(postJson.mock.calls.map(([path]) => path)).toEqual([
      "/api/authoring/workspace/session",
      "/api/authoring/workspace/save",
      "/api/authoring/workspace/discard"
    ]);
    expect(storage.has("pop-party-authoring-session")).toBe(false);
  });
});
