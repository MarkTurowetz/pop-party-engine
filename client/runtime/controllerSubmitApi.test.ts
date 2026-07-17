import { describe, expect, it, vi } from "vitest";
import { createControllerSubmitApi } from "./controllerSubmitApi";

function setup(state: { playerId?: string; stageCode?: string } | null = { playerId: "p1", stageCode: "ABCD" }) {
  const postJson = vi.fn(async () => ({ ok: true }));
  const api = createControllerSubmitApi({ getControllerState: () => state, postJson });
  return { api, postJson };
}

describe("createControllerSubmitApi (ported)", () => {
  it("join posts without requiring controller state", async () => {
    const { api, postJson } = setup(null);
    await api.join("ABCD", "Ava", "p1");
    expect(postJson).toHaveBeenCalledWith("/api/join", { stageCode: "ABCD", playerName: "Ava", playerId: "p1" });
  });

  it("state-bound calls merge playerId + stageCode into the payload", async () => {
    const { api, postJson } = setup();
    await api.submitChoice("act1", 2, "card9");
    expect(postJson).toHaveBeenCalledWith("/api/controller-choice", {
      playerId: "p1",
      stageCode: "ABCD",
      actionId: "act1",
      cardId: "card9",
      optionIndex: 2
    });
    await api.startOrCancelGame({ isCancel: true, startToken: "tok" });
    expect(postJson).toHaveBeenCalledWith("/api/cancel-start", { playerId: "p1", stageCode: "ABCD", startToken: "tok" });
  });

  it("resolves null without calling postJson when there is no controller state", async () => {
    const { api, postJson } = setup(null);
    expect(await api.heartbeat()).toBe(null);
    expect(await api.updateAvatar("circle")).toBe(null);
    expect(postJson).not.toHaveBeenCalled();
  });

  it("installs the global bridge on import", () => {
    const host = globalThis as typeof globalThis & { createControllerSubmitApi?: unknown };
    expect(host.createControllerSubmitApi).toBeTypeOf("function");
  });

  it("does not expose the removed Present HI THERE endpoint", () => {
    const { api } = setup();
    expect("presentIntro" in api).toBe(false);
  });
});
